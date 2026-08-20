import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireUser, sessionExpiry, userFromToken } from './lib/auth';
import { toPublicUser } from './lib/serialize';

/**
 * Password hashing note.
 *
 * Express used bcrypt. bcrypt is a native module and cannot run inside a Convex
 * query or mutation, which execute in a V8 isolate. The options were a Node action
 * (an extra network hop on every login, and actions cannot write transactionally)
 * or a pure-JS KDF that runs in the isolate. This uses PBKDF2 via Web Crypto,
 * which is available in the isolate and is a legitimate password KDF.
 *
 * Existing bcrypt hashes from the SQLite database will not verify against this.
 * Anyone migrating real accounts has to force a password reset.
 */

const PBKDF2_ITERATIONS = 210_000; // OWASP 2023 guidance for PBKDF2-SHA512
const SALT_BYTES = 16;

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, saltHex?: string): Promise<string> {
  const salt = saltHex
    ? Uint8Array.from(saltHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)))
    : crypto.getRandomValues(new Uint8Array(SALT_BYTES));

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-512' },
    key,
    512,
  );

  const saltOut = saltHex ?? toHex(salt.buffer as ArrayBuffer);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${saltOut}$${toHex(bits)}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, , saltHex] = stored.split('$');
  if (scheme !== 'pbkdf2' || !saltHex) return false;
  const candidate = await hashPassword(password, saltHex);
  // Constant-time-ish: compare full strings of equal length rather than bailing early.
  if (candidate.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ stored.charCodeAt(i);
  }
  return diff === 0;
}

function newToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer);
}

const DEFAULT_SETTINGS = {
  theme: 'dark' as const,
  dmPrivacy: 'EVERYONE' as const,
  discoverable: true,
  showCourses: true,
  showRealName: true,
};

export const register = mutation({
  args: {
    email: v.string(),
    username: v.string(),
    displayName: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase();

    if (args.password.length < 8)
      throw new Error('BAD_REQUEST: Password must be at least 8 characters');
    if (!/^[a-z0-9_]{3,24}$/.test(args.username)) {
      throw new Error(
        'BAD_REQUEST: Username must be 3-24 lowercase letters, numbers or underscores',
      );
    }

    // Convex has no UNIQUE constraint, so both are checked by hand.
    const emailTaken = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();
    if (emailTaken) throw new Error('CONFLICT: That email is already registered. Sign in instead.');

    const usernameTaken = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', args.username))
      .unique();
    if (usernameTaken) throw new Error('CONFLICT: That username is taken. Pick another.');

    const now = Date.now();
    const userId = await ctx.db.insert('users', {
      email,
      username: args.username,
      displayName: args.displayName,
      passwordHash: await hashPassword(args.password),
      karma: 0,
      settings: DEFAULT_SETTINGS,
      isAdmin: false,
      lastSeenAt: now,
      // No mail service runs here, so verification is granted on creation. The field
      // stays so a real flow can replace this one line.
      verifiedAt: now,
    });

    const token = newToken();
    await ctx.db.insert('sessions', { userId, token, expiresAt: sessionExpiry(now) });

    const user = (await ctx.db.get(userId))!;
    return { token, user: toPublicUser(user, null, true) };
  },
});

export const login = mutation({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email.toLowerCase()))
      .unique();

    // Same message either way — otherwise login doubles as an account-existence oracle.
    const invalid = new Error("BAD_REQUEST: That email and password don't match");
    if (!user || user.deletedAt) throw invalid;
    if (!(await verifyPassword(args.password, user.passwordHash))) throw invalid;

    const now = Date.now();
    const token = newToken();
    await ctx.db.insert('sessions', { userId: user._id, token, expiresAt: sessionExpiry(now) });
    await ctx.db.patch(user._id, { lastSeenAt: now });

    const major = user.majorId ? await ctx.db.get(user.majorId) : null;
    return { token, user: toPublicUser(user, major, true) };
  },
});

export const logout = mutation({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!args.token) return null;
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_token', (q) => q.eq('token', args.token!))
      .unique();
    if (session) await ctx.db.delete(session._id);
    return null;
  },
});

/** Reactive: the client re-renders automatically when the profile changes. */
export const me = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.token);
    if (!user) return null;

    const major = user.majorId ? await ctx.db.get(user.majorId) : null;
    return {
      ...toPublicUser(user, major, true),
      email: user.email,
      bio: user.bio ?? null,
      settings: user.settings,
      onboardedAt: user.onboardedAt ?? null,
      isAdmin: user.isAdmin,
    };
  },
});

export const updateProfile = mutation({
  args: {
    token: v.string(),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    pronouns: v.optional(v.string()),
    settings: v.optional(
      v.object({
        theme: v.optional(v.union(v.literal('dark'), v.literal('light'))),
        dmPrivacy: v.optional(
          v.union(v.literal('EVERYONE'), v.literal('SHARED_SPACE_ONLY'), v.literal('NOBODY')),
        ),
        discoverable: v.optional(v.boolean()),
        showCourses: v.optional(v.boolean()),
        showRealName: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    await ctx.db.patch(user._id, {
      ...(args.displayName !== undefined ? { displayName: args.displayName } : {}),
      ...(args.bio !== undefined ? { bio: args.bio } : {}),
      ...(args.pronouns !== undefined ? { pronouns: args.pronouns } : {}),
      ...(args.settings ? { settings: { ...user.settings, ...args.settings } } : {}),
    });
    return null;
  },
});

/** Heartbeat. Replaces the socket connection that used to imply presence. */
export const heartbeat = mutation({
  args: { token: v.string(), typingInChannel: v.optional(v.id('channels')) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const now = Date.now();

    const existing = await ctx.db
      .query('presence')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .unique();

    const patch = {
      lastSeenAt: now,
      typingInChannel: args.typingInChannel,
      typingUpdatedAt: args.typingInChannel ? now : undefined,
    };

    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert('presence', { userId: user._id, ...patch });
    return null;
  },
});
