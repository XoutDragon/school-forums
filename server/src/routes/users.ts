import { Router } from 'express';
import { z } from 'zod';
import { enrolCourseSchema, onboardingSchema } from '@campusconnect/shared';
import { prisma } from '../lib/prisma.js';
import { ah } from '../lib/async.js';
import { ApiError } from '../lib/errors.js';
import { currentTerm } from '../lib/env.js';
import { authed, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { parseSettings, publicUserSelect, toPublicUser } from '../services/serialize.js';
import { notify } from '../services/notification.service.js';
import { reevaluateBadges } from '../services/karma.service.js';
import { onlineIds } from '../sockets/presence.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.post(
  '/onboarding',
  validateBody(onboardingSchema),
  ah(async (req, res) => {
    const me = authed(req).id;
    const { majorId, year, interestIds, courses } = req.body;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: me },
        data: { majorId, year, onboardedAt: new Date() },
      }),
      prisma.userInterest.deleteMany({ where: { userId: me } }),
      prisma.userInterest.createMany({
        data: interestIds.map((interestId: string) => ({ userId: me, interestId })),
      }),
    ]);

    for (const c of courses) {
      await prisma.userCourse.upsert({
        where: { userId_courseId_term: { userId: me, courseId: c.courseId, term: c.term } },
        create: { userId: me, courseId: c.courseId, term: c.term, status: 'TAKING' },
        update: { status: 'TAKING' },
      });
    }

    res.json(await suggestionsFor(me));
  }),
);

/** The payload the onboarding wizard's last step renders: one click per suggestion (§5.1). */
usersRouter.get(
  '/suggestions',
  ah(async (req, res) => {
    res.json(await suggestionsFor(authed(req).id));
  }),
);

async function suggestionsFor(userId: string) {
  const term = currentTerm();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      majorId: true,
      interests: { select: { interestId: true, interest: { select: { name: true } } } },
      courses: { where: { term }, select: { courseId: true, course: { select: { code: true } } } },
    },
  });

  const majorSpace = user.majorId
    ? await prisma.space.findFirst({
        where: { linkedMajorId: user.majorId, members: { none: { userId } } },
        select: spaceCard,
      })
    : null;

  const courseSpaces = await prisma.space.findMany({
    where: {
      linkedCourseId: { in: user.courses.map((c) => c.courseId) },
      members: { none: { userId } },
    },
    select: spaceCard,
    take: 6,
  });

  const interestNames = user.interests.map((i) => i.interest.name.toLowerCase());
  const clubs = await prisma.club.findMany({
    where: { memberships: { none: { userId } } },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      category: true,
      logoUrl: true,
      tags: true,
      isRecruiting: true,
      _count: { select: { memberships: true } },
    },
    take: 40,
  });

  const ranked = clubs
    .map((club) => {
      const tags = safeTags(club.tags).map((t) => t.toLowerCase());
      const overlap = tags.filter((t) => interestNames.some((i) => i.includes(t) || t.includes(i)));
      return { club, overlap };
    })
    .filter((c) => c.overlap.length > 0)
    .sort((a, b) => b.overlap.length - a.overlap.length)
    .slice(0, 3);

  return {
    majorSpace,
    courseSpaces,
    clubs: ranked.map(({ club, overlap }) => ({
      id: club.id,
      name: club.name,
      slug: club.slug,
      description: club.description,
      category: club.category,
      logoUrl: club.logoUrl,
      isRecruiting: club.isRecruiting,
      memberCount: club._count.memberships,
      // Never show a suggestion without its reason — same rule as buddy matching (§5.6).
      reason: `Matches your interest in ${overlap.slice(0, 2).join(' and ')}`,
    })),
  };
}

const spaceCard = {
  id: true,
  name: true,
  slug: true,
  description: true,
  iconUrl: true,
  type: true,
} as const;

function safeTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

