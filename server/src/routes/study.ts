import { Router } from 'express';
import { z } from 'zod';
import { buddyProfileSchema, createStudyGroupSchema } from '@campusconnect/shared';
import { prisma } from '../lib/prisma.js';
import { ah } from '../lib/async.js';
import { ApiError } from '../lib/errors.js';
import { authed, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { publicUserSelect, safeJson, toPublicUser } from '../services/serialize.js';
import { findMatches } from '../services/buddy.service.js';
import { notify } from '../services/notification.service.js';
import { openConversation } from '../services/dm.service.js';
import { reevaluateBadges } from '../services/karma.service.js';

export const studyRouter = Router();
studyRouter.use(requireAuth);

// ── Study groups ───────────────────────────────────────────────────────────

studyRouter.get(
  '/groups',
  ah(async (req, res) => {
    const me = authed(req).id;
    const groups = await prisma.studyGroup.findMany({
      where: {
        ...(req.query.courseId ? { courseId: String(req.query.courseId) } : {}),
        status: { not: 'ARCHIVED' },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        description: true,
        maxSize: true,
        meetingType: true,
        locationHint: true,
        status: true,
        schedule: true,
        createdAt: true,
        course: { select: { id: true, code: true, title: true } },
        owner: { select: publicUserSelect },
        members: { select: { userId: true, status: true, user: { select: publicUserSelect } } },
      },
    });

    res.json(
      groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        maxSize: g.maxSize,
        meetingType: g.meetingType,
        locationHint: g.locationHint,
        status: g.status,
        schedule: safeJson<boolean[]>(g.schedule, []),
        course: g.course,
        owner: toPublicUser(g.owner),
        members: g.members.filter((m) => m.status === 'MEMBER').map((m) => toPublicUser(m.user)),
        memberCount: g.members.filter((m) => m.status === 'MEMBER').length,
        myStatus: g.members.find((m) => m.userId === me)?.status ?? null,
        isOwner: g.owner.id === me,
        // Only the owner ever sees who is waiting — a public list of people who asked
        // and haven't been let in yet would be its own small humiliation.
        pending:
          g.owner.id === me
            ? g.members.filter((m) => m.status === 'REQUESTED').map((m) => toPublicUser(m.user))
            : [],
        pendingCount: g.members.filter((m) => m.status === 'REQUESTED').length,
      })),
    );
  }),
);

studyRouter.post(
  '/groups',
  validateBody(createStudyGroupSchema),
  ah(async (req, res) => {
    const me = authed(req).id;
    const group = await prisma.studyGroup.create({
      data: {
        ...req.body,
        schedule: JSON.stringify(req.body.schedule ?? []),
        ownerId: me,
        members: { create: { userId: me, status: 'MEMBER' } },
      },
      select: { id: true },
    });

    // Every group gets its own private group DM (§5.6) — the group exists as a
    // conversation from minute one rather than after someone works up the nerve.
    await openConversation(me, [], req.body.name).catch(() => undefined);
    res.status(201).json({ id: group.id });
  }),
);

studyRouter.post(
  '/groups/:id/request',
  ah(async (req, res) => {
    const me = authed(req).id;
    const group = await prisma.studyGroup.findUnique({
      where: { id: req.params.id! },
      select: {
        ownerId: true,
        maxSize: true,
        name: true,
        status: true,
        _count: { select: { members: true } },
      },
    });
    if (!group) throw ApiError.notFound('No group there');
    if (group.status !== 'OPEN') throw ApiError.conflict('That group has stopped taking people');

    await prisma.studyGroupMember.upsert({
      where: { groupId_userId: { groupId: req.params.id!, userId: me } },
      create: { groupId: req.params.id!, userId: me, status: 'REQUESTED' },
      update: {},
    });

    const asker = await prisma.user.findUniqueOrThrow({
      where: { id: me },
      select: { displayName: true, username: true },
    });
    await notify(group.ownerId, 'STUDY_GROUP_REQUEST', {
      groupId: req.params.id,
      groupName: group.name,
      userId: me,
      name: asker.displayName,
      username: asker.username,
    });
    res.status(201).json({ status: 'REQUESTED' });
  }),
);

