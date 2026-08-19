import { Router } from 'express';
import { createEventSchema, rsvpSchema } from '@campusconnect/shared';
import { prisma } from '../lib/prisma.js';
import { ah } from '../lib/async.js';
import { ApiError } from '../lib/errors.js';
import { authed, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { publicUserSelect, safeJson, toPublicUser } from '../services/serialize.js';
import { KARMA, grantKarma, reevaluateBadges } from '../services/karma.service.js';

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

async function hostNameFor(hostType: string, hostId: string): Promise<string> {
  if (hostType === 'CLUB') {
    return (
      (await prisma.club.findUnique({ where: { id: hostId }, select: { name: true } }))?.name ??
      'A club'
    );
  }
  if (hostType === 'SPACE') {
    return (
      (await prisma.space.findUnique({ where: { id: hostId }, select: { name: true } }))?.name ??
      'A space'
    );
  }
  if (hostType === 'USER') {
    return (
      (await prisma.user.findUnique({ where: { id: hostId }, select: { displayName: true } }))
        ?.displayName ?? 'A student'
    );
  }
  // CAMPUS events have no host row — the campus itself is the host.
  return 'Lakeshore University';
}

/** "3 people from your major are going" (§5.7). Returns null rather than "0 people". */
async function socialProofFor(eventId: string, userId: string): Promise<string | null> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { majorId: true } });
  if (!me?.majorId) return null;
  const count = await prisma.eventRSVP.count({
    where: { eventId, status: 'GOING', userId: { not: userId }, user: { majorId: me.majorId } },
  });
  if (count === 0) return null;
  const major = await prisma.major.findUnique({
    where: { id: me.majorId },
    select: { name: true },
  });
  return `${count} ${count === 1 ? 'person' : 'people'} from ${major?.name ?? 'your major'} ${count === 1 ? 'is' : 'are'} going`;
}

eventsRouter.get(
  '/',
  ah(async (req, res) => {
    const me = authed(req).id;
    const from = req.query.from ? new Date(String(req.query.from)) : new Date();
    const to = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + 42 * 864e5);
    const myClubsOnly = req.query.mine === 'true';

    let hostIds: string[] | undefined;
    if (myClubsOnly) {
      const memberships = await prisma.clubMembership.findMany({
        where: { userId: me },
        select: { clubId: true },
      });
      hostIds = memberships.map((m) => m.clubId);
    }

    const events = await prisma.event.findMany({
      where: {
        startsAt: { gte: from, lte: to },
        ...(hostIds ? { hostType: 'CLUB', hostId: { in: hostIds } } : {}),
      },
      orderBy: { startsAt: 'asc' },
      include: { rsvps: { select: { status: true, userId: true } } },
    });

    res.json(
      await Promise.all(
        events.map(async (e) => ({
          id: e.id,
          title: e.title,
          description: e.description,
          hostType: e.hostType,
          hostId: e.hostId,
          hostName: await hostNameFor(e.hostType, e.hostId),
          startsAt: e.startsAt.toISOString(),
          endsAt: e.endsAt.toISOString(),
          location: e.location,
          locationDetail: e.locationDetail,
          capacity: e.capacity,
          coverUrl: e.coverUrl,
          tags: safeJson<string[]>(e.tags, []),
          goingCount: e.rsvps.filter((r) => r.status === 'GOING').length,
          interestedCount: e.rsvps.filter((r) => r.status === 'INTERESTED').length,
          myRsvp: e.rsvps.find((r) => r.userId === me)?.status ?? null,
          socialProof: await socialProofFor(e.id, me),
        })),
      ),
    );
  }),
);

/** Home-page "This Week" digest: events from clubs you're in plus your major (§5.7). */
eventsRouter.get(
  '/this-week',
  ah(async (req, res) => {
    const me = authed(req).id;
    const now = new Date();
    const weekOut = new Date(now.getTime() + 7 * 864e5);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: me },
      select: { majorId: true, clubMemberships: { select: { clubId: true } } },
    });
    const clubIds = user.clubMemberships.map((m) => m.clubId);
    const majorSpace = user.majorId
      ? await prisma.space.findFirst({
          where: { linkedMajorId: user.majorId },
          select: { id: true },
        })
      : null;

    const events = await prisma.event.findMany({
      where: {
        startsAt: { gte: now, lte: weekOut },
        OR: [
          { hostType: 'CLUB', hostId: { in: clubIds } },
          ...(majorSpace ? [{ hostType: 'SPACE', hostId: majorSpace.id }] : []),
          { hostType: 'CAMPUS' },
        ],
      },
      orderBy: { startsAt: 'asc' },
      take: 12,
      include: { rsvps: { select: { status: true, userId: true } } },
    });

    res.json(
      await Promise.all(
        events.map(async (e) => ({
          id: e.id,
          title: e.title,
          hostName: await hostNameFor(e.hostType, e.hostId),
          startsAt: e.startsAt.toISOString(),
          endsAt: e.endsAt.toISOString(),
          location: e.location,
          tags: safeJson<string[]>(e.tags, []),
          goingCount: e.rsvps.filter((r) => r.status === 'GOING').length,
          myRsvp: e.rsvps.find((r) => r.userId === me)?.status ?? null,
        })),
      ),
    );
  }),
);

eventsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const me = authed(req).id;
    const event = await prisma.event.findUnique({
      where: { id: req.params.id! },
      include: {
        rsvps: {
          select: { status: true, userId: true, user: { select: publicUserSelect } },
        },
      },
    });
    if (!event) throw ApiError.notFound('No event there');

    res.json({
      id: event.id,
      title: event.title,
      description: event.description,
      hostType: event.hostType,
      hostId: event.hostId,
      hostName: await hostNameFor(event.hostType, event.hostId),
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      location: event.location,
      locationDetail: event.locationDetail,
      capacity: event.capacity,
      coverUrl: event.coverUrl,
      tags: safeJson<string[]>(event.tags, []),
      goingCount: event.rsvps.filter((r) => r.status === 'GOING').length,
      interestedCount: event.rsvps.filter((r) => r.status === 'INTERESTED').length,
      myRsvp: event.rsvps.find((r) => r.userId === me)?.status ?? null,
      socialProof: await socialProofFor(event.id, me),
      attendees: event.rsvps
        .filter((r) => r.status === 'GOING')
        .map((r) => toPublicUser(r.user))
        .slice(0, 30),
    });
  }),
);

eventsRouter.post(
  '/',
  validateBody(createEventSchema),
  ah(async (req, res) => {
    const me = authed(req).id;
    const event = await prisma.event.create({
      data: { ...req.body, tags: JSON.stringify(req.body.tags) },
    });
    await grantKarma(me, KARMA.EVENT_HOSTED);
    void reevaluateBadges(me);
    res.status(201).json(event);
  }),
);

eventsRouter.post(
  '/:id/rsvp',
  validateBody(rsvpSchema),
  ah(async (req, res) => {
    const me = authed(req).id;
    const eventId = req.params.id!;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { capacity: true },
    });
    if (!event) throw ApiError.notFound('No event there');

    if (req.body.status === 'GOING' && event.capacity) {
      const going = await prisma.eventRSVP.count({
        where: { eventId, status: 'GOING', userId: { not: me } },
      });
      if (going >= event.capacity) throw ApiError.conflict('This event is full');
    }

    await prisma.eventRSVP.upsert({
      where: { eventId_userId: { eventId, userId: me } },
      create: { eventId, userId: me, status: req.body.status },
      update: { status: req.body.status },
    });
    void reevaluateBadges(me);
    res.json({ status: req.body.status });
  }),
);
