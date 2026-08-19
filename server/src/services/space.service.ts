import type { ChannelDto, SpaceDto, SpaceRole } from '@campusconnect/shared';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';

const ROLE_RANK: Record<SpaceRole, number> = { MEMBER: 0, MOD: 1, ADMIN: 2, OWNER: 3 };

export function atLeast(role: SpaceRole | null | undefined, required: SpaceRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export async function roleIn(spaceId: string, userId: string): Promise<SpaceRole | null> {
  const member = await prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId, userId } },
    select: { role: true },
  });
  return (member?.role as SpaceRole) ?? null;
}

/** Throws unless the viewer may read the space. Public spaces are readable by any signed-in
 *  student — campus-scoped means the campus is the access boundary (§1). */
export async function assertCanView(spaceId: string, userId: string) {
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { visibility: true },
  });
  if (!space) throw ApiError.notFound('No space there');
  if (space.visibility === 'PUBLIC') return;
  if (!(await roleIn(spaceId, userId))) throw ApiError.forbidden('That space is private');
}

export async function assertRole(spaceId: string, userId: string, required: SpaceRole) {
  const role = await roleIn(spaceId, userId);
  if (!atLeast(role, required)) {
    throw ApiError.forbidden(`You need to be ${required.toLowerCase()} or above to do that`);
  }
  return role!;
}

export async function listMySpaces(userId: string): Promise<SpaceDto[]> {
  const memberships = await prisma.spaceMember.findMany({
    where: { userId },
    orderBy: { joinedAt: 'asc' },
    select: {
      role: true,
      space: {
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
      },
    },
  });

  return memberships.map((m) => ({
    id: m.space.id,
    name: m.space.name,
    slug: m.space.slug,
    description: m.space.description,
    iconUrl: m.space.iconUrl,
    bannerUrl: m.space.bannerUrl,
    type: m.space.type as SpaceDto['type'],
    memberCount: m.space._count.members,
    myRole: m.role as SpaceRole,
  }));
}

export async function getSpaceWithChannels(spaceId: string, userId: string): Promise<SpaceDto> {
  await assertCanView(spaceId, userId);

  const space = await prisma.space.findUniqueOrThrow({
    where: { id: spaceId },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      iconUrl: true,
      bannerUrl: true,
      type: true,
      _count: { select: { members: true } },
      channels: {
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          spaceId: true,
          name: true,
          topic: true,
          type: true,
          position: true,
          isDefault: true,
        },
      },
    },
  });

  const reads = await prisma.channelRead.findMany({
    where: { userId, channelId: { in: space.channels.map((c) => c.id) } },
    select: { channelId: true, lastReadAt: true },
  });
  const readMap = new Map(reads.map((r) => [r.channelId, r.lastReadAt]));

  const channels: ChannelDto[] = await Promise.all(
    space.channels.map(async (c) => ({
      ...c,
      type: c.type as ChannelDto['type'],
      unreadCount: await prisma.message.count({
        where: {
          channelId: c.id,
          deletedAt: null,
          threadRootId: null,
          createdAt: { gt: readMap.get(c.id) ?? new Date(0) },
          authorId: { not: userId },
        },
      }),
    })),
  );

  return {
    id: space.id,
    name: space.name,
    slug: space.slug,
    description: space.description,
    iconUrl: space.iconUrl,
    bannerUrl: space.bannerUrl,
    type: space.type as SpaceDto['type'],
    memberCount: space._count.members,
    myRole: await roleIn(spaceId, userId),
    channels,
  };
}

export async function joinSpace(spaceId: string, userId: string) {
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { visibility: true },
  });
  if (!space) throw ApiError.notFound('No space there');
  if (space.visibility === 'PRIVATE') {
    throw ApiError.forbidden('That space is invite-only');
  }
  await prisma.spaceMember.upsert({
    where: { spaceId_userId: { spaceId, userId } },
    create: { spaceId, userId, role: 'MEMBER' },
    update: {},
  });
  return getSpaceWithChannels(spaceId, userId);
}

export async function leaveSpace(spaceId: string, userId: string) {
  const role = await roleIn(spaceId, userId);
  if (role === 'OWNER') {
    throw ApiError.badRequest('Hand the space to someone else before you leave it');
  }
  await prisma.spaceMember.deleteMany({ where: { spaceId, userId } });
}

export async function markChannelRead(channelId: string, userId: string) {
  await prisma.channelRead.upsert({
    where: { channelId_userId: { channelId, userId } },
    create: { channelId, userId, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });
}
