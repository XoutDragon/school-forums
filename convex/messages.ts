import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import {
  assertCanView,
  atLeast,
  consumeRateLimit,
  onlineUserIds,
  requireUser,
  roleIn,
} from './lib/auth';
import { toMessageDto, type MessageDto } from './lib/serialize';

/**
 * Chat, ported from server/src/services/message.service.ts.
 *
 * The big win of the move: `list` is a reactive query. The Express build needed
 * Socket.IO to push message:new / message:edit / message:delete and a client-side
 * reducer to fold them in. Here, any mutation that touches the table re-runs this
 * query on every subscribed client. The socket layer and its five event handlers
 * are gone.
 */

/** Loads everything toMessageDto needs, in bulk, for a page of messages. */
async function hydrate(
  ctx: QueryCtx,
  messages: Doc<'messages'>[],
  viewerId: Id<'users'> | undefined,
): Promise<MessageDto[]> {
  const onlineIds = await onlineUserIds(ctx);

  const authorIds = [...new Set(messages.flatMap((m) => (m.authorId ? [m.authorId] : [])))];
  const authors = new Map(
    (await Promise.all(authorIds.map((id) => ctx.db.get(id))))
      .filter((u): u is Doc<'users'> => u !== null)
      .map((u) => [u._id, u]),
  );

  const majorIds = [
    ...new Set([...authors.values()].flatMap((u) => (u.majorId ? [u.majorId] : []))),
  ];
  const majors = new Map(
    (await Promise.all(majorIds.map((id) => ctx.db.get(id))))
      .filter((m): m is Doc<'majors'> => m !== null)
      .map((m) => [m._id, m]),
  );

  return Promise.all(
    messages.map(async (message) => {
      const author = message.authorId ? (authors.get(message.authorId) ?? null) : null;

      const reactions = await ctx.db
        .query('reactions')
        .withIndex('by_message', (q) => q.eq('messageId', message._id))
        .collect();

      const pin = await ctx.db
        .query('pinnedMessages')
        .withIndex('by_message', (q) => q.eq('messageId', message._id))
        .unique();

      const threadReplies = await ctx.db
        .query('messages')
        .withIndex('by_thread', (q) => q.eq('threadRootId', message._id))
        .collect();

      let replyTo = null;
      if (message.replyToId) {
        const parent = await ctx.db.get(message.replyToId);
        if (parent) {
          replyTo = {
            message: parent,
            author: parent.authorId ? ((await ctx.db.get(parent.authorId)) ?? null) : null,
          };
        }
      }

      return toMessageDto(message, {
        viewerId,
        author,
        authorMajor: author?.majorId ? (majors.get(author.majorId) ?? null) : null,
        onlineIds,
        reactions,
        replyTo,
        threadReplyCount: threadReplies.length,
        isPinned: Boolean(pin),
      });
    }),
  );
}

export const list = query({
  args: {
    token: v.string(),
    channelId: v.id('channels'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw new Error('NOT_FOUND: No channel there');
    await assertCanView(ctx, channel.spaceId, user._id);

    // Thread replies stay out of the main flow until you open the thread.
    const rows = await ctx.db
      .query('messages')
      .withIndex('by_channel_thread', (q) =>
        q.eq('channelId', args.channelId).eq('threadRootId', undefined),
      )
      .order('desc')
      .take(args.limit ?? 50);

    // Oldest-first for rendering; the query runs newest-first so paging walks upward.
    return hydrate(ctx, rows.reverse(), user._id);
  },
});

export const thread = query({
  args: { token: v.string(), rootId: v.id('messages') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const root = await ctx.db.get(args.rootId);
    if (!root) throw new Error('NOT_FOUND: No thread there');

    const channel = await ctx.db.get(root.channelId);
    if (!channel) throw new Error('NOT_FOUND: No channel there');
    await assertCanView(ctx, channel.spaceId, user._id);

    const replies = await ctx.db
      .query('messages')
      .withIndex('by_thread', (q) => q.eq('threadRootId', args.rootId))
      .collect();

    return hydrate(ctx, [root, ...replies], user._id);
  },
});

export const send = mutation({
  args: {
    token: v.string(),
    channelId: v.id('channels'),
    content: v.string(),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.optional(v.id('_storage')),
          url: v.string(),
          name: v.string(),
          mimeType: v.string(),
          size: v.number(),
        }),
      ),
    ),
    replyToId: v.optional(v.id('messages')),
    threadRootId: v.optional(v.id('messages')),
    isAnonymous: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    if (!args.content.trim() && !(args.attachments ?? []).length) {
      throw new Error('BAD_REQUEST: Say something');
    }
    if (args.content.length > 4000) throw new Error('BAD_REQUEST: Message is too long');

    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw new Error('NOT_FOUND: No channel there');
    await assertCanView(ctx, channel.spaceId, user._id);

    const role = await roleIn(ctx, channel.spaceId, user._id);
    if (!role) throw new Error('FORBIDDEN: Join the space to post here');

    if (channel.type === 'ANNOUNCEMENT' && !atLeast(role, 'ADMIN')) {
      throw new Error(
        'FORBIDDEN: Only space admins post in announcement channels. You can still react.',
      );
    }
    if (channel.type === 'VOICE_STUB') {
      throw new Error("BAD_REQUEST: Voice channels don't take messages");
    }
    if (args.isAnonymous && channel.type !== 'ANONYMOUS') {
      throw new Error('BAD_REQUEST: Anonymous posting only works in anonymous channels');
    }

    // An anonymous channel is anonymous by definition — a named post there would
    // out everyone else by contrast.
    const isAnonymous = channel.type === 'ANONYMOUS';

    await consumeRateLimit(ctx, 'messages', user._id);
    if (isAnonymous) await consumeRateLimit(ctx, 'anonymousPosts', user._id);

    const messageId = await ctx.db.insert('messages', {
      channelId: args.channelId,
      authorId: user._id,
      content: args.content,
      attachments: args.attachments ?? [],
      replyToId: args.replyToId,
      threadRootId: args.threadRootId,
      isAnonymous,
    });

    if (!isAnonymous) {
      await fanOutMentions(ctx, args.content, user, channel.spaceId, args.channelId, messageId);
    }

    await markRead(ctx, args.channelId, user._id);
    return messageId;
  },
});

