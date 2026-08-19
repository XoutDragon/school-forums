import type { MessageDto, SendMessageInput, EditMessageInput } from '@campusconnect/shared';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { isHardBlocked } from '../lib/wordfilter.js';
import { publicUserSelect, toMessageDto } from './serialize.js';
import { assertCanView, atLeast, roleIn } from './space.service.js';
import { notify } from './notification.service.js';

const messageInclude = {
  author: { select: publicUserSelect },
  reactions: { select: { emoji: true, userId: true } },
  replyTo: {
    select: {
      id: true,
      content: true,
      isAnonymous: true,
      author: { select: { displayName: true } },
    },
  },
  pin: { select: { id: true } },
  _count: { select: { replies: true } },
} as const;

async function loadChannel(channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, spaceId: true, type: true, name: true },
  });
  if (!channel) throw ApiError.notFound('No channel there');
  return channel;
}

export async function listMessages(
  channelId: string,
  userId: string,
  opts: { before?: string; threadRootId?: string; limit: number },
): Promise<MessageDto[]> {
  const channel = await loadChannel(channelId);
  await assertCanView(channel.spaceId, userId);

  const cursor = opts.before
    ? await prisma.message.findUnique({
        where: { id: opts.before },
        select: { createdAt: true },
      })
    : null;

  const rows = await prisma.message.findMany({
    where: {
      channelId,
      // A thread's replies live out of the main channel flow until you open the thread.
      threadRootId: opts.threadRootId ?? null,
      ...(cursor ? { createdAt: { lt: cursor.createdAt } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: opts.limit,
    include: messageInclude,
  });

  // Oldest-first for rendering; the query runs newest-first so pagination walks upward.
  return rows.reverse().map((row) => toMessageDto(row, { viewerId: userId }));
}

export async function sendMessage(
  channelId: string,
  userId: string,
  input: SendMessageInput,
): Promise<MessageDto> {
  const channel = await loadChannel(channelId);
  await assertCanView(channel.spaceId, userId);

  if (isHardBlocked(input.content)) {
    throw ApiError.badRequest('That message breaks the campus code of conduct.');
  }

  const role = await roleIn(channel.spaceId, userId);
  if (channel.type === 'ANNOUNCEMENT' && !atLeast(role, 'ADMIN')) {
    throw ApiError.forbidden(
      'Only space admins post in announcement channels. You can still react.',
    );
  }
  if (channel.type === 'VOICE_STUB') {
    throw ApiError.badRequest("Voice channels don't take messages");
  }
  if (!role) throw ApiError.forbidden('Join the space to post here');

  const isAnonymous = input.isAnonymous && channel.type === 'ANONYMOUS';
  if (input.isAnonymous && channel.type !== 'ANONYMOUS') {
    throw ApiError.badRequest('Anonymous posting only works in anonymous channels');
  }
  // Anonymous channels are anonymous by definition — a named post there would out
  // everyone else by contrast.
  const anonymous = channel.type === 'ANONYMOUS' ? true : isAnonymous;

  const message = await prisma.message.create({
    data: {
      channelId,
      authorId: userId,
      content: input.content,
      attachments: JSON.stringify(input.attachments),
      replyToId: input.replyToId ?? null,
      threadRootId: input.threadRootId ?? null,
      isAnonymous: anonymous,
    },
    include: messageInclude,
  });

  if (!anonymous)
    await fanOutMentions(message.id, input.content, userId, channel.spaceId, channelId);

  return toMessageDto(message, { viewerId: userId });
}

export async function editMessage(
  messageId: string,
  userId: string,
  input: EditMessageInput,
): Promise<MessageDto> {
  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: { authorId: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) throw ApiError.notFound('No message there');
  if (existing.authorId !== userId) throw ApiError.forbidden('You can only edit your own messages');
  if (isHardBlocked(input.content)) {
    throw ApiError.badRequest('That message breaks the campus code of conduct.');
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { content: input.content, editedAt: new Date() },
    include: messageInclude,
  });
  return toMessageDto(updated, { viewerId: userId });
}

/** Soft delete (§8). The row stays so moderators can still trace an anonymous post. */
export async function deleteMessage(messageId: string, userId: string, isAdmin: boolean) {
  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: { authorId: true, channelId: true, channel: { select: { spaceId: true } } },
  });
  if (!existing) throw ApiError.notFound('No message there');

  const isAuthor = existing.authorId === userId;
  const canModerate = isAdmin || atLeast(await roleIn(existing.channel.spaceId, userId), 'MOD');
  if (!isAuthor && !canModerate) throw ApiError.forbidden('You can only delete your own messages');

  await prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date(), content: '' },
  });
  return { id: messageId, channelId: existing.channelId };
}

