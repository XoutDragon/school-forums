import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { consumeRateLimit, requireUser } from './lib/auth';
import { toPublicUser } from './lib/serialize';

/** Direct messages — ported from services/dm.service.ts. */

const MAX_GROUP = 10;

/** Enforces the DM privacy setting (section 5.2). */
async function assertCanDm(
  ctx: QueryCtx | MutationCtx,
  fromId: Id<'users'>,
  toId: Id<'users'>,
): Promise<void> {
  const target = await ctx.db.get(toId);
  if (!target || target.deletedAt) throw new Error('NOT_FOUND: No student there');

  const { dmPrivacy } = target.settings;
  if (dmPrivacy === 'NOBODY') throw new Error('FORBIDDEN: That student has DMs turned off');

  if (dmPrivacy === 'SHARED_SPACE_ONLY') {
    const mine = await ctx.db
      .query('spaceMembers')
      .withIndex('by_user', (q) => q.eq('userId', fromId))
      .collect();
    const theirs = new Set(
      (
        await ctx.db
          .query('spaceMembers')
          .withIndex('by_user', (q) => q.eq('userId', toId))
          .collect()
      ).map((m) => m.spaceId),
    );
    if (!mine.some((m) => theirs.has(m.spaceId))) {
      throw new Error('FORBIDDEN: That student only takes DMs from people in their spaces');
    }
  }
}

async function memberIds(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<'directConversations'>,
): Promise<Id<'users'>[]> {
  const rows = await ctx.db
    .query('directMembers')
    .withIndex('by_conversation', (q) => q.eq('conversationId', conversationId))
    .collect();
  return rows.map((r) => r.userId);
}

export const list = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    const memberships = await ctx.db
      .query('directMembers')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();

    const conversations = await Promise.all(
      memberships.map(async (membership) => {
        const conversation = await ctx.db.get(membership.conversationId);
        if (!conversation) return null;

        const others = (
          await Promise.all(
            (await memberIds(ctx, conversation._id))
              .filter((id) => id !== user._id)
              .map(async (id) => {
                const other = await ctx.db.get(id);
                if (!other) return null;
                const major = other.majorId ? await ctx.db.get(other.majorId) : null;
                return toPublicUser(other, major);
              }),
          )
        ).filter((o): o is NonNullable<typeof o> => o !== null);

        const recent = await ctx.db
          .query('directMessages')
          .withIndex('by_conversation', (q) => q.eq('conversationId', conversation._id))
          .order('desc')
          .take(1);

        const unread = (
          await ctx.db
            .query('directMessages')
            .withIndex('by_conversation', (q) => q.eq('conversationId', conversation._id))
            .collect()
        ).filter(
          (m) => m._creationTime > membership.lastReadAt && m.authorId !== user._id && !m.deletedAt,
        ).length;

        return {
          id: conversation._id,
          isGroup: conversation.isGroup,
          title: conversation.title ?? (others.map((o) => o.displayName).join(', ') || 'Just you'),
          members: others,
          lastMessage: recent[0]
            ? { excerpt: recent[0].content.slice(0, 90), createdAt: recent[0]._creationTime }
            : null,
          unreadCount: unread,
          lastMessageAt: conversation.lastMessageAt,
        };
      }),
    );

    return conversations
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  },
});

export const open = mutation({
  args: {
    token: v.string(),
    userIds: v.array(v.id('users')),
    title: v.optional(v.string()),
    /** Buddy connections and mentor links seed the DM with a prompt (section 5.6). */
    icebreaker: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    const ids = [...new Set([user._id, ...args.userIds])];
    if (ids.length < 2) throw new Error('BAD_REQUEST: Pick someone to message');
    if (ids.length > MAX_GROUP)
      throw new Error(`BAD_REQUEST: Group DMs cap at ${MAX_GROUP} people`);

    for (const otherId of args.userIds) await assertCanDm(ctx, user._id, otherId);

    const isGroup = ids.length > 2;

    if (!isGroup) {
      // Reuse the existing 1:1 rather than stacking duplicates.
      const mine = await ctx.db
        .query('directMembers')
        .withIndex('by_user', (q) => q.eq('userId', user._id))
        .collect();

      for (const membership of mine) {
        const conversation = await ctx.db.get(membership.conversationId);
        if (!conversation || conversation.isGroup) continue;
        const members = await memberIds(ctx, conversation._id);
        if (members.length === 2 && members.includes(args.userIds[0]!)) {
          return conversation._id;
        }
      }
    }

    const now = Date.now();
    const conversationId = await ctx.db.insert('directConversations', {
      title: isGroup ? args.title : undefined,
      isGroup,
      lastMessageAt: now,
    });

    for (const id of ids) {
      await ctx.db.insert('directMembers', { conversationId, userId: id, lastReadAt: now });
    }

    if (args.icebreaker) {
      await ctx.db.insert('directMessages', {
        conversationId,
        authorId: user._id,
        content: args.icebreaker,
        attachments: [],
      });
    }

    return conversationId;
  },
});

export const messages = query({
  args: { token: v.string(), conversationId: v.id('directConversations') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    const membership = await ctx.db
      .query('directMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', args.conversationId).eq('userId', user._id),
      )
      .unique();
    if (!membership) throw new Error("FORBIDDEN: That conversation isn't yours");

    const rows = await ctx.db
      .query('directMessages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .order('desc')
      .take(50);

    return Promise.all(
      rows.reverse().map(async (message) => {
        const author = await ctx.db.get(message.authorId);
        const major = author?.majorId ? await ctx.db.get(author.majorId) : null;
        return {
          id: message._id,
          content: message.deletedAt ? '' : message.content,
          attachments: message.attachments,
          author: author ? toPublicUser(author, major) : null,
          createdAt: message._creationTime,
          editedAt: message.editedAt ?? null,
          deletedAt: message.deletedAt ?? null,
        };
      }),
    );
  },
});

export const send = mutation({
  args: {
    token: v.string(),
    conversationId: v.id('directConversations'),
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
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    if (!args.content.trim() && !(args.attachments ?? []).length) {
      throw new Error('BAD_REQUEST: Say something');
    }

    const membership = await ctx.db
      .query('directMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', args.conversationId).eq('userId', user._id),
      )
      .unique();
    if (!membership) throw new Error("FORBIDDEN: That conversation isn't yours");

    await consumeRateLimit(ctx, 'messages', user._id);

    const messageId = await ctx.db.insert('directMessages', {
      conversationId: args.conversationId,
      authorId: user._id,
      content: args.content,
      attachments: args.attachments ?? [],
    });

    const now = Date.now();
    await ctx.db.patch(args.conversationId, { lastMessageAt: now });
    await ctx.db.patch(membership._id, { lastReadAt: now });
    return messageId;
  },
});

export const markRead = mutation({
  args: { token: v.string(), conversationId: v.id('directConversations') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const membership = await ctx.db
      .query('directMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', args.conversationId).eq('userId', user._id),
      )
      .unique();
    if (membership) await ctx.db.patch(membership._id, { lastReadAt: Date.now() });
    return null;
  },
});
