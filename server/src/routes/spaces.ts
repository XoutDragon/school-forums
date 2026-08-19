import { Router } from 'express';
import { createChannelSchema, createSpaceSchema } from '@campusconnect/shared';
import { prisma } from '../lib/prisma.js';
import { ah } from '../lib/async.js';
import { ApiError } from '../lib/errors.js';
import { authed, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import * as spaceService from '../services/space.service.js';
import { publicUserSelect, toPublicUser } from '../services/serialize.js';
import { onlineIds } from '../sockets/presence.js';

export const spacesRouter = Router();
spacesRouter.use(requireAuth);

spacesRouter.get(
  '/',
  ah(async (req, res) => {
    res.json(await spaceService.listMySpaces(authed(req).id));
  }),
);

spacesRouter.get(
  '/discover',
  ah(async (req, res) => {
    const me = authed(req).id;
    const spaces = await prisma.space.findMany({
      where: { visibility: 'PUBLIC', members: { none: { userId: me } } },
      orderBy: { members: { _count: 'desc' } },
      take: 24,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        iconUrl: true,
        bannerUrl: true,
        type: true,
        _count: { select: { members: true } },
      },
    });
    res.json(
      spaces.map((s) => ({
        ...s,
        memberCount: s._count.members,
        myRole: null,
      })),
    );
  }),
);

spacesRouter.post(
  '/',
  validateBody(createSpaceSchema),
  ah(async (req, res) => {
    const me = authed(req).id;
    const slug = await uniqueSlug(req.body.name);

    const space = await prisma.space.create({
      data: {
        ...req.body,
        slug,
        ownerId: me,
        members: { create: { userId: me, role: 'OWNER' } },
        channels: {
          create: [
            { name: 'general', type: 'TEXT', position: 0, isDefault: true },
            { name: 'resources', type: 'RESOURCES', position: 1 },
          ],
        },
      },
      select: { id: true },
    });
    res.status(201).json(await spaceService.getSpaceWithChannels(space.id, me));
  }),
);

spacesRouter.get(
  '/:spaceId',
  ah(async (req, res) => {
    res.json(await spaceService.getSpaceWithChannels(req.params.spaceId!, authed(req).id));
  }),
);

spacesRouter.get(
  '/:spaceId/members',
  ah(async (req, res) => {
    const me = authed(req).id;
    const spaceId = req.params.spaceId!;
    await spaceService.assertCanView(spaceId, me);

    const members = await prisma.spaceMember.findMany({
      where: { spaceId },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      select: { role: true, nickname: true, user: { select: publicUserSelect } },
    });
    const online = onlineIds();
    res.json(
      members.map((m) => ({
        role: m.role,
        nickname: m.nickname,
        user: toPublicUser(m.user, online.has(m.user.id)),
      })),
    );
  }),
);

spacesRouter.post(
  '/:spaceId/join',
  ah(async (req, res) => {
    res.json(await spaceService.joinSpace(req.params.spaceId!, authed(req).id));
  }),
);

spacesRouter.post(
  '/:spaceId/leave',
  ah(async (req, res) => {
    await spaceService.leaveSpace(req.params.spaceId!, authed(req).id);
    res.status(204).end();
  }),
);

spacesRouter.post(
  '/:spaceId/channels',
  validateBody(createChannelSchema),
  ah(async (req, res) => {
    const spaceId = req.params.spaceId!;
    await spaceService.assertRole(spaceId, authed(req).id, 'ADMIN');

    const clash = await prisma.channel.findUnique({
      where: { spaceId_name: { spaceId, name: req.body.name } },
      select: { id: true },
    });
    if (clash) throw ApiError.conflict(`#${req.body.name} already exists in this space`);

    const position = await prisma.channel.count({ where: { spaceId } });
    const channel = await prisma.channel.create({
      data: { ...req.body, spaceId, position },
    });
    res.status(201).json(channel);
  }),
);

async function uniqueSlug(name: string) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'space';
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i}`;
    const taken = await prisma.space.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now()}`;
}
