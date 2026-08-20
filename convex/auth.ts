import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { requireUser, sessionExpiry, userFromToken } from './lib/auth';
import { assertPasswordOk, hashPassword, newToken, verifyPassword } from './lib/password';
import { toPublicUser } from './lib/serialize';

/**
 * Authentication.
 *
 * Password hashing moved to lib/password.ts so first-run setup and admin-issued
 * resets share one KDF. Everything else here is the session lifecycle.
 */

const DEFAULT_SETTINGS = {
  theme: 'light' as const,
  dmPrivacy: 'EVERYONE' as const,
  discoverable: true,
  showCourses: true,
  showRealName: true,
};

/** The single instanceConfig row, or null before first-run setup. */
async function loadConfig(ctx: QueryCtx | MutationCtx) {
  return ctx.db.query('instanceConfig').first();
}

/**
 * Email-domain gate.
 *
 * The IT administrator lists the domains their institution issues. An empty list
 * means the instance is open, which is the sane default for a demo but is not what
 * a real campus would run.
 */
export async function assertEmailAllowed(ctx: MutationCtx, email: string): Promise<void> {
  const config = await loadConfig(ctx);
  const domains = config?.allowedEmailDomains ?? [];
  if (!domains.length) return;

  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain || !domains.includes(domain)) {
    const list = domains.map((d) => `@${d}`).join(', ');
    throw new Error(`BAD_REQUEST: Use your school email. This campus accepts ${list}.`);
  }
}

export const register = mutation({
  args: {
    email: v.string(),
    username: v.string(),
    displayName: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await loadConfig(ctx);
    if (!config) throw new Error('BAD_REQUEST: This campus has not been set up yet.');
    if (!config.allowSelfRegistration) {
      throw new Error('FORBIDDEN: Registration is closed. Ask your campus IT team for an account.');
    }

    const email = args.email.toLowerCase();
    await assertEmailAllowed(ctx, email);

    assertPasswordOk(args.password);
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
  args: { email: v.string(), password: v.string(), adminOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email.toLowerCase()))
      .unique();

    // Same message either way — otherwise login doubles as an account-existence oracle.
    const invalid = new Error("BAD_REQUEST: That email and password don't match");
    if (!user || user.deletedAt) throw invalid;
    if (!(await verifyPassword(args.password, user.passwordHash))) throw invalid;

    if (user.suspendedAt) {
      throw new Error(
        `FORBIDDEN: This account is suspended.${user.suspendedReason ? ` ${user.suspendedReason}` : ''}`,
      );
    }

    // The admin door is a different door, not a different password. Someone who
    // signs in there without the flag gets told plainly rather than silently
    // dropped onto the student app.
    if (args.adminOnly && !user.isAdmin) {
      throw new Error('FORBIDDEN: That account does not have administrator access.');
    }

    const now = Date.now();
    const token = newToken();
    await ctx.db.insert('sessions', { userId: user._id, token, expiresAt: sessionExpiry(now) });
    await ctx.db.patch(user._id, { lastSeenAt: now });

    const major = user.majorId ? await ctx.db.get(user.majorId) : null;
    return { token, user: toPublicUser(user, major, true), isAdmin: user.isAdmin };
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
      mustChangePassword: user.mustChangePassword ?? false,
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

/** Signed-in password change. Requires the current password — an active session is
 *  not proof that the person at the keyboard is the account holder. */
export const changePassword = mutation({
  args: { token: v.string(), currentPassword: v.string(), newPassword: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    if (!(await verifyPassword(args.currentPassword, user.passwordHash))) {
      throw new Error('BAD_REQUEST: Your current password is not right');
    }
    assertPasswordOk(args.newPassword);

    await ctx.db.patch(user._id, {
      passwordHash: await hashPassword(args.newPassword),
      mustChangePassword: false,
    });

    // Every other session for this account is now stale. Killing them is the point
    // of changing a password you think somebody else knows.
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();
    for (const session of sessions) {
      if (session.token !== args.token) await ctx.db.delete(session._id);
    }
    return null;
  },
});

/**
 * Redeem an admin-issued reset code.
 *
 * There is no mail service, so the code is handed over out-of-band. It is
 * single-use and short-lived, and redeeming it invalidates every existing session
 * for the account.
 */
export const redeemPasswordReset = mutation({
  args: { code: v.string(), newPassword: v.string() },
  handler: async (ctx, args) => {
    const reset = await ctx.db
      .query('passwordResets')
      .withIndex('by_token', (q) => q.eq('token', args.code.trim().toUpperCase()))
      .unique();

    if (!reset || reset.usedAt || reset.expiresAt < Date.now()) {
      throw new Error('BAD_REQUEST: That reset code is not valid any more');
    }
    assertPasswordOk(args.newPassword);

    const user = await ctx.db.get(reset.userId);
    if (!user || user.deletedAt) throw new Error('NOT_FOUND: That account is gone');

    await ctx.db.patch(user._id, {
      passwordHash: await hashPassword(args.newPassword),
      mustChangePassword: false,
    });
    await ctx.db.patch(reset._id, { usedAt: Date.now() });

    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();
    for (const session of sessions) await ctx.db.delete(session._id);

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
