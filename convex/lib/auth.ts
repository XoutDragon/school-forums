import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

/**
 * Session handling.
 *
 * Express used a JWT in an httpOnly cookie. Convex functions are called over its
 * own protocol with no cookie jar, so identity is a session row whose token the
 * client keeps in localStorage and passes as an argument.
 *
 * That is a real security downgrade from httpOnly: a token in localStorage is
 * readable by any script on the page, so an XSS becomes account takeover. It is
 * the standard Convex-without-an-auth-provider pattern, and the honest fix is to
 * move to Convex Auth (or Clerk) rather than to hand-roll something better here.
 */

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function sessionExpiry(now = Date.now()): number {
  return now + SESSION_TTL_MS;
}

/** Resolves a session token to its user, or null. Never throws — callers decide. */
export async function userFromToken(
  ctx: QueryCtx | MutationCtx,
  token: string | undefined,
): Promise<Doc<'users'> | null> {
  if (!token) return null;

  const session = await ctx.db
    .query('sessions')
    .withIndex('by_token', (q) => q.eq('token', token))
    .unique();

  if (!session || session.expiresAt < Date.now()) return null;

  const user = await ctx.db.get(session.userId);
  if (!user || user.deletedAt) return null;
  return user;
}

/** Same, but throws the way the Express `requireAuth` middleware did. */
export async function requireUser(
  ctx: QueryCtx | MutationCtx,
  token: string | undefined,
): Promise<Doc<'users'>> {
  const user = await userFromToken(ctx, token);
  if (!user) throw new Error('UNAUTHORIZED: Sign in to continue');
  return user;
}

export async function requireAdmin(
  ctx: QueryCtx | MutationCtx,
  token: string | undefined,
): Promise<Doc<'users'>> {
  const user = await requireUser(ctx, token);
  if (!user.isAdmin) throw new Error('FORBIDDEN: Campus admins only');
  return user;
}

// ── Space permissions (ported from server/src/services/space.service.ts) ────

export type SpaceRole = 'OWNER' | 'ADMIN' | 'MOD' | 'MEMBER';

const ROLE_RANK: Record<SpaceRole, number> = { MEMBER: 0, MOD: 1, ADMIN: 2, OWNER: 3 };

export function atLeast(role: SpaceRole | null | undefined, required: SpaceRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export async function roleIn(
  ctx: QueryCtx | MutationCtx,
  spaceId: Id<'spaces'>,
  userId: Id<'users'>,
): Promise<SpaceRole | null> {
  const member = await ctx.db
    .query('spaceMembers')
    .withIndex('by_space_user', (q) => q.eq('spaceId', spaceId).eq('userId', userId))
    .unique();
  return (member?.role as SpaceRole) ?? null;
}

/** Public spaces are readable by any signed-in student — the campus is the boundary. */
export async function assertCanView(
  ctx: QueryCtx | MutationCtx,
  spaceId: Id<'spaces'>,
  userId: Id<'users'>,
): Promise<void> {
  const space = await ctx.db.get(spaceId);
  if (!space) throw new Error('NOT_FOUND: No space there');
  if (space.visibility === 'PUBLIC') return;
  if (!(await roleIn(ctx, spaceId, userId))) {
    throw new Error('FORBIDDEN: That space is private');
  }
}

export async function assertRole(
  ctx: QueryCtx | MutationCtx,
  spaceId: Id<'spaces'>,
  userId: Id<'users'>,
  required: SpaceRole,
): Promise<SpaceRole> {
  const role = await roleIn(ctx, spaceId, userId);
  if (!atLeast(role, required)) {
    throw new Error(`FORBIDDEN: You need to be ${required.toLowerCase()} or above to do that`);
  }
  return role!;
}

// ── Rate limiting (section 5.10) ────────────────────────────────────────────────

export const LIMITS = {
  messages: {
    limit: 20,
    windowMs: 60_000,
    message: "You're sending messages faster than we can keep up. Wait a moment.",
  },
  anonymousPosts: {
    limit: 5,
    windowMs: 60 * 60_000,
    message: 'Anonymous posting is capped at 5 an hour. Try again later.',
  },
  uploads: {
    limit: 10,
    windowMs: 24 * 60 * 60_000,
    message: "You've hit today's upload limit of 10 files.",
  },
  reports: {
    limit: 3,
    windowMs: 60 * 60_000,
    message: 'You can file 3 reports an hour. Existing reports are still being reviewed.',
  },
} as const;

/**
 * Fixed-window counter, stored in a table because Convex has no process memory to
 * keep it in. Throws when the budget is spent.
 */
export async function consumeRateLimit(
  ctx: MutationCtx,
  bucket: keyof typeof LIMITS,
  userId: Id<'users'>,
): Promise<void> {
  const { limit, windowMs, message } = LIMITS[bucket];
  const key = `${bucket}:${userId}`;
  const now = Date.now();

  const existing = await ctx.db
    .query('rateLimits')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();

  if (!existing || existing.resetAt <= now) {
    if (existing) await ctx.db.patch(existing._id, { count: 1, resetAt: now + windowMs });
    else await ctx.db.insert('rateLimits', { key, count: 1, resetAt: now + windowMs });
    return;
  }

  if (existing.count + 1 > limit) throw new Error(`RATE_LIMITED: ${message}`);
  await ctx.db.patch(existing._id, { count: existing.count + 1 });
}

/** A student counts as online if they have checked in within this window. */
export const PRESENCE_WINDOW_MS = 45_000;

export async function onlineUserIds(ctx: QueryCtx): Promise<Set<string>> {
  const cutoff = Date.now() - PRESENCE_WINDOW_MS;
  const rows = await ctx.db
    .query('presence')
    .withIndex('by_last_seen', (q) => q.gt('lastSeenAt', cutoff))
    .collect();
  return new Set(rows.map((row) => row.userId));
}
