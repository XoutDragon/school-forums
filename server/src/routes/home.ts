import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah } from '../lib/async.js';
import { currentTerm } from '../lib/env.js';
import { authed, requireAuth } from '../middleware/auth.js';
import { publicUserSelect, safeJson, toPublicUser } from '../services/serialize.js';

export const homeRouter = Router();
homeRouter.use(requireAuth);

/** Everything the home feed needs in one round trip (§5.9). The client renders a week,
 *  so the server returns one — seven dated buckets, always seven, even when empty. */
homeRouter.get(
  '/feed',
  ah(async (req, res) => {
    const me = authed(req).id;
    const term = currentTerm();

    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart.getTime() + 7 * 864e5);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: me },
      select: {
        displayName: true,
        majorId: true,
        karma: true,
        clubMemberships: { select: { clubId: true } },
        spaceMemberships: { select: { spaceId: true } },
        courses: {
          where: { term },
          select: { courseId: true, course: { select: { id: true, code: true, title: true } } },
        },
      },
    });

    const clubIds = user.clubMemberships.map((m) => m.clubId);
    const spaceIds = user.spaceMemberships.map((m) => m.spaceId);
    const courseIds = user.courses.map((c) => c.courseId);
    const majorSpace = user.majorId
      ? await prisma.space.findFirst({
          where: { linkedMajorId: user.majorId },
          select: { id: true },
        })
      : null;

    const [events, announcements, resources, suggestedClub] = await Promise.all([
      prisma.event.findMany({
        where: {
          startsAt: { gte: weekStart, lt: weekEnd },
          OR: [
            { hostType: 'CLUB', hostId: { in: clubIds } },
            {
              hostType: 'SPACE',
              hostId: { in: majorSpace ? [...spaceIds, majorSpace.id] : spaceIds },
            },
            { hostType: 'CAMPUS' },
          ],
        },
        orderBy: { startsAt: 'asc' },
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          location: true,
          tags: true,
          hostType: true,
          hostId: true,
          rsvps: { select: { status: true, userId: true } },
        },
      }),

      prisma.message.findMany({
        where: {
          channel: { spaceId: { in: spaceIds }, type: 'ANNOUNCEMENT' },
          deletedAt: null,
          createdAt: { gte: new Date(now.getTime() - 14 * 864e5) },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          content: true,
          createdAt: true,
          isAnonymous: true,
          author: { select: publicUserSelect },
          channel: {
            select: { id: true, name: true, space: { select: { id: true, name: true } } },
          },
        },
      }),

      // Trending = highest scoring resources in the courses you're actually taking.
      courseIds.length
        ? prisma.resource.findMany({
            where: { courseId: { in: courseIds } },
            orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
            take: 4,
            select: {
              id: true,
              title: true,
              type: true,
              score: true,
              term: true,
              course: { select: { id: true, code: true } },
            },
          })
        : Promise.resolve([]),

      prisma.club.findFirst({
        where: { isRecruiting: true, memberships: { none: { userId: me } } },
        orderBy: { memberships: { _count: 'desc' } },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          category: true,
          logoUrl: true,
          _count: { select: { memberships: true } },
        },
      }),
    ]);

    // Seven buckets, Monday-first, so the client never has to reason about gaps.
    const week = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart.getTime() + i * 864e5);
      const dayEvents = events.filter((e) => sameDay(e.startsAt, date));
      return {
        date: date.toISOString(),
        weekday: date.toLocaleDateString('en-CA', { weekday: 'short' }),
        dayOfMonth: date.getDate(),
        isToday: sameDay(date, now),
        isPast: date < startOfDay(now),
        events: dayEvents.map((e) => ({
          id: e.id,
          title: e.title,
          startsAt: e.startsAt.toISOString(),
          location: e.location,
          tags: safeJson<string[]>(e.tags, []),
          goingCount: e.rsvps.filter((r) => r.status === 'GOING').length,
          myRsvp: e.rsvps.find((r) => r.userId === me)?.status ?? null,
        })),
      };
    });

    res.json({
      displayName: user.displayName,
      karma: user.karma,
      term,
      weekStart: weekStart.toISOString(),
      week,
      eventCount: events.length,
      courses: user.courses.map((c) => c.course),
      announcements: announcements.map((a) => ({
        id: a.id,
        excerpt: a.content.slice(0, 220),
        createdAt: a.createdAt.toISOString(),
        author: a.isAnonymous ? null : toPublicUser(a.author!),
        channel: { id: a.channel.id, name: a.channel.name },
        space: a.channel.space,
      })),
      resources,
      suggestedClub: suggestedClub
        ? {
            id: suggestedClub.id,
            name: suggestedClub.name,
            slug: suggestedClub.slug,
            description: suggestedClub.description,
            category: suggestedClub.category,
            logoUrl: suggestedClub.logoUrl,
            memberCount: suggestedClub._count.memberships,
          }
        : null,
    });
  }),
);

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday-first: a campus week starts when classes do, not on Sunday. */
function startOfWeek(d: Date) {
  const day = (d.getDay() + 6) % 7;
  const start = startOfDay(d);
  start.setDate(start.getDate() - day);
  return start;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
