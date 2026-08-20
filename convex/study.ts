import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { requireUser } from './lib/auth';
import { currentTerm, reevaluateBadges } from './lib/karma';
import { toPublicUser } from './lib/serialize';
import { notify } from './notifications';

/** Study groups and buddy matching — ported from routes/study.ts and buddy.service.ts. */

const AVAILABILITY_SLOTS = 35; // 7 days x 5 blocks

// ── Study groups ───────────────────────────────────────────────────────────

export const groups = query({
  args: { token: v.string(), courseId: v.optional(v.id('courses')) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    const rows = args.courseId
      ? await ctx.db
          .query('studyGroups')
          .withIndex('by_course', (q) => q.eq('courseId', args.courseId))
          .collect()
      : await ctx.db.query('studyGroups').collect();

    return Promise.all(
      rows
        .filter((g) => g.status !== 'ARCHIVED')
        .map(async (group) => {
          const memberRows = await ctx.db
            .query('studyGroupMembers')
            .withIndex('by_group', (q) => q.eq('groupId', group._id))
            .collect();

          const hydrate = async (row: Doc<'studyGroupMembers'>) => {
            const member = await ctx.db.get(row.userId);
            if (!member) return null;
            const major = member.majorId ? await ctx.db.get(member.majorId) : null;
            return toPublicUser(member, major);
          };

          const members = (
            await Promise.all(memberRows.filter((m) => m.status === 'MEMBER').map(hydrate))
          ).filter((m): m is NonNullable<typeof m> => m !== null);

          const isOwner = group.ownerId === user._id;
          const pendingRows = memberRows.filter((m) => m.status === 'REQUESTED');

          // Only the owner sees who is waiting — a public list of people who asked
          // and were not let in yet is its own small humiliation.
          const pending = isOwner
            ? (await Promise.all(pendingRows.map(hydrate))).filter(
                (m): m is NonNullable<typeof m> => m !== null,
              )
            : [];

          const owner = await ctx.db.get(group.ownerId);
          const ownerMajor = owner?.majorId ? await ctx.db.get(owner.majorId) : null;
          const course = group.courseId ? await ctx.db.get(group.courseId) : null;

          return {
            id: group._id,
            name: group.name,
            description: group.description ?? null,
            maxSize: group.maxSize,
            meetingType: group.meetingType,
            locationHint: group.locationHint ?? null,
            status: group.status,
            schedule: group.schedule,
            course: course ? { id: course._id, code: course.code, title: course.title } : null,
            owner: owner ? toPublicUser(owner, ownerMajor) : null,
            members,
            memberCount: members.length,
            myStatus: memberRows.find((m) => m.userId === user._id)?.status ?? null,
            isOwner,
            pending,
            pendingCount: pendingRows.length,
          };
        }),
    );
  },
});

export const createGroup = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    courseId: v.optional(v.id('courses')),
    maxSize: v.optional(v.number()),
    meetingType: v.optional(
      v.union(v.literal('IN_PERSON'), v.literal('ONLINE'), v.literal('HYBRID')),
    ),
    schedule: v.optional(v.array(v.boolean())),
    locationHint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    // Every group gets its own private group DM (section 5.6) — the group exists as a
    // conversation from minute one, rather than after someone works up the nerve.
    const now = Date.now();
    const conversationId = await ctx.db.insert('directConversations', {
      title: args.name,
      isGroup: true,
      lastMessageAt: now,
    });
    await ctx.db.insert('directMembers', { conversationId, userId: user._id, lastReadAt: now });

    const groupId = await ctx.db.insert('studyGroups', {
      courseId: args.courseId,
      conversationId,
      name: args.name,
      description: args.description,
      maxSize: args.maxSize ?? 6,
      meetingType: args.meetingType ?? 'IN_PERSON',
      schedule: args.schedule ?? Array<boolean>(AVAILABILITY_SLOTS).fill(false),
      locationHint: args.locationHint,
      ownerId: user._id,
      status: 'OPEN',
    });

    await ctx.db.insert('studyGroupMembers', { groupId, userId: user._id, status: 'MEMBER' });
    return groupId;
  },
});

