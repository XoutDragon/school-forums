import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah } from '../lib/async.js';
import { ApiError } from '../lib/errors.js';
import { authed, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { publicUserSelect, safeJson, toPublicUser } from '../services/serialize.js';
import { reevaluateBadges } from '../services/karma.service.js';
import { notify } from '../services/notification.service.js';

export const clubsRouter = Router();
clubsRouter.use(requireAuth);

const clubCard = {
  id: true,
  name: true,
  slug: true,
  description: true,
  category: true,
  logoUrl: true,
  meetingInfo: true,
  isRecruiting: true,
  tags: true,
  _count: { select: { memberships: true } },
  space: { select: { id: true } },
} as const;

clubsRouter.get(
  '/',
  ah(async (req, res) => {
    const me = authed(req).id;
    const category = req.query.category ? String(req.query.category) : undefined;
    const recruiting = req.query.recruiting === 'true';
    const q = String(req.query.q ?? '').trim();
    const sort = req.query.sort === 'newest' ? 'newest' : 'members';

    const clubs = await prisma.club.findMany({
      where: {
        ...(category && category !== 'ALL' ? { category } : {}),
        ...(recruiting ? { isRecruiting: true } : {}),
        ...(q ? { OR: [{ name: { contains: q } }, { description: { contains: q } }] } : {}),
      },
      orderBy: sort === 'newest' ? { createdAt: 'desc' } : { memberships: { _count: 'desc' } },
      select: clubCard,
    });

    const mine = await prisma.clubMembership.findMany({
      where: { userId: me, clubId: { in: clubs.map((c) => c.id) } },
      select: { clubId: true, role: true },
    });
    const roleByClub = new Map(mine.map((m) => [m.clubId, m.role]));

    res.json(
      clubs.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        category: c.category,
        logoUrl: c.logoUrl,
        meetingInfo: c.meetingInfo,
        isRecruiting: c.isRecruiting,
        memberCount: c._count.memberships,
        spaceId: c.space?.id ?? null,
        myRole: roleByClub.get(c.id) ?? null,
      })),
    );
  }),
);

clubsRouter.get(
  '/:slug',
  ah(async (req, res) => {
    const me = authed(req).id;
    const club = await prisma.club.findUnique({
      where: { slug: req.params.slug! },
      select: {
        ...clubCard,
        socialLinks: true,
        memberships: {
          where: { role: { in: ['PRESIDENT', 'EXEC'] } },
          select: { role: true, user: { select: publicUserSelect } },
        },
      },
    });
    if (!club) throw ApiError.notFound('No club there');

    const [mine, events, photos] = await Promise.all([
      prisma.clubMembership.findUnique({
        where: { clubId_userId: { clubId: club.id, userId: me } },
        select: { role: true },
      }),
      prisma.event.findMany({
        where: { hostType: 'CLUB', hostId: club.id, startsAt: { gte: new Date() } },
        orderBy: { startsAt: 'asc' },
        take: 5,
      }),
      // Photo strip = recent image attachments from the club's own space (§5.4).
      club.space
        ? prisma.message.findMany({
            where: {
              channel: { spaceId: club.space.id },
              deletedAt: null,
              NOT: { attachments: '[]' },
            },
            orderBy: { createdAt: 'desc' },
            take: 12,
            select: { attachments: true },
          })
        : Promise.resolve([]),
    ]);

    res.json({
      id: club.id,
      name: club.name,
      slug: club.slug,
      description: club.description,
      category: club.category,
      logoUrl: club.logoUrl,
      meetingInfo: club.meetingInfo,
      isRecruiting: club.isRecruiting,
      socialLinks: safeJson<Record<string, string>>(club.socialLinks, {}),
      memberCount: club._count.memberships,
      spaceId: club.space?.id ?? null,
      myRole: mine?.role ?? null,
      execs: club.memberships.map((m) => ({ role: m.role, user: toPublicUser(m.user) })),
      events: events.map((e) => ({
        ...e,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
      })),
      photos: photos
        .flatMap((m) => safeJson<{ url: string; mimeType: string }[]>(m.attachments, []))
        .filter((a) => a.mimeType?.startsWith('image/'))
        .slice(0, 8),
    });
  }),
);

/** Joining a club joins its space; following gets announcements only (§5.4). */
clubsRouter.post(
  '/:clubId/membership',
  validateBody(z.object({ role: z.enum(['MEMBER', 'FOLLOWER']) })),
  ah(async (req, res) => {
    const me = authed(req).id;
    const clubId = req.params.clubId!;
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { space: { select: { id: true } } },
    });
    if (!club) throw ApiError.notFound('No club there');

    await prisma.clubMembership.upsert({
      where: { clubId_userId: { clubId, userId: me } },
      create: { clubId, userId: me, role: req.body.role },
      update: { role: req.body.role },
    });

    if (req.body.role === 'MEMBER' && club.space) {
      await prisma.spaceMember.upsert({
        where: { spaceId_userId: { spaceId: club.space.id, userId: me } },
        create: { spaceId: club.space.id, userId: me, role: 'MEMBER' },
        update: {},
      });
    }
    void reevaluateBadges(me);
    res.status(201).json({ role: req.body.role, spaceId: club.space?.id ?? null });
  }),
);

