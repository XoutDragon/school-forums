import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { atLeast, roleIn, type SpaceRole } from './auth';

/**
 * Space permissions.
 *
 * Two systems sit on top of each other, deliberately:
 *
 *  - the four-rank ladder (OWNER > ADMIN > MOD > MEMBER) that shipped with the
 *    original spec, which decides structural authority, and
 *  - custom roles, which a space owner mints to hand out specific capabilities
 *    without promoting anyone up the ladder.
 *
 * The ladder always wins upward: an ADMIN has every permission whether or not a
 * custom role grants it, so nobody can be locked out of their own space by a badly
 * configured role. Custom roles only ever add.
 *
 * `manageRoles` is the one capability a custom role cannot grant, and that is not
 * an oversight — a role that can edit roles can grant itself everything, which
 * makes every other restriction decorative. Only ADMIN and above manage roles.
 */

export type Permission =
  | 'manageChannels'
  | 'manageRoles'
  | 'manageMembers'
  | 'moderateMessages'
  | 'pinMessages'
  | 'postAnnouncements'
  | 'inviteMembers'
  | 'useVoice';

export type PermissionSet = Record<Permission, boolean>;

export const ALL_PERMISSIONS: Permission[] = [
  'manageChannels',
  'manageRoles',
  'manageMembers',
  'moderateMessages',
  'pinMessages',
  'postAnnouncements',
  'inviteMembers',
  'useVoice',
];

export const NO_PERMISSIONS: PermissionSet = {
  manageChannels: false,
  manageRoles: false,
  manageMembers: false,
  moderateMessages: false,
  pinMessages: false,
  postAnnouncements: false,
  inviteMembers: false,
  useVoice: false,
};

/** What an ordinary member can do before any role is applied. */
const MEMBER_BASELINE: PermissionSet = { ...NO_PERMISSIONS, useVoice: true };

/** MOD is the moderation rank; it gets the moderation capabilities and no more. */
const MOD_BASELINE: PermissionSet = {
  ...MEMBER_BASELINE,
  moderateMessages: true,
  pinMessages: true,
  manageMembers: true,
};

const FULL: PermissionSet = Object.fromEntries(
  ALL_PERMISSIONS.map((key) => [key, true]),
) as PermissionSet;

function baselineFor(rank: SpaceRole | null): PermissionSet {
  if (!rank) return { ...NO_PERMISSIONS };
  if (atLeast(rank, 'ADMIN')) return { ...FULL };
  if (rank === 'MOD') return { ...MOD_BASELINE };
  return { ...MEMBER_BASELINE };
}

export interface SpaceAuthority {
  rank: SpaceRole | null;
  permissions: PermissionSet;
  roleIds: Id<'spaceRoles'>[];
  /** True for campus administrators, who are above every space. */
  isCampusAdmin: boolean;
}

/**
 * Everything the caller is allowed to do in one space, resolved once.
 *
 * Callers should take this and read fields off it rather than asking the database
 * the same question four times in one mutation.
 */
export async function authorityIn(
  ctx: QueryCtx | MutationCtx,
  spaceId: Id<'spaces'>,
  user: Doc<'users'>,
): Promise<SpaceAuthority> {
  if (user.isAdmin) {
    return { rank: 'OWNER', permissions: { ...FULL }, roleIds: [], isCampusAdmin: true };
  }

  const membership = await ctx.db
    .query('spaceMembers')
    .withIndex('by_space_user', (q) => q.eq('spaceId', spaceId).eq('userId', user._id))
    .unique();

  const rank = (membership?.role as SpaceRole) ?? null;
  const permissions = baselineFor(rank);
  const roleIds = membership?.roleIds ?? [];

  for (const roleId of roleIds) {
    const role = await ctx.db.get(roleId);
    if (!role || role.spaceId !== spaceId) continue;
    for (const key of ALL_PERMISSIONS) {
      // manageRoles is never grantable by a role — see the note at the top.
      if (key === 'manageRoles') continue;
      if (role.permissions[key]) permissions[key] = true;
    }
  }

  return { rank, permissions, roleIds, isCampusAdmin: false };
}

export async function assertPermission(
  ctx: QueryCtx | MutationCtx,
  spaceId: Id<'spaces'>,
  user: Doc<'users'>,
  permission: Permission,
  what = 'do that',
): Promise<SpaceAuthority> {
  const authority = await authorityIn(ctx, spaceId, user);
  if (!authority.permissions[permission]) {
    throw new Error(`FORBIDDEN: You do not have permission to ${what} in this space`);
  }
  return authority;
}

/** Convenience for the many call sites that only need the ladder. */
export async function rankIn(
  ctx: QueryCtx | MutationCtx,
  spaceId: Id<'spaces'>,
  userId: Id<'users'>,
): Promise<SpaceRole | null> {
  return roleIn(ctx, spaceId, userId);
}
