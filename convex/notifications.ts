import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { requireUser } from './lib/auth';

/**
 * Notifications, ported from services/notification.service.ts.
 *
 * The Express version persisted a row and then pushed it over a socket. Here the
 * push is free: `list` is a reactive query, so inserting a row re-runs it on the
 * recipient's client. The socket emit is gone.
 */

export type NotificationType =
  | 'MENTION'
  | 'WAVE'
  | 'WAVE_MUTUAL'
  | 'DM_REQUEST'
  | 'STUDY_GROUP_REQUEST'
  | 'STUDY_GROUP_APPROVED'
  | 'EVENT_REMINDER'
  | 'MENTOR_REQUEST'
  | 'MENTOR_ACCEPTED'
  | 'BADGE_EARNED'
  | 'ANNOUNCEMENT'
  | 'BUDDY_CONNECTED';

/** Shared helper so every feature module notifies the same way. */
export async function notify(
  ctx: MutationCtx,
  userId: Id<'users'>,
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<void> {
  await ctx.db.insert('notifications', { userId, type, payload });
}

export const list = query({
  args: { token: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    const rows = await ctx.db
      .query('notifications')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .order('desc')
      .take(args.limit ?? 40);

    return {
      items: rows.map((row) => ({
        id: row._id,
        type: row.type,
        payload: row.payload as Record<string, unknown>,
        readAt: row.readAt ?? null,
        createdAt: row._creationTime,
      })),
      unread: rows.filter((row) => !row.readAt).length,
    };
  },
});

export const markRead = mutation({
  args: { token: v.string(), notificationId: v.id('notifications') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const row = await ctx.db.get(args.notificationId);
    if (row && row.userId === user._id && !row.readAt) {
      await ctx.db.patch(row._id, { readAt: Date.now() });
    }
    return null;
  },
});

export const markAllRead = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const unread = await ctx.db
      .query('notifications')
      .withIndex('by_user_unread', (q) => q.eq('userId', user._id).eq('readAt', undefined))
      .collect();

    const now = Date.now();
    for (const row of unread) await ctx.db.patch(row._id, { readAt: now });
    return null;
  },
});
