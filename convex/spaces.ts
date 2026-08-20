import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { assertCanView, onlineUserIds, requireUser, roleIn } from './lib/auth';
import { toPublicUser } from './lib/serialize';

/** Spaces and channels, ported from server/src/services/space.service.ts. */

export const mine = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    const memberships = await ctx.db
      .query('spaceMembers')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();

    return (
      await Promise.all(
        memberships.map(async (membership) => {
          const space = await ctx.db.get(membership.spaceId);
          if (!space) return null;

          const memberCount = (
            await ctx.db
              .query('spaceMembers')
              .withIndex('by_space', (q) => q.eq('spaceId', space._id))
              .collect()
          ).length;

          return {
            id: space._id,
            name: space.name,
            slug: space.slug,
            description: space.description ?? null,
            iconUrl: space.iconUrl ?? null,
            bannerUrl: space.bannerUrl ?? null,
            type: space.type,
            memberCount,
            myRole: membership.role,
          };
        }),
      )
    ).filter((s): s is NonNullable<typeof s> => s !== null);
  },
});

export const discover = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    const joined = new Set(
      (
        await ctx.db
          .query('spaceMembers')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .collect()
      ).map((m) => m.spaceId),
    );

    const spaces = await ctx.db.query('spaces').take(200);

    return Promise.all(
      spaces
        .filter((s) => s.visibility === 'PUBLIC' && !joined.has(s._id))
        .slice(0, 24)
        .map(async (space) => ({
          id: space._id,
          name: space.name,
          slug: space.slug,
          description: space.description ?? null,
          type: space.type,
          memberCount: (
            await ctx.db
              .query('spaceMembers')
              .withIndex('by_space', (q) => q.eq('spaceId', space._id))
              .collect()
          ).length,
          myRole: null,
        })),
    );
  },
});

/** A space with its channels and per-channel unread counts. */
export const get = query({
  args: { token: v.string(), spaceId: v.id('spaces') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    await assertCanView(ctx, args.spaceId, user._id);

    const space = await ctx.db.get(args.spaceId);
    if (!space) throw new Error('NOT_FOUND: No space there');

    const members = await ctx.db
      .query('spaceMembers')
      .withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
      .collect();

    const channelRows = await ctx.db
      .query('channels')
      .withIndex('by_space_position', (q) => q.eq('spaceId', args.spaceId))
      .collect();

    const channels = await Promise.all(
      channelRows
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
        .map(async (channel) => {
          const read = await ctx.db
            .query('channelReads')
            .withIndex('by_channel_user', (q) =>
              q.eq('channelId', channel._id).eq('userId', user._id),
            )
            .unique();

          const since = read?.lastReadAt ?? 0;
          const unread = (
            await ctx.db
              .query('messages')
              .withIndex('by_channel_thread', (q) =>
                q.eq('channelId', channel._id).eq('threadRootId', undefined),
              )
              .collect()
          ).filter(
            (m) => !m.deletedAt && m._creationTime > since && m.authorId !== user._id,
          ).length;

          return {
            id: channel._id,
            spaceId: channel.spaceId,
            name: channel.name,
            topic: channel.topic ?? null,
            type: channel.type,
            position: channel.position,
            isDefault: channel.isDefault,
            unreadCount: unread,
          };
        }),
    );

    return {
      id: space._id,
      name: space.name,
      slug: space.slug,
      description: space.description ?? null,
      iconUrl: space.iconUrl ?? null,
      bannerUrl: space.bannerUrl ?? null,
      type: space.type,
      memberCount: members.length,
      myRole: await roleIn(ctx, args.spaceId, user._id),
      channels,
    };
  },
});

export const members = query({
  args: { token: v.string(), spaceId: v.id('spaces') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    await assertCanView(ctx, args.spaceId, user._id);

    const rows = await ctx.db
      .query('spaceMembers')
      .withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
      .collect();

    const online = await onlineUserIds(ctx);

    return (
      await Promise.all(
        rows.map(async (row) => {
          const member = await ctx.db.get(row.userId);
          if (!member) return null;
          const major = member.majorId ? await ctx.db.get(member.majorId) : null;
          return {
            role: row.role,
            nickname: row.nickname ?? null,
            user: toPublicUser(member, major, online.has(member._id)),
          };
        }),
      )
    ).filter((m): m is NonNullable<typeof m> => m !== null);
  },
});

export const join = mutation({
  args: { token: v.string(), spaceId: v.id('spaces') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const space = await ctx.db.get(args.spaceId);
    if (!space) throw new Error('NOT_FOUND: No space there');
    if (space.visibility === 'PRIVATE') {
      throw new Error('FORBIDDEN: That space is invite-only');
    }

    const existing = await ctx.db
      .query('spaceMembers')
      .withIndex('by_space_user', (q) => q.eq('spaceId', args.spaceId).eq('userId', user._id))
      .unique();
    if (existing) return null;

    await ctx.db.insert('spaceMembers', {
      spaceId: args.spaceId,
      userId: user._id,
      role: 'MEMBER',
      joinedAt: Date.now(),
    });
    return null;
  },
});

export const leave = mutation({
  args: { token: v.string(), spaceId: v.id('spaces') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    const membership = await ctx.db
      .query('spaceMembers')
      .withIndex('by_space_user', (q) => q.eq('spaceId', args.spaceId).eq('userId', user._id))
      .unique();
    if (!membership) return null;

    if (membership.role === 'OWNER') {
      throw new Error('BAD_REQUEST: Hand the space to someone else before you leave it');
    }
    await ctx.db.delete(membership._id);
    return null;
  },
});
