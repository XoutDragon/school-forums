import { Router } from 'express';
import { z } from 'zod';
import { createListingSchema, createReportSchema, searchQuerySchema } from '@campusconnect/shared';
import { prisma } from '../lib/prisma.js';
import { ah } from '../lib/async.js';
import { ApiError } from '../lib/errors.js';
import { authed, requireAdmin, requireAuth } from '../middleware/auth.js';
import { query, validateBody, validateQuery } from '../middleware/validate.js';
import { limits } from '../middleware/rateLimit.js';
import { upload, publicUrlFor } from '../middleware/upload.js';
import { publicUserSelect, safeJson, toPublicUser } from '../services/serialize.js';
import { search } from '../services/search.service.js';
import * as notifications from '../services/notification.service.js';
import { softFilterWords } from '../lib/wordfilter.js';
import { notify } from '../services/notification.service.js';
import { openConversation } from '../services/dm.service.js';

// ── Catalog: majors, interests, badges, filter words ───────────────────────

export const catalogRouter = Router();

catalogRouter.get(
  '/majors',
  ah(async (_req, res) => {
    const majors = await prisma.major.findMany({
      orderBy: [{ faculty: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        faculty: true,
        description: true,
        _count: { select: { usersMajoring: true, courses: true } },
      },
    });
    res.json(
      majors.map((m) => ({
        id: m.id,
        name: m.name,
        faculty: m.faculty,
        description: m.description,
        studentCount: m._count.usersMajoring,
        courseCount: m._count.courses,
      })),
    );
  }),
);

catalogRouter.get(
  '/majors/:id',
  requireAuth,
  ah(async (req, res) => {
    const major = await prisma.major.findUnique({
      where: { id: req.params.id! },
      select: { id: true, name: true, faculty: true, description: true },
    });
    if (!major) throw ApiError.notFound('No major there');

    const me = await prisma.user.findUniqueOrThrow({
      where: { id: authed(req).id },
      select: { year: true },
    });

    const [space, byYear, peers, events] = await Promise.all([
      prisma.space.findFirst({
        where: { linkedMajorId: major.id },
        select: { id: true, name: true, slug: true },
      }),
      prisma.user.groupBy({
        by: ['year'],
        where: { majorId: major.id, deletedAt: null },
        _count: { _all: true },
      }),
      // "People in your year" — discoverable students only (§5.3).
      prisma.user.findMany({
        where: {
          majorId: major.id,
          year: me.year,
          deletedAt: null,
          id: { not: authed(req).id },
          settings: { contains: '"discoverable":true' },
        },
        take: 18,
        select: publicUserSelect,
      }),
      prisma.event.findMany({
        where: { startsAt: { gte: new Date() }, tags: { contains: major.name } },
        orderBy: { startsAt: 'asc' },
        take: 5,
        select: { id: true, title: true, startsAt: true, location: true },
      }),
    ]);

    const topResources = await prisma.resource.findMany({
      where: { course: { majorId: major.id } },
      orderBy: { score: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        type: true,
        score: true,
        term: true,
        course: { select: { code: true } },
      },
    });

    res.json({
      ...major,
      space,
      byYear: byYear.map((y) => ({ year: y.year, count: y._count._all })),
      peers: peers.map((p) => toPublicUser(p)),
      events: events.map((e) => ({ ...e, startsAt: e.startsAt.toISOString() })),
      topResources,
    });
  }),
);

catalogRouter.get(
  '/interests',
  ah(async (_req, res) => {
    res.json(
      await prisma.interest.findMany({
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, category: true },
      }),
    );
  }),
);

catalogRouter.get('/filter-words', (_req, res) => res.json({ words: softFilterWords }));

// ── Search ────────────────────────────────────────────────────────────────

export const searchRouter = Router();
searchRouter.use(requireAuth);

searchRouter.get(
  '/',
  validateQuery(searchQuerySchema),
  ah(async (req, res) => {
    res.json(await search(query(req)));
  }),
);

// ── Notifications ─────────────────────────────────────────────────────────

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  ah(async (req, res) => {
    const me = authed(req).id;
    res.json({
      items: await notifications.listNotifications(me),
      unread: await notifications.unreadCount(me),
    });
  }),
);

notificationsRouter.post(
  '/read-all',
  ah(async (req, res) => {
    await notifications.markAllRead(authed(req).id);
    res.status(204).end();
  }),
);

notificationsRouter.post(
  '/:id/read',
  ah(async (req, res) => {
    await notifications.markRead(authed(req).id, req.params.id!);
    res.status(204).end();
  }),
);

// ── Uploads ───────────────────────────────────────────────────────────────

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);