studyRouter.post(
  '/groups/:id/approve/:userId',
  ah(async (req, res) => {
    const me = authed(req).id;
    const groupId = req.params.id!;
    const group = await prisma.studyGroup.findUnique({
      where: { id: groupId },
      select: { ownerId: true, maxSize: true, name: true },
    });
    if (!group) throw ApiError.notFound('No group there');
    if (group.ownerId !== me) throw ApiError.forbidden('Only the group owner approves requests');

    await prisma.studyGroupMember.update({
      where: { groupId_userId: { groupId, userId: req.params.userId! } },
      data: { status: 'MEMBER' },
    });

    const memberCount = await prisma.studyGroupMember.count({
      where: { groupId, status: 'MEMBER' },
    });
    if (memberCount >= group.maxSize) {
      await prisma.studyGroup.update({ where: { id: groupId }, data: { status: 'FULL' } });
      void reevaluateBadges(group.ownerId); // "Founder" — a group that actually filled
    }

    await notify(req.params.userId!, 'STUDY_GROUP_APPROVED', {
      groupId,
      groupName: group.name,
    });
    res.json({ status: 'MEMBER', memberCount });
  }),
);

// ── Buddy matching ─────────────────────────────────────────────────────────

studyRouter.get(
  '/buddy/profile',
  ah(async (req, res) => {
    const profile = await prisma.buddyProfile.findUnique({
      where: { userId: authed(req).id },
    });
    res.json(
      profile
        ? {
            isActive: profile.isActive,
            lookingFor: safeJson<string[]>(profile.lookingFor, []),
            availability: safeJson<boolean[]>(profile.availability, []),
            note: profile.note,
          }
        : null,
    );
  }),
);

studyRouter.put(
  '/buddy/profile',
  validateBody(buddyProfileSchema),
  ah(async (req, res) => {
    const me = authed(req).id;
    const data = {
      isActive: req.body.isActive,
      lookingFor: JSON.stringify(req.body.lookingFor),
      availability: JSON.stringify(req.body.availability),
      note: req.body.note ?? null,
    };
    await prisma.buddyProfile.upsert({
      where: { userId: me },
      create: { userId: me, ...data },
      update: data,
    });
    res.json({ ok: true });
  }),
);

studyRouter.get(
  '/buddy/matches',
  ah(async (req, res) => {
    res.json(await findMatches(authed(req).id));
  }),
);

const ICEBREAKERS = [
  'Hey! We matched on CampusConnect — what are you finding hardest this term?',
  'Hi! Fair warning: I opened this chat before deciding what to say. What are you working on?',
  "Hey — apparently we're both free at the same weird hours. Want to compare timetables?",
];

studyRouter.post(
  '/buddy/matches/:id',
  validateBody(z.object({ action: z.enum(['CONNECT', 'DISMISS']) })),
  ah(async (req, res) => {
    const me = authed(req).id;
    const match = await prisma.buddyMatch.findUnique({ where: { id: req.params.id! } });
    if (!match) throw ApiError.notFound('No match there');
    if (match.userAId !== me && match.userBId !== me) throw ApiError.forbidden('Not your match');

    const otherId = match.userAId === me ? match.userBId : match.userAId;

    if (req.body.action === 'DISMISS') {
      // §5.6: dismissed means never resurface, so the row stays as a tombstone.
      await prisma.buddyMatch.update({ where: { id: match.id }, data: { status: 'DISMISSED' } });
      return res.json({ status: 'DISMISSED' });
    }

    await prisma.buddyMatch.update({ where: { id: match.id }, data: { status: 'CONNECTED' } });
    const icebreaker = ICEBREAKERS[Math.floor(Math.random() * ICEBREAKERS.length)]!;
    const conversation = await openConversation(me, [otherId]);
    await notify(otherId, 'BUDDY_CONNECTED', { conversationId: conversation.id, userId: me });
    void reevaluateBadges(me);

    res.json({ status: 'CONNECTED', conversationId: conversation.id, icebreaker });
  }),
);
