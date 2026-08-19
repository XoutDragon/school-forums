import type { BuddyMatchDto } from '@campusconnect/shared';
import { AVAILABILITY_SLOTS } from '@campusconnect/shared';
import { prisma } from '../lib/prisma.js';
import { currentTerm } from '../lib/env.js';
import { parseSettings, publicUserSelect, safeJson, toPublicUser } from './serialize.js';

/** §5.6 scoring. Each component contributes both points and a phrase, because a match
 *  the student can't see the reasoning for is a match they won't act on. */
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
  id: string;
  displayName: string;
  majorId: string | null;
  year: string | null;
  courseIds: Set<string>;
  interests: Set<string>;
  interestNames: Map<string, string>;
  availability: boolean[];
  lookingFor: Set<string>;
}

function overlapCount(a: boolean[], b: boolean[]): number {
  let n = 0;
  for (let i = 0; i < AVAILABILITY_SLOTS; i++) if (a[i] && b[i]) n++;
  return n;
}

function scorePair(me: Candidate, them: Candidate) {
  let score = 0;

  const sharedCourses = [...me.courseIds].filter((c) => them.courseIds.has(c));
  if (sharedCourses.length) {
    score += WEIGHTS.sharedCourse * sharedCourses.length;
  }

  if (me.majorId && me.majorId === them.majorId) {
    score += WEIGHTS.sameMajor;
  }
  if (me.year && me.year === them.year) score += WEIGHTS.sameYear;

  const sharedInterests = [...me.interests].filter((i) => them.interests.has(i));
  score += Math.min(sharedInterests.length, WEIGHTS.interestCap) * WEIGHTS.sharedInterest;

  const slots = overlapCount(me.availability, them.availability);
  if (slots >= MIN_AVAILABILITY_OVERLAP) score += WEIGHTS.availabilityOverlap;

  const sharedGoals = [...me.lookingFor].filter((g) => them.lookingFor.has(g));
  if (sharedGoals.length) score += WEIGHTS.overlappingGoal;

  return { score, sharedCourses, sharedInterests, slots, sharedGoals };
}

function explain(
  themName: string,
  parts: ReturnType<typeof scorePair>,
  sameMajor: string | null,
  sameYear: string | null,
  courseCodes: Map<string, string>,
  interestNames: Map<string, string>,
): string {
  const first = themName.split(' ')[0] ?? themName;
  const clauses: string[] = [];

  if (parts.sharedCourses.length) {
    const codes = parts.sharedCourses.map((id) => courseCodes.get(id) ?? 'a course').slice(0, 2);
    clauses.push(`you're both in ${codes.join(' and ')}`);
  }
  if (sameMajor) clauses.push(`you're both in ${sameMajor}`);
  else if (sameYear) clauses.push(`you're both ${sameYear.toLowerCase()}s`);

  if (parts.sharedInterests.length) {
    const names = parts.sharedInterests
      .map((id) => interestNames.get(id) ?? 'something')
      .slice(0, 2);
    clauses.push(`you both ${names.length > 1 ? 'like' : 'like'} ${names.join(' and ')}`);
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

async function loadCandidate(userId: string, term: string): Promise<Candidate | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      displayName: true,
      majorId: true,
      year: true,
      courses: { where: { term }, select: { courseId: true } },
      interests: { select: { interestId: true, interest: { select: { name: true } } } },
      buddyProfile: { select: { availability: true, lookingFor: true, isActive: true } },
    },
  });
  if (!user) return null;

  const availability = safeJson<boolean[]>(user.buddyProfile?.availability ?? '[]', []);
  return {
    id: user.id,
    displayName: user.displayName,
    majorId: user.majorId,
    year: user.year,
    courseIds: new Set(user.courses.map((c) => c.courseId)),
    interests: new Set(user.interests.map((i) => i.interestId)),
    interestNames: new Map(user.interests.map((i) => [i.interestId, i.interest.name])),
    availability: Array.from({ length: AVAILABILITY_SLOTS }, (_, i) => availability[i] ?? false),
    lookingFor: new Set(safeJson<string[]>(user.buddyProfile?.lookingFor ?? '[]', [])),
  };
}

export async function findMatches(userId: string, limit = 5): Promise<BuddyMatchDto[]> {
  const term = currentTerm();
  const me = await loadCandidate(userId, term);
  if (!me) return [];

  // Candidate pool: active profiles, discoverable, never already matched or dismissed.
  const existing = await prisma.buddyMatch.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    select: { userAId: true, userBId: true },
  });
  const excluded = new Set([userId, ...existing.flatMap((m) => [m.userAId, m.userBId])]);

  const pool = await prisma.buddyProfile.findMany({
    where: { isActive: true, userId: { notIn: [...excluded] } },
    select: { userId: true, user: { select: { settings: true } } },
    take: 300,
  });
  const discoverable = pool.filter((p) => parseSettings(p.user.settings).discoverable);

  const scored: { candidate: Candidate; parts: ReturnType<typeof scorePair> }[] = [];
  for (const entry of discoverable) {
    const them = await loadCandidate(entry.userId, term);
    if (!them) continue;
    const parts = scorePair(me, them);
    if (parts.score > 0) scored.push({ candidate: them, parts });
  }
  scored.sort((a, b) => b.parts.score - a.parts.score);
  const top = scored.slice(0, limit);
  if (!top.length) return [];

  const allCourseIds = [...new Set(top.flatMap((t) => t.parts.sharedCourses))];
  const courses = await prisma.course.findMany({
    where: { id: { in: allCourseIds } },
    select: { id: true, code: true },
  });
  const courseCodes = new Map(courses.map((c) => [c.id, c.code]));

  const majors = await prisma.major.findMany({ select: { id: true, name: true } });
  const majorNames = new Map(majors.map((m) => [m.id, m.name]));

  const results: BuddyMatchDto[] = [];
  for (const { candidate, parts } of top) {
    const sameMajor =
      me.majorId && me.majorId === candidate.majorId ? (majorNames.get(me.majorId) ?? null) : null;
    const sameYear = me.year && me.year === candidate.year ? me.year : null;

    const explanation = explain(
      candidate.displayName,
      parts,
      sameMajor,
      sameYear,
      courseCodes,
      me.interestNames,
    );

    const [a, b] = [userId, candidate.id].sort() as [string, string];
    const match = await prisma.buddyMatch.upsert({
      where: { userAId_userBId: { userAId: a, userBId: b } },
      create: { userAId: a, userBId: b, score: parts.score, explanation },
      update: { score: parts.score, explanation },
    });

    const userRow = await prisma.user.findUniqueOrThrow({
      where: { id: candidate.id },
      select: publicUserSelect,
    });

    results.push({
      id: match.id,
      user: toPublicUser(userRow),
      score: parts.score,
      explanation,
      status: match.status,
    });
  }
  return results;
}

/** Nightly refresh so "Find matches" isn't the only path (§5.6). */
export async function refreshAllMatches() {
  const actives = await prisma.buddyProfile.findMany({
    where: { isActive: true },
    select: { userId: true },
  });
  for (const { userId } of actives) {
    await findMatches(userId).catch(() => undefined);
  }
  return actives.length;
}