export const requestToJoin = mutation({
  args: { token: v.string(), groupId: v.id('studyGroups') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error('NOT_FOUND: No group there');
    if (group.status !== 'OPEN') throw new Error('CONFLICT: That group has stopped taking people');

    const existing = await ctx.db
      .query('studyGroupMembers')
      .withIndex('by_group_user', (q) => q.eq('groupId', args.groupId).eq('userId', user._id))
      .unique();
    if (existing) return null;

    await ctx.db.insert('studyGroupMembers', {
      groupId: args.groupId,
      userId: user._id,
      status: 'REQUESTED',
    });

    await notify(ctx, group.ownerId, 'STUDY_GROUP_REQUEST', {
      groupId: args.groupId,
      groupName: group.name,
      userId: user._id,
      name: user.displayName,
      username: user.username,
    });
    return null;
  },
});

export const approveMember = mutation({
  args: { token: v.string(), groupId: v.id('studyGroups'), userId: v.id('users') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error('NOT_FOUND: No group there');
    if (group.ownerId !== user._id) {
      throw new Error('FORBIDDEN: Only the group owner approves requests');
    }

    const membership = await ctx.db
      .query('studyGroupMembers')
      .withIndex('by_group_user', (q) => q.eq('groupId', args.groupId).eq('userId', args.userId))
      .unique();
    if (!membership) throw new Error('NOT_FOUND: No request there');

    await ctx.db.patch(membership._id, { status: 'MEMBER' });

    if (group.conversationId) {
      await ctx.db.insert('directMembers', {
        conversationId: group.conversationId,
        userId: args.userId,
        lastReadAt: Date.now(),
      });
    }

    const memberCount = (
      await ctx.db
        .query('studyGroupMembers')
        .withIndex('by_group', (q) => q.eq('groupId', args.groupId))
        .collect()
    ).filter((m) => m.status === 'MEMBER').length;

    if (memberCount >= group.maxSize) {
      await ctx.db.patch(args.groupId, { status: 'FULL' });
      await reevaluateBadges(ctx, group.ownerId); // "Founder" — a group that filled
    }

    await notify(ctx, args.userId, 'STUDY_GROUP_APPROVED', {
      groupId: args.groupId,
      groupName: group.name,
    });
    return { memberCount };
  },
});

// ── Buddy profile ──────────────────────────────────────────────────────────

export const buddyProfile = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const profile = await ctx.db
      .query('buddyProfiles')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .unique();

    return profile
      ? {
          isActive: profile.isActive,
          lookingFor: profile.lookingFor,
          availability: profile.availability,
          note: profile.note ?? null,
        }
      : null;
  },
});

