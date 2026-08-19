import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { parseSettings, publicUserSelect, safeJson, toPublicUser } from './serialize.js';

const MAX_GROUP = 10; // §4 — small group DMs only

/** Enforces the DM privacy setting (§5.2). SHARED_SPACE_ONLY means exactly that: you have
 *  to already be somewhere together. */
export async function assertCanDm(fromId: string, toId: string) {
  const target = await prisma.user.findFirst({
    where: { id: toId, deletedAt: null },
    select: { settings: true },
  });
  if (!target) throw ApiError.notFound('No student there');

  const { dmPrivacy } = parseSettings(target.settings);
  if (dmPrivacy === 'NOBODY') throw ApiError.forbidden('That student has DMs turned off');
  if (dmPrivacy === 'SHARED_SPACE_ONLY') {
    const shared = await prisma.spaceMember.count({
      where: { userId: fromId, space: { members: { some: { userId: toId } } } },
    });
    if (shared === 0) {
      throw ApiError.forbidden('That student only takes DMs from people in their spaces');
    }
  }
}

export async function openConversation(userId: string, otherIds: string[], title?: string) {
  const ids = [...new Set([userId, ...otherIds])];
  if (ids.length < 2) throw ApiError.badRequest('Pick someone to message');
  if (ids.length > MAX_GROUP) throw ApiError.badRequest(`Group DMs cap at ${MAX_GROUP} people`);

  for (const other of otherIds) await assertCanDm(userId, other);

  const isGroup = ids.length > 2;

  if (!isGroup) {
    // Reuse the existing 1:1 rather than stacking duplicates.
    const existing = await prisma.directConversation.findFirst({
      where: {
        isGroup: false,
        AND: ids.map((id) => ({ members: { some: { userId: id } } })),
      },
      select: { id: true },
    });
    if (existing) return getConversation(existing.id, userId);
  }

  const created = await prisma.directConversation.create({
    data: {
      isGroup,
      title: isGroup ? (title ?? null) : null,
      members: { create: ids.map((id) => ({ userId: id })) },
    },
    select: { id: true },
  });
  return getConversation(created.id, userId);
}

export async function listConversations(userId: string) {
  const rows = await prisma.directMember.findMany({
    where: { userId },
    orderBy: { conversation: { updatedAt: 'desc' } },
    select: {
      lastReadAt: true,
      conversation: {
        select: {
          id: true,
          title: true,
          isGroup: true,
          updatedAt: true,
          members: { select: { user: { select: publicUserSelect } } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true, createdAt: true, authorId: true },
          },
        },
      },
    },
  });

  return Promise.all(
    rows.map(async (row) => {
      const c = row.conversation;
      const others = c.members.filter((m) => m.user.id !== userId).map((m) => toPublicUser(m.user));
      return {
        id: c.id,
        isGroup: c.isGroup,
        title: c.title ?? (others.map((o) => o.displayName).join(', ') || 'Just you'),
        members: others,
        lastMessage: c.messages[0]
          ? {
              excerpt: c.messages[0].content.slice(0, 90),
              createdAt: c.messages[0].createdAt.toISOString(),
            }
          : null,
        unreadCount: await prisma.directMessage.count({
          where: {
            conversationId: c.id,
            createdAt: { gt: row.lastReadAt },
            authorId: { not: userId },
            deletedAt: null,
          },
        }),
      };
    }),
  );
}

async function assertMember(conversationId: string, userId: string) {
  const member = await prisma.directMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  if (!member) throw ApiError.forbidden("That conversation isn't yours");
}

export async function getConversation(conversationId: string, userId: string) {
  await assertMember(conversationId, userId);
  const c = await prisma.directConversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: {
      id: true,
      title: true,
      isGroup: true,
      members: { select: { user: { select: publicUserSelect } } },
    },
  });
  const others = c.members.filter((m) => m.user.id !== userId).map((m) => toPublicUser(m.user));
  return {
    id: c.id,
    isGroup: c.isGroup,
    title: c.title ?? (others.map((o) => o.displayName).join(', ') || 'Just you'),
    members: others,
  };
}

export async function listDirectMessages(conversationId: string, userId: string, limit = 50) {
  await assertMember(conversationId, userId);
  const rows = await prisma.directMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      content: true,
      attachments: true,
      createdAt: true,
      editedAt: true,
      deletedAt: true,
      author: { select: publicUserSelect },
    },
  });

  await prisma.directMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: new Date() },
  });

  return rows.reverse().map((m) => ({
    id: m.id,
    content: m.deletedAt ? '' : m.content,
    attachments: safeJson(m.attachments, []),
    author: toPublicUser(m.author),
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    deletedAt: m.deletedAt?.toISOString() ?? null,
  }));
}

export async function sendDirectMessage(conversationId: string, userId: string, content: string) {
  await assertMember(conversationId, userId);
  const message = await prisma.directMessage.create({
    data: { conversationId, authorId: userId, content },
    select: {
      id: true,
      content: true,
      attachments: true,
      createdAt: true,
      author: { select: publicUserSelect },
    },
  });
  await prisma.directConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return {
    id: message.id,
    conversationId,
    content: message.content,
    attachments: safeJson(message.attachments, []),
    author: toPublicUser(message.author),
    createdAt: message.createdAt.toISOString(),
    editedAt: null,
    deletedAt: null,
  };
}

export async function memberIdsOf(conversationId: string): Promise<string[]> {
  const members = await prisma.directMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}
