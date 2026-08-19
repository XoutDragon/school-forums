import { prisma } from '../lib/prisma.js';
import { notify } from './notification.service.js';

/** §5.9 — the only places karma is minted. Keeping the table here means the numbers on a
 *  profile can always be traced back to a rule. */
export const KARMA = {
  RESOURCE_UPVOTE: 1,
  RESOURCE_DOWNLOAD: 2,
  ACCEPTED_ANSWER: 10,
  REVIEW_POSTED: 5,
  EVENT_HOSTED: 5,
} as const;

export async function grantKarma(userId: string, amount: number) {
  if (!amount) return;
  await prisma.user.update({ where: { id: userId }, data: { karma: { increment: amount } } });
}

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

export async function awardBadge(userId: string, key: BadgeKey) {
  const badge = await prisma.badge.findUnique({
    where: { key },
    select: { id: true, name: true, emoji: true },
  });
  if (!badge) return;

  const existing = await prisma.userBadge.findUnique({
    where: { userId_badgeId: { userId, badgeId: badge.id } },
    select: { id: true },
  });
  if (existing) return;

  await prisma.userBadge.create({ data: { userId, badgeId: badge.id } });
  await notify(userId, 'BADGE_EARNED', { key, name: badge.name, emoji: badge.emoji });
}

/** Re-evaluates every badge for one student. Cheap enough to call after any qualifying
 *  action, and idempotent, so callers don't need to know which badge they might have hit. */
export async function reevaluateBadges(userId: string) {
  const [posts, resourceUpvotes, reviews, connections, clubs, rsvps, filledGroups] =
    await Promise.all([
      prisma.message.count({ where: { authorId: userId } }),
      prisma.resourceVote.count({ where: { value: 1, resource: { uploaderId: userId } } }),
      prisma.courseReview.count({ where: { authorId: userId } }),
      prisma.buddyMatch.count({
        where: { status: 'CONNECTED', OR: [{ userAId: userId }, { userBId: userId }] },
      }),
      prisma.clubMembership.count({ where: { userId, role: { not: 'FOLLOWER' } } }),
      prisma.eventRSVP.count({ where: { userId, status: 'GOING' } }),
      prisma.studyGroup.count({ where: { ownerId: userId, status: 'FULL' } }),
    ]);

  const earned: BadgeKey[] = [];
  if (posts >= 1) earned.push('first-post');
  if (resourceUpvotes >= 10) earned.push('helpful-hand');
  if (reviews >= 5) earned.push('scholar');
  if (connections >= 5) earned.push('connector');
  if (clubs >= 3) earned.push('club-hopper');
  if (rsvps >= 5) earned.push('early-bird');
  if (filledGroups >= 1) earned.push('founder');

  for (const key of earned) await awardBadge(userId, key);
}