export const saveBuddyProfile = mutation({
  args: {
    token: v.string(),
    isActive: v.boolean(),
    lookingFor: v.array(
      v.union(
        v.literal('STUDY_PARTNER'),
        v.literal('FRIENDS'),
        v.literal('CLUB_BUDDY'),
        v.literal('GYM_PARTNER'),
        v.literal('LANGUAGE_EXCHANGE'),
      ),
    ),
    availability: v.array(v.boolean()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    if (args.availability.length !== AVAILABILITY_SLOTS) {
      throw new Error(`BAD_REQUEST: Availability must have ${AVAILABILITY_SLOTS} slots`);
    }

    const existing = await ctx.db
      .query('buddyProfiles')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .unique();

    const data = {
      isActive: args.isActive,
      lookingFor: args.lookingFor,
      availability: args.availability,
      note: args.note,
    };

    if (existing) await ctx.db.patch(existing._id, data);
    else await ctx.db.insert('buddyProfiles', { userId: user._id, ...data });
    return null;
  },
});

// ── Matching (section 5.6) ─────────────────────────────────────────────────────

const WEIGHTS = {
  sharedCourse: 3,
  sameMajor: 2,
  sameYear: 1,
  sharedInterest: 1,
  interestCap: 5,
  availabilityOverlap: 2,
  overlappingGoal: 1,
} as const;

const MIN_AVAILABILITY_OVERLAP = 3;

interface Candidate {
  id: Id<'users'>;
  displayName: string;
  majorId: Id<'majors'> | undefined;
  year: string | undefined;
  courseIds: Set<string>;
  interestIds: Set<string>;
  availability: boolean[];
  lookingFor: Set<string>;
}

async function loadCandidate(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  term: string,
): Promise<Candidate | null> {
  const user = await ctx.db.get(userId);
  if (!user || user.deletedAt) return null;

  const courses = await ctx.db
    .query('userCourses')
    .withIndex('by_user_term', (q) => q.eq('userId', userId).eq('term', term))
    .collect();

  const interests = await ctx.db
    .query('userInterests')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();

  const profile = await ctx.db
    .query('buddyProfiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();

  return {
    id: user._id,
    displayName: user.displayName,
    majorId: user.majorId,
    year: user.year,
    courseIds: new Set(courses.map((c) => c.courseId as string)),
    interestIds: new Set(interests.map((i) => i.interestId as string)),
    availability: Array.from(
      { length: AVAILABILITY_SLOTS },
      (_, i) => profile?.availability[i] ?? false,
    ),
    lookingFor: new Set(profile?.lookingFor ?? []),
  };
}

function scorePair(me: Candidate, them: Candidate) {
  let score = 0;

  const sharedCourses = [...me.courseIds].filter((c) => them.courseIds.has(c));
  score += WEIGHTS.sharedCourse * sharedCourses.length;

  if (me.majorId && me.majorId === them.majorId) score += WEIGHTS.sameMajor;
  if (me.year && me.year === them.year) score += WEIGHTS.sameYear;

  const sharedInterests = [...me.interestIds].filter((i) => them.interestIds.has(i));
  score += Math.min(sharedInterests.length, WEIGHTS.interestCap) * WEIGHTS.sharedInterest;

  let slots = 0;
  for (let i = 0; i < AVAILABILITY_SLOTS; i++) {
    if (me.availability[i] && them.availability[i]) slots++;
  }
  if (slots >= MIN_AVAILABILITY_OVERLAP) score += WEIGHTS.availabilityOverlap;

  const sharedGoals = [...me.lookingFor].filter((g) => them.lookingFor.has(g));
  if (sharedGoals.length) score += WEIGHTS.overlappingGoal;

  return { score, sharedCourses, sharedInterests, slots };
}

/**
 * Section 5.6 requires an explanation for every match. Built from the same components
 * that produced the score, so the reason a student reads is literally why they matched.
 */
async function explain(
  ctx: QueryCtx | MutationCtx,
  them: Candidate,
  parts: ReturnType<typeof scorePair>,
  sameMajorName: string | null,
  sameYear: string | null,
): Promise<string> {
  const first = them.displayName.split(' ')[0] ?? them.displayName;
  const clauses: string[] = [];

  if (parts.sharedCourses.length) {
    const codes = (
      await Promise.all(
        parts.sharedCourses.slice(0, 2).map(async (id) => {
          const course = await ctx.db.get(id as Id<'courses'>);
          return course?.code ?? 'a course';
        }),
      )
    ).join(' and ');
    clauses.push(`you're both in ${codes}`);
  }

  if (sameMajorName) clauses.push(`you're both in ${sameMajorName}`);
  else if (sameYear) clauses.push(`you're both ${sameYear.toLowerCase()}s`);

  if (parts.sharedInterests.length) {
    const names = (
      await Promise.all(
        parts.sharedInterests.slice(0, 2).map(async (id) => {
          const interest = await ctx.db.get(id as Id<'interests'>);
          return interest?.name ?? 'something';
        }),
      )
    ).join(' and ');
    clauses.push(`you both like ${names}`);
  }

  if (parts.slots >= MIN_AVAILABILITY_OVERLAP) {
    clauses.push(`your weeks overlap in ${parts.slots} slots`);
  }

  if (!clauses.length) return `You and ${first} are both looking to meet people.`;
  const body =
    clauses.length === 1
      ? clauses[0]!
      : `${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1]!}`;
  return `You and ${first} — ${body}.`;
}

export const findMatches = mutation({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const term = currentTerm();

    const me = await loadCandidate(ctx, user._id, term);
    if (!me) return [];

    // Candidate pool: active profiles, discoverable, never already matched or dismissed.
    const asA = await ctx.db
      .query('buddyMatches')
      .withIndex('by_user_a', (q) => q.eq('userAId', user._id))
      .collect();
    const asB = await ctx.db
      .query('buddyMatches')
      .withIndex('by_user_b', (q) => q.eq('userBId', user._id))
      .collect();
    const excluded = new Set<string>([
      user._id,
      ...asA.map((m) => m.userBId as string),
      ...asB.map((m) => m.userAId as string),
    ]);

    const pool = (
      await ctx.db
        .query('buddyProfiles')
        .withIndex('by_active', (q) => q.eq('isActive', true))
        .take(300)
    ).filter((p) => !excluded.has(p.userId));

    const scored: { candidate: Candidate; parts: ReturnType<typeof scorePair> }[] = [];
    for (const entry of pool) {
      const other = await ctx.db.get(entry.userId);
      if (!other || other.deletedAt || !other.settings.discoverable) continue;

      const them = await loadCandidate(ctx, entry.userId, term);
      if (!them) continue;

      const parts = scorePair(me, them);
      if (parts.score > 0) scored.push({ candidate: them, parts });
    }

    scored.sort((a, b) => b.parts.score - a.parts.score);
    const top = scored.slice(0, args.limit ?? 5);

    const results = [];
    for (const { candidate, parts } of top) {
      const sameMajor =
        me.majorId && me.majorId === candidate.majorId ? await ctx.db.get(me.majorId) : null;
      const sameYear = me.year && me.year === candidate.year ? me.year : null;

      const explanation = await explain(ctx, candidate, parts, sameMajor?.name ?? null, sameYear);

      // Store the pair with ids sorted, so it is stable regardless of who searched.
      const [a, b] = ([user._id, candidate.id] as string[]).sort() as [Id<'users'>, Id<'users'>];

      const existing = await ctx.db
        .query('buddyMatches')
        .withIndex('by_pair', (q) => q.eq('userAId', a).eq('userBId', b))
        .unique();

      let matchId: Id<'buddyMatches'>;
      if (existing) {
        await ctx.db.patch(existing._id, { score: parts.score, explanation });
        matchId = existing._id;
      } else {
        matchId = await ctx.db.insert('buddyMatches', {
          userAId: a,
          userBId: b,
          score: parts.score,
          explanation,
          status: 'SUGGESTED',
        });
      }

      const other = await ctx.db.get(candidate.id);
      const otherMajor = other?.majorId ? await ctx.db.get(other.majorId) : null;

      results.push({
        id: matchId,
        user: other ? toPublicUser(other, otherMajor) : null,
        score: parts.score,
        explanation,
        status: 'SUGGESTED' as const,
      });
    }

    return results;
  },
});

export const matches = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    const asA = await ctx.db
      .query('buddyMatches')
      .withIndex('by_user_a', (q) => q.eq('userAId', user._id))
      .collect();
    const asB = await ctx.db
      .query('buddyMatches')
      .withIndex('by_user_b', (q) => q.eq('userBId', user._id))
      .collect();

    return (
      await Promise.all(
        [...asA, ...asB]
          .filter((m) => m.status === 'SUGGESTED')
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map(async (match) => {
            const otherId = match.userAId === user._id ? match.userBId : match.userAId;
            const other = await ctx.db.get(otherId);
            if (!other) return null;
            const major = other.majorId ? await ctx.db.get(other.majorId) : null;
            return {
              id: match._id,
              user: toPublicUser(other, major),
              score: match.score,
              explanation: match.explanation,
              status: match.status,
            };
          }),
      )
    ).filter((m): m is NonNullable<typeof m> => m !== null);
  },
});