uploadsRouter.post('/', limits.uploads, upload.array('files', 5), (req, res) => {
  const files = (req.files ?? []) as Express.Multer.File[];
  res.status(201).json(
    files.map((f) => ({
      url: publicUrlFor(f.filename),
      name: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
    })),
  );
});

// ── Marketplace, lost & found, mentorship ─────────────────────────────────

export const campusRouter = Router();
campusRouter.use(requireAuth);

campusRouter.get(
  '/listings',
  ah(async (req, res) => {
    const listings = await prisma.marketplaceListing.findMany({
      where: {
        status: req.query.status ? String(req.query.status) : 'ACTIVE',
        ...(req.query.category && req.query.category !== 'ALL'
          ? { category: String(req.query.category) }
          : {}),
        ...(req.query.courseId ? { courseId: String(req.query.courseId) } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: {
        id: true,
        title: true,
        description: true,
        priceCents: true,
        category: true,
        photos: true,
        status: true,
        createdAt: true,
        seller: { select: publicUserSelect },
        course: { select: { id: true, code: true } },
      },
    });
    res.json(
      listings.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
        photos: safeJson<string[]>(l.photos, []),
        seller: toPublicUser(l.seller),
      })),
    );
  }),
);

campusRouter.post(
  '/listings',
  validateBody(createListingSchema),
  ah(async (req, res) => {
    const listing = await prisma.marketplaceListing.create({
      data: { ...req.body, photos: JSON.stringify(req.body.photos), sellerId: authed(req).id },
    });
    res.status(201).json(listing);
  }),
);

campusRouter.post(
  '/listings/:id/status',
  validateBody(z.object({ status: z.enum(['ACTIVE', 'PENDING', 'SOLD']) })),
  ah(async (req, res) => {
    const me = authed(req).id;
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: req.params.id! },
      select: { sellerId: true },
    });
    if (!listing) throw ApiError.notFound('No listing there');
    if (listing.sellerId !== me) throw ApiError.forbidden("That listing isn't yours");

    await prisma.marketplaceListing.update({
      where: { id: req.params.id! },
      data: { status: req.body.status },
    });
    res.json({ status: req.body.status });
  }),
);

/** "Message seller" opens a DM — there are no payments in this app (§5.8). */
campusRouter.post(
  '/listings/:id/message',
  ah(async (req, res) => {
    const me = authed(req).id;
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: req.params.id! },
      select: { sellerId: true, title: true },
    });
    if (!listing) throw ApiError.notFound('No listing there');
    const conversation = await openConversation(me, [listing.sellerId]);
    res.status(201).json({ conversationId: conversation.id, about: listing.title });
  }),
);

campusRouter.get(
  '/lost-found',
  ah(async (req, res) => {
    const items = await prisma.lostFoundItem.findMany({
      where: { status: req.query.status ? String(req.query.status) : 'OPEN' },
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: {
        id: true,
        kind: true,
        title: true,
        description: true,
        location: true,
        photoUrl: true,
        status: true,
        createdAt: true,
        reporter: { select: publicUserSelect },
      },
    });
    res.json(
      items.map((i) => ({
        ...i,
        createdAt: i.createdAt.toISOString(),
        reporter: toPublicUser(i.reporter),
      })),
    );
  }),
);

campusRouter.post(
  '/lost-found',
  validateBody(
    z.object({
      kind: z.enum(['LOST', 'FOUND']),
      title: z.string().min(3).max(120),
      description: z.string().min(5).max(1000),
      location: z.string().min(2).max(120),
      photoUrl: z.string().nullish(),
    }),
  ),
  ah(async (req, res) => {
    const item = await prisma.lostFoundItem.create({
      data: { ...req.body, reporterId: authed(req).id },
    });
    res.status(201).json(item);
  }),
);

campusRouter.post(
  '/lost-found/:id/resolve',
  ah(async (req, res) => {
    await prisma.lostFoundItem.updateMany({
      where: { id: req.params.id!, reporterId: authed(req).id },
      data: { status: 'RESOLVED' },
    });
    res.json({ status: 'RESOLVED' });
  }),
);

campusRouter.get(
  '/mentors',
  ah(async (req, res) => {
    const majorId = req.query.majorId ? String(req.query.majorId) : undefined;
    const mentors = await prisma.mentorProfile.findMany({
      where: { isMentor: true, ...(majorId ? { user: { majorId } } : {}) },
      select: {
        id: true,
        capacity: true,
        topics: true,
        blurb: true,
        user: { select: publicUserSelect },
      },
      take: 40,
    });

    const activeCounts = await prisma.mentorLink.groupBy({
      by: ['mentorId'],
      where: { status: 'ACTIVE' },
      _count: { _all: true },
    });
    const takenBy = new Map(activeCounts.map((c) => [c.mentorId, c._count._all]));

    res.json(
      mentors.map((m) => ({
        id: m.id,
        user: toPublicUser(m.user),
        topics: safeJson<string[]>(m.topics, []),
        blurb: m.blurb,
        capacity: m.capacity,
        taken: takenBy.get(m.user.id) ?? 0,
        hasRoom: (takenBy.get(m.user.id) ?? 0) < m.capacity,
      })),
    );
  }),
);