clubsRouter.delete(
  '/:clubId/membership',
  ah(async (req, res) => {
    const me = authed(req).id;
    await prisma.clubMembership.deleteMany({ where: { clubId: req.params.clubId!, userId: me } });
    res.status(204).end();
  }),
);

/** Exec announcement: cross-posts to the club space and notifies followers (§5.4). */
clubsRouter.post(
  '/:clubId/announce',
  validateBody(z.object({ content: z.string().min(5).max(2000) })),
  ah(async (req, res) => {
    const me = authed(req).id;
    const clubId = req.params.clubId!;
    const membership = await prisma.clubMembership.findUnique({
      where: { clubId_userId: { clubId, userId: me } },
      select: { role: true, club: { select: { name: true, space: { select: { id: true } } } } },
    });
    if (!membership || !['PRESIDENT', 'EXEC'].includes(membership.role)) {
      throw ApiError.forbidden('Club execs only');
    }

    const spaceId = membership.club.space?.id;
    let messageId: string | null = null;
    if (spaceId) {
      const channel = await prisma.channel.findFirst({
        where: { spaceId, type: 'ANNOUNCEMENT' },
        select: { id: true },
      });
      if (channel) {
        const message = await prisma.message.create({
          data: { channelId: channel.id, authorId: me, content: req.body.content },
          select: { id: true },
        });
        messageId = message.id;
      }
    }

    const audience = await prisma.clubMembership.findMany({
      where: { clubId, userId: { not: me } },
      select: { userId: true },
    });
    await Promise.all(
      audience.map((a) =>
        notify(a.userId, 'ANNOUNCEMENT', {
          clubId,
          clubName: membership.club.name,
          excerpt: req.body.content.slice(0, 140),
          messageId,
        }),
      ),
    );
    res.status(201).json({ messageId, notified: audience.length });
  }),
);

// ── Club quiz (§5.4) ───────────────────────────────────────────────────────

export const QUIZ_QUESTIONS = [
  {
    id: 'when',
    prompt: 'When do you actually have energy?',
    options: [
      { label: 'Weeknights', tags: ['weeknight', 'casual'] },
      { label: 'Weekends', tags: ['weekend', 'outdoors'] },
      { label: 'Whenever, I have no schedule', tags: ['flexible', 'casual'] },
    ],
  },
  {
    id: 'mode',
    prompt: 'Pick a verb.',
    options: [
      { label: 'Build things', tags: ['making', 'technical'] },
      { label: 'Debate things', tags: ['discussion', 'academic'] },
      { label: 'Perform things', tags: ['performance', 'creative'] },
      { label: 'Move things', tags: ['sport', 'outdoors'] },
    ],
  },
  {
    id: 'size',
    prompt: 'How many people is too many people?',
    options: [
      { label: 'More than six', tags: ['small', 'casual'] },
      { label: 'A packed room is the point', tags: ['large', 'social'] },
    ],
  },
  {
    id: 'stakes',
    prompt: 'Would you compete?',
    options: [
      { label: 'Only if there is a trophy', tags: ['competitive'] },
      { label: 'I am here to hang out', tags: ['casual', 'social'] },
    ],
  },
  {
    id: 'outcome',
    prompt: 'What would make the term feel worth it?',
    options: [
      { label: 'A portfolio piece', tags: ['making', 'career'] },
      { label: 'A group chat that keeps going', tags: ['social', 'casual'] },
      { label: 'Something that helped someone', tags: ['volunteer', 'service'] },
    ],
  },
  {
    id: 'setting',
    prompt: 'Where does this happen?',
    options: [
      { label: 'A lab or a workshop', tags: ['making', 'technical'] },
      { label: 'A field or a trail', tags: ['outdoors', 'sport'] },
      { label: 'A stage or a studio', tags: ['performance', 'creative'] },
      { label: 'A booked room with snacks', tags: ['discussion', 'social'] },
    ],
  },
] as const;

clubsRouter.get('/quiz/questions', (_req, res) => res.json(QUIZ_QUESTIONS));

clubsRouter.post(
  '/quiz/results',
  validateBody(z.object({ tags: z.array(z.string()).min(1).max(30) })),
  ah(async (req, res) => {
    const picked = req.body.tags.map((t: string) => t.toLowerCase());
    const clubs = await prisma.club.findMany({ select: clubCard });

    const ranked = clubs
      .map((club) => {
        const tags = safeJson<string[]>(club.tags, []).map((t) => t.toLowerCase());
        const overlap = tags.filter((t) => picked.includes(t));
        return { club, overlap, score: overlap.length + (club.isRecruiting ? 0.5 : 0) };
      })
      .filter((r) => r.overlap.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    res.json(
      ranked.map(({ club, overlap }) => ({
        id: club.id,
        name: club.name,
        slug: club.slug,
        description: club.description,
        category: club.category,
        logoUrl: club.logoUrl,
        isRecruiting: club.isRecruiting,
        memberCount: club._count.memberships,
        matchedOn: overlap.slice(0, 3),
      })),
    );
  }),
);