const ICEBREAKERS = [
  'Hey! We matched on CampusConnect — what are you finding hardest this term?',
  'Hi! Fair warning: I opened this chat before deciding what to say. What are you working on?',
  "Hey — apparently we're both free at the same weird hours. Want to compare timetables?",
];

export const respondToMatch = mutation({
  args: {
    token: v.string(),
    matchId: v.id('buddyMatches'),
    action: v.union(v.literal('CONNECT'), v.literal('DISMISS')),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error('NOT_FOUND: No match there');
    if (match.userAId !== user._id && match.userBId !== user._id) {
      throw new Error('FORBIDDEN: Not your match');
    }

    const otherId = match.userAId === user._id ? match.userBId : match.userAId;

    if (args.action === 'DISMISS') {
      // Dismissed means never resurface, so the row stays as a tombstone.
      await ctx.db.patch(args.matchId, { status: 'DISMISSED' });
      return { status: 'DISMISSED' as const, conversationId: null };
    }

    await ctx.db.patch(args.matchId, { status: 'CONNECTED' });

    const now = Date.now();
    const conversationId = await ctx.db.insert('directConversations', {
      isGroup: false,
      lastMessageAt: now,
    });
    await ctx.db.insert('directMembers', { conversationId, userId: user._id, lastReadAt: now });
    await ctx.db.insert('directMembers', { conversationId, userId: otherId, lastReadAt: now });

    await ctx.db.insert('directMessages', {
      conversationId,
      authorId: user._id,
      content: ICEBREAKERS[Math.floor(Math.random() * ICEBREAKERS.length)]!,
      attachments: [],
    });

    await notify(ctx, otherId, 'BUDDY_CONNECTED', { conversationId, userId: user._id });
    await reevaluateBadges(ctx, user._id);

    return { status: 'CONNECTED' as const, conversationId };
  },
});