usersRouter.get(
  '/:username',
  ah(async (req, res) => {
    const viewer = authed(req).id;
    const user = await prisma.user.findFirst({
      where: { username: req.params.username!, deletedAt: null },
      select: {
        ...publicUserSelect,
        bio: true,
        settings: true,
        createdAt: true,
        badges: { select: { awardedAt: true, badge: true } },
        courses: {
          where: { term: currentTerm() },
          select: {
            status: true,
            term: true,
            course: { select: { id: true, code: true, title: true } },
          },
        },
        clubMemberships: {
          select: {
            role: true,
            club: { select: { id: true, name: true, slug: true, category: true } },
          },
        },
        spaceMemberships: {
          select: { space: { select: { id: true, name: true, slug: true, type: true } } },
          take: 12,
        },
      },
    });
    if (!user) throw ApiError.notFound('No student by that name');

    const settings = parseSettings(user.settings);
    const isSelf = user.id === viewer;

    res.json({
      ...toPublicUser(user, onlineIds().has(user.id)),
      bio: user.bio,
      joinedAt: user.createdAt.toISOString(),
      badges: user.badges.map((b) => ({ ...b.badge, awardedAt: b.awardedAt.toISOString() })),
      // §5.1: the profile respects the student's own privacy switches.
      courses: isSelf || settings.showCourses ? user.courses : [],
      clubs: user.clubMemberships.map((m) => ({ ...m.club, role: m.role })),
      spaces: user.spaceMemberships.map((m) => m.space),
      canWave: !isSelf && settings.discoverable,
      canDm: isSelf ? false : settings.dmPrivacy !== 'NOBODY',
    });
  }),
);

/** §5.3 — a wave is deliberately smaller than a DM. One per pair, ever. */
usersRouter.post(
  '/:userId/wave',
  validateBody(z.object({ context: z.string().max(60).optional() })),
  ah(async (req, res) => {
    const me = authed(req).id;
    const toId = req.params.userId!;
    if (me === toId) throw ApiError.badRequest("You can't wave at yourself");

    const target = await prisma.user.findFirst({
      where: { id: toId, deletedAt: null },
      select: { id: true, settings: true, displayName: true },
    });
    if (!target) throw ApiError.notFound('No student there');
    if (!parseSettings(target.settings).discoverable) {
      throw ApiError.forbidden("That student isn't discoverable right now");
    }

    const meRow = await prisma.user.findUniqueOrThrow({
      where: { id: me },
      select: { displayName: true, username: true },
    });

    await prisma.wave.upsert({
      where: { fromId_toId: { fromId: me, toId } },
      create: { fromId: me, toId, context: req.body.context ?? null },
      update: {},
    });

    const mutual = await prisma.wave.findUnique({
      where: { fromId_toId: { fromId: toId, toId: me } },
      select: { id: true },
    });

    if (mutual) {
      // Both sides reached out — now a DM is a low-pressure suggestion rather than a
      // cold approach, which is the whole point of the wave (§1, design principle 3).
      await Promise.all([
        notify(toId, 'WAVE_MUTUAL', {
          userId: me,
          name: meRow.displayName,
          username: meRow.username,
        }),
        notify(me, 'WAVE_MUTUAL', { userId: toId, name: target.displayName }),
      ]);
    } else {
      await notify(toId, 'WAVE', {
        userId: me,
        name: meRow.displayName,
        username: meRow.username,
        context: req.body.context ?? null,
      });
    }

    res.status(201).json({ mutual: Boolean(mutual) });
  }),
);

usersRouter.post(
  '/me/courses',
  validateBody(enrolCourseSchema),
  ah(async (req, res) => {
    const me = authed(req).id;
    const { courseId, term, status } = req.body;
    const row = await prisma.userCourse.upsert({
      where: { userId_courseId_term: { userId: me, courseId, term } },
      create: { userId: me, courseId, term, status },
      update: { status },
      select: {
        id: true,
        term: true,
        status: true,
        course: { select: { id: true, code: true, title: true } },
      },
    });
    void reevaluateBadges(me);
    res.status(201).json(row);
  }),
);

usersRouter.delete(
  '/me/courses/:id',
  ah(async (req, res) => {
    await prisma.userCourse.deleteMany({ where: { id: req.params.id!, userId: authed(req).id } });
    res.status(204).end();
  }),
);