campusRouter.post(
  '/mentors/:userId/request',
  validateBody(z.object({ message: z.string().max(500).optional() })),
  ah(async (req, res) => {
    const me = authed(req).id;
    const mentorId = req.params.userId!;
    if (me === mentorId) throw ApiError.badRequest("You can't mentor yourself");

    const profile = await prisma.mentorProfile.findUnique({
      where: { userId: mentorId },
      select: { capacity: true },
    });
    if (!profile) throw ApiError.notFound("That student isn't mentoring");

    const active = await prisma.mentorLink.count({ where: { mentorId, status: 'ACTIVE' } });
    if (active >= profile.capacity) throw ApiError.conflict('That mentor is at capacity');

    await prisma.mentorLink.upsert({
      where: { mentorId_menteeId: { mentorId, menteeId: me } },
      create: { mentorId, menteeId: me, status: 'REQUESTED', message: req.body.message ?? null },
      update: { message: req.body.message ?? null },
    });

    const mentee = await prisma.user.findUniqueOrThrow({
      where: { id: me },
      select: { displayName: true, username: true },
    });
    await notify(mentorId, 'MENTOR_REQUEST', {
      userId: me,
      name: mentee.displayName,
      username: mentee.username,
      message: req.body.message ?? null,
    });
    res.status(201).json({ status: 'REQUESTED' });
  }),
);

campusRouter.post(
  '/mentors/requests/:id/accept',
  ah(async (req, res) => {
    const me = authed(req).id;
    const link = await prisma.mentorLink.findUnique({ where: { id: req.params.id! } });
    if (!link) throw ApiError.notFound('No request there');
    if (link.mentorId !== me) throw ApiError.forbidden('Not your request to accept');

    await prisma.mentorLink.update({ where: { id: link.id }, data: { status: 'ACTIVE' } });
    const conversation = await openConversation(me, [link.menteeId]);
    await notify(link.menteeId, 'MENTOR_ACCEPTED', {
      userId: me,
      conversationId: conversation.id,
    });
    res.json({ status: 'ACTIVE', conversationId: conversation.id });
  }),
);

// ── Moderation ────────────────────────────────────────────────────────────

export const moderationRouter = Router();
moderationRouter.use(requireAuth);

moderationRouter.post(
  '/reports',
  limits.reports,
  validateBody(createReportSchema),
  ah(async (req, res) => {
    const report = await prisma.report.create({
      data: { ...req.body, reporterId: authed(req).id },
    });
    res.status(201).json({ id: report.id, status: report.status });
  }),
);

moderationRouter.get(
  '/reports',
  requireAdmin,
  ah(async (_req, res) => {
    const reports = await prisma.report.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        targetType: true,
        targetId: true,
        reason: true,
        createdAt: true,
        reporter: { select: publicUserSelect },
      },
    });
    res.json(
      reports.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        reporter: toPublicUser(r.reporter),
      })),
    );
  }),
);

moderationRouter.post(
  '/reports/:id/resolve',
  requireAdmin,
  validateBody(z.object({ status: z.enum(['ACTIONED', 'DISMISSED']) })),
  ah(async (req, res) => {
    await prisma.report.update({
      where: { id: req.params.id! },
      data: { status: req.body.status, resolvedById: authed(req).id },
    });
    res.json({ status: req.body.status });
  }),
);

/** Unmasking an anonymous post is itself a moderation action and is logged as one (§5.10). */
moderationRouter.get(
  '/messages/:id/author',
  requireAdmin,
  ah(async (req, res) => {
    const message = await prisma.message.findUnique({
      where: { id: req.params.id! },
      select: { authorId: true, isAnonymous: true, content: true },
    });
    if (!message) throw ApiError.notFound('No message there');
    if (!message.authorId) return res.json({ author: null });

    await prisma.moderationAction.create({
      data: {
        moderatorId: authed(req).id,
        targetUserId: message.authorId,
        type: 'CONTENT_REMOVED',
        reason: `Viewed authorship of anonymous message ${req.params.id}`,
      },
    });

    const author = await prisma.user.findUnique({
      where: { id: message.authorId },
      select: publicUserSelect,
    });
    res.json({ author: author ? toPublicUser(author) : null });
  }),
);