export const edit = mutation({
  args: { token: v.string(), messageId: v.id('messages'), content: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const message = await ctx.db.get(args.messageId);
    if (!message || message.deletedAt) throw new Error('NOT_FOUND: No message there');
    if (message.authorId !== user._id) {
      throw new Error('FORBIDDEN: You can only edit your own messages');
    }
    await ctx.db.patch(args.messageId, { content: args.content, editedAt: Date.now() });
    return null;
  },
});

/** Soft delete. The row survives so moderators can still trace an anonymous post. */
export const remove = mutation({
  args: { token: v.string(), messageId: v.id('messages') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error('NOT_FOUND: No message there');

    const channel = await ctx.db.get(message.channelId);
    const isAuthor = message.authorId === user._id;
    const canModerate =
      user.isAdmin ||
      (channel ? atLeast(await roleIn(ctx, channel.spaceId, user._id), 'MOD') : false);

    if (!isAuthor && !canModerate) {
      throw new Error('FORBIDDEN: You can only delete your own messages');
    }

    await ctx.db.patch(args.messageId, { deletedAt: Date.now(), content: '' });
    return null;
  },
});

export const toggleReaction = mutation({
  args: { token: v.string(), messageId: v.id('messages'), emoji: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error('NOT_FOUND: No message there');

    const channel = await ctx.db.get(message.channelId);
    if (channel) await assertCanView(ctx, channel.spaceId, user._id);

    const existing = await ctx.db
      .query('reactions')
      .withIndex('by_message_user_emoji', (q) =>
        q.eq('messageId', args.messageId).eq('userId', user._id).eq('emoji', args.emoji),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { added: false };
    }
    await ctx.db.insert('reactions', {
      messageId: args.messageId,
      userId: user._id,
      emoji: args.emoji,
    });
    return { added: true };
  },
});

export const markChannelRead = mutation({
  args: { token: v.string(), channelId: v.id('channels') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    await markRead(ctx, args.channelId, user._id);
    return null;
  },
});

/** Who is typing in this channel, aliased in anonymous channels. */
export const typingIn = query({
  args: { token: v.string(), channelId: v.id('channels') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const channel = await ctx.db.get(args.channelId);
    if (!channel) return [];

    const cutoff = Date.now() - 6000;
    const rows = await ctx.db
      .query('presence')
      .withIndex('by_channel', (q) => q.eq('typingInChannel', args.channelId))
      .collect();

    const { anonAlias } = await import('./lib/anon');

    return (
      await Promise.all(
        rows
          .filter((row) => row.userId !== user._id && (row.typingUpdatedAt ?? 0) > cutoff)
          .map(async (row) => {
            // Even "who is typing" is identifying in an anonymous channel, so it
            // goes out under the same alias the message will carry.
            if (channel.type === 'ANONYMOUS') {
              return { name: anonAlias(row.userId, args.channelId).alias };
            }
            const typer = await ctx.db.get(row.userId);
            return typer ? { name: typer.displayName } : null;
          }),
      )
    ).filter((entry): entry is { name: string } => entry !== null);
  },
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function markRead(
  ctx: { db: any },
  channelId: Id<'channels'>,
  userId: Id<'users'>,
): Promise<void> {
  const existing = await ctx.db
    .query('channelReads')
    .withIndex('by_channel_user', (q: any) => q.eq('channelId', channelId).eq('userId', userId))
    .unique();

  if (existing) await ctx.db.patch(existing._id, { lastReadAt: Date.now() });
  else await ctx.db.insert('channelReads', { channelId, userId, lastReadAt: Date.now() });
}

const MENTION_RE = /@([a-z0-9_]{3,24})/g;

async function fanOutMentions(
  ctx: { db: any },
  content: string,
  author: Doc<'users'>,
  spaceId: Id<'spaces'>,
  channelId: Id<'channels'>,
  messageId: Id<'messages'>,
): Promise<void> {
  const usernames = [...new Set([...content.matchAll(MENTION_RE)].map((m) => m[1]!))];
  if (!usernames.length) return;

  for (const username of usernames) {
    const mentioned = await ctx.db
      .query('users')
      .withIndex('by_username', (q: any) => q.eq('username', username))
      .unique();

    if (!mentioned || mentioned._id === author._id || mentioned.deletedAt) continue;

    await ctx.db.insert('notifications', {
      userId: mentioned._id,
      type: 'MENTION',
      payload: {
        messageId,
        channelId,
        spaceId,
        from: author.displayName,
        excerpt: content.slice(0, 140),
      },
    });
  }
}