export async function addReaction(messageId: string, userId: string, emoji: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { channelId: true, channel: { select: { spaceId: true } } },
  });
  if (!message) throw ApiError.notFound('No message there');
  await assertCanView(message.channel.spaceId, userId);

  await prisma.reaction.upsert({
    where: { messageId_userId_emoji: { messageId, userId, emoji } },
    create: { messageId, userId, emoji },
    update: {},
  });
  return { messageId, channelId: message.channelId, emoji, userId };
}

export async function removeReaction(messageId: string, userId: string, emoji: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { channelId: true },
  });
  if (!message) throw ApiError.notFound('No message there');
  await prisma.reaction.deleteMany({ where: { messageId, userId, emoji } });
  return { messageId, channelId: message.channelId, emoji, userId };
}

export async function getThread(rootId: string, userId: string): Promise<MessageDto[]> {
  const root = await prisma.message.findUnique({
    where: { id: rootId },
    select: { channelId: true, channel: { select: { spaceId: true } } },
  });
  if (!root) throw ApiError.notFound('No thread there');
  await assertCanView(root.channel.spaceId, userId);

  const rows = await prisma.message.findMany({
    where: { OR: [{ id: rootId }, { threadRootId: rootId }] },
    orderBy: { createdAt: 'asc' },
    include: messageInclude,
  });
  return rows.map((row) => toMessageDto(row, { viewerId: userId }));
}

export async function togglePin(messageId: string, userId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      channelId: true,
      channel: { select: { spaceId: true } },
      pin: { select: { id: true } },
    },
  });
  if (!message) throw ApiError.notFound('No message there');
  await assertRoleMod(message.channel.spaceId, userId);

  if (message.pin) {
    await prisma.pinnedMessage.delete({ where: { id: message.pin.id } });
    return { pinned: false };
  }
  await prisma.pinnedMessage.create({
    data: { channelId: message.channelId, messageId, pinnedById: userId },
  });
  return { pinned: true };
}

async function assertRoleMod(spaceId: string, userId: string) {
  const role = await roleIn(spaceId, userId);
  if (!atLeast(role, 'MOD')) throw ApiError.forbidden('Space mods only');
}

export async function listPins(channelId: string, userId: string): Promise<MessageDto[]> {
  const channel = await loadChannel(channelId);
  await assertCanView(channel.spaceId, userId);
  const pins = await prisma.pinnedMessage.findMany({
    where: { channelId },
    orderBy: { createdAt: 'desc' },
    select: { message: { include: messageInclude } },
  });
  return pins.map((p) => toMessageDto(p.message, { viewerId: userId }));
}

const MENTION_RE = /@([a-z0-9_]{3,24})/g;

async function fanOutMentions(
  messageId: string,
  content: string,
  authorId: string,
  spaceId: string,
  channelId: string,
) {
  const usernames = [...new Set([...content.matchAll(MENTION_RE)].map((m) => m[1]!))];
  if (!usernames.length) return;

  const mentioned = await prisma.user.findMany({
    where: { username: { in: usernames }, id: { not: authorId }, deletedAt: null },
    select: { id: true },
  });
  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { displayName: true },
  });

  await Promise.all(
    mentioned.map((u) =>
      notify(u.id, 'MENTION', {
        messageId,
        channelId,
        spaceId,
        from: author?.displayName ?? 'Someone',
        excerpt: content.slice(0, 140),
      }),
    ),
  );
}
