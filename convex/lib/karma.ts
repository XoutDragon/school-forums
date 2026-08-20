import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { notify } from '../notifications';

/** Karma and badges, ported from services/karma.service.ts (section 5.9). */

export const KARMA = {
  RESOURCE_UPVOTE: 1,
  RESOURCE_DOWNLOAD: 2,
  ACCEPTED_ANSWER: 10,
  REVIEW_POSTED: 5,
  EVENT_HOSTED: 5,
} as const;

export const BADGES = [
  { key: 'first-post', name: 'First Post', emoji: '🌱', description: 'Said the first thing.' },
  {
    key: 'helpful-hand',
    name: 'Helpful Hand',
    emoji: '🤝',
    description: '10 upvotes on your resources.',
  },
  { key: 'scholar', name: 'Scholar', emoji: '📚', description: 'Reviewed 5 courses.' },
  { key: 'connector', name: 'Connector', emoji: '🔗', description: 'Connected with 5 buddies.' },
  { key: 'club-hopper', name: 'Club Hopper', emoji: '🎪', description: 'Joined 3 clubs.' },
  { key: 'early-bird', name: 'Early Bird', emoji: '🐦', description: "RSVP'd to 5 events." },
  {
    key: 'founder',
    name: 'Founder',
    emoji: '🏛️',
    description: 'Started a study group that filled.',
  },
] as const;

export type BadgeKey = (typeof BADGES)[number]['key'];

export async function grantKarma(
  ctx: MutationCtx,
  userId: Id<'users'>,
  amount: number,
): Promise<void> {
  if (!amount) return;
  const user = await ctx.db.get(userId);
  if (!user) return;
  await ctx.db.patch(userId, { karma: user.karma + amount });
}

async function awardBadge(ctx: MutationCtx, userId: Id<'users'>, key: BadgeKey): Promise<void> {
  const badge = await ctx.db
    .query('badges')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  if (!badge) return;

  const existing = await ctx.db
    .query('userBadges')
    .withIndex('by_user_badge', (q) => q.eq('userId', userId).eq('badgeId', badge._id))
    .unique();
  if (existing) return;

  await ctx.db.insert('userBadges', { userId, badgeId: badge._id, awardedAt: Date.now() });
  await notify(ctx, userId, 'BADGE_EARNED', {
    key,
    name: badge.name,
    emoji: badge.emoji,
  });
}

/**
 * Re-evaluates every badge for one student. Idempotent, so callers do not need to
 * know which badge they might have just triggered.
 */
export async function reevaluateBadges(ctx: MutationCtx, userId: Id<'users'>): Promise<void> {
  const [posts, resources, reviews, matches, clubs, rsvps, groups] = await Promise.all([
    ctx.db
      .query('messages')
      .withIndex('by_author', (q) => q.eq('authorId', userId))
      .collect(),
    ctx.db
      .query('resources')
      .withIndex('by_uploader', (q) => q.eq('uploaderId', userId))
      .collect(),
    ctx.db
      .query('courseReviews')
      .withIndex('by_author', (q) => q.eq('authorId', userId))
      .collect(),
    ctx.db
      .query('buddyMatches')
      .withIndex('by_user_a', (q) => q.eq('userAId', userId))
      .collect(),
    ctx.db
      .query('clubMemberships')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect(),
    ctx.db
      .query('eventRsvps')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect(),
    ctx.db
      .query('studyGroups')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect(),
  ]);

  const matchesB = await ctx.db
    .query('buddyMatches')
    .withIndex('by_user_b', (q) => q.eq('userBId', userId))
    .collect();

  let resourceUpvotes = 0;
  for (const resource of resources) {
    const votes = await ctx.db
      .query('resourceVotes')
      .withIndex('by_resource', (q) => q.eq('resourceId', resource._id))
      .collect();
    resourceUpvotes += votes.filter((vote) => vote.value === 1).length;
  }

  const connections = [...matches, ...matchesB].filter((m) => m.status === 'CONNECTED').length;

  const earned: BadgeKey[] = [];
  if (posts.length >= 1) earned.push('first-post');
  if (resourceUpvotes >= 10) earned.push('helpful-hand');
  if (reviews.length >= 5) earned.push('scholar');
  if (connections >= 5) earned.push('connector');
  if (clubs.filter((c) => c.role !== 'FOLLOWER').length >= 3) earned.push('club-hopper');
  if (rsvps.filter((r) => r.status === 'GOING').length >= 5) earned.push('early-bird');
  if (groups.some((g) => g.status === 'FULL')) earned.push('founder');

  for (const key of earned) await awardBadge(ctx, userId, key);
}

/** Current academic term, e.g. 2026FA. Everything term-scoped reads this. */
export function currentTerm(now = new Date()): string {
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month <= 3) return `${year}WI`;
  if (month <= 5) return `${year}SP`;
  if (month <= 7) return `${year}SU`;
  return `${year}FA`;
}
