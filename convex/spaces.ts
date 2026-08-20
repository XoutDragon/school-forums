import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { assertCanView, atLeast, onlineUserIds, requireUser, roleIn } from './lib/auth';
import { authorityIn, assertPermission, NO_PERMISSIONS } from './lib/permissions';
import { logAudit } from './lib/audit';
import { toPublicUser } from './lib/serialize';

/** Spaces, channels, members and custom roles. */

const channelTypeValidator = v.union(
  v.literal('TEXT'),
  v.literal('ANNOUNCEMENT'),
  v.literal('RESOURCES'),
  v.literal('QA'),
  v.literal('ANONYMOUS'),
  v.literal('VOICE_STUB'),
);

const permissionsValidator = v.object({
  manageChannels: v.boolean(),
  manageRoles: v.boolean(),
  manageMembers: v.boolean(),
  moderateMessages: v.boolean(),
  pinMessages: v.boolean(),
  postAnnouncements: v.boolean(),
  inviteMembers: v.boolean(),
  useVoice: v.boolean(),
});

/**
 * A Space with no `publishedAt` was drafted by an administrator and has no owner
 * yet. It must not appear anywhere a student can see it (section 5.10 extension),
 * so every listing runs through this.
 */
const isPublished = (space: Doc<'spaces'>) => space.publishedAt !== undefined;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'space'
  );
}

/** Convex has no UNIQUE, so uniqueness is a loop. Suffixes rather than rejections:
 *  two clubs genuinely can both be called "Chess". */
async function uniqueSlug(ctx: MutationCtx, base: string): Promise<string> {
  const root = slugify(base);
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const taken = await ctx.db
      .query('spaces')
      .withIndex('by_slug', (q) => q.eq('slug', candidate))
      .unique();
    if (!taken) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** The starter channel set. Small on purpose — an empty channel reads as neglect,
 *  and a new space with nine of them looks abandoned on day one. */
const STARTER_CHANNELS: {
  name: string;
  type: 'TEXT' | 'ANNOUNCEMENT' | 'RESOURCES' | 'VOICE_STUB';
  topic: string;
  isDefault?: boolean;
}[] = [
  { name: 'general', type: 'TEXT', topic: 'Anything and everything.', isDefault: true },
  { name: 'announcements', type: 'ANNOUNCEMENT', topic: 'Read-only. Admins post here.' },
  { name: 'resources', type: 'RESOURCES', topic: 'Links, files and things worth keeping.' },
  { name: 'voice-lounge', type: 'VOICE_STUB', topic: 'Drop in and talk.' },
];

async function createStarterChannels(ctx: MutationCtx, spaceId: Id<'spaces'>): Promise<void> {
  await Promise.all(
    STARTER_CHANNELS.map((channel, index) =>
      ctx.db.insert('channels', {
        spaceId,
        name: channel.name,
        topic: channel.topic,
        type: channel.type,
        position: index,
        isDefault: channel.isDefault ?? false,
      }),
    ),
  );
}

async function memberCount(ctx: QueryCtx | MutationCtx, spaceId: Id<'spaces'>): Promise<number> {
  const rows = await ctx.db
    .query('spaceMembers')
    .withIndex('by_space', (q) => q.eq('spaceId', spaceId))
    .collect();
  return rows.length;
}

// ── Reading ────────────────────────────────────────────────────────────────

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
          if (!space || !isPublished(space)) return null;

          return {
            id: space._id,
            name: space.name,
            slug: space.slug,
            description: space.description ?? null,
            iconUrl: space.iconUrl ?? null,
            bannerUrl: space.bannerUrl ?? null,
            type: space.type,
            memberCount: await memberCount(ctx, space._id),
            myRole: membership.role,
          };
        }),
      )
    ).filter((s): s is NonNullable<typeof s> => s !== null);
  },
});

export const discover = query({
  args: { token: v.string(), search: v.optional(v.string()) },
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

    const term = args.search?.trim().toLowerCase();
    const spaces = await ctx.db.query('spaces').take(400);

    return Promise.all(
      spaces
        .filter(
          (s) =>
            isPublished(s) &&
            s.visibility === 'PUBLIC' &&
            !joined.has(s._id) &&
            (!term ||
              s.name.toLowerCase().includes(term) ||
              (s.tags ?? []).some((tag) => tag.toLowerCase().includes(term))),
        )
        .slice(0, 36)
        .map(async (space) => ({
          id: space._id,
          name: space.name,
          slug: space.slug,
          description: space.description ?? null,
          type: space.type,
          tags: space.tags ?? [],
          memberCount: await memberCount(ctx, space._id),
          myRole: null,
        })),
    );
  },
});

/** A space with its channels, per-channel unread counts and the caller's authority. */
export const get = query({
  args: { token: v.string(), spaceId: v.id('spaces') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    await assertCanView(ctx, args.spaceId, user._id);

    const space = await ctx.db.get(args.spaceId);
    if (!space) throw new Error('NOT_FOUND: No space there');

    // A drafted space is visible only to campus admins and to whoever they made
    // owner — everyone else is told it does not exist, because for them it does not.
    const authority = await authorityIn(ctx, args.spaceId, user);
    if (!isPublished(space) && !authority.isCampusAdmin && authority.rank !== 'OWNER') {
      throw new Error('NOT_FOUND: No space there');
    }

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
      tags: space.tags ?? [],
      visibility: space.visibility,
      isPublished: isPublished(space),
      memberCount: await memberCount(ctx, args.spaceId),
      myRole: authority.rank,
      myPermissions: authority.permissions,
      isCampusAdmin: authority.isCampusAdmin,
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
    const roleDocs = await ctx.db
      .query('spaceRoles')
      .withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
      .collect();
    const roleMap = new Map(roleDocs.map((r) => [r._id, r]));

    return (
      await Promise.all(
        rows.map(async (row) => {
          const member = await ctx.db.get(row.userId);
          if (!member) return null;
          const major = member.majorId ? await ctx.db.get(member.majorId) : null;

          // Highest-positioned role supplies the name colour, the way it does in
          // every chat app people already know.
          const roles = (row.roleIds ?? [])
            .map((id) => roleMap.get(id))
            .filter((r): r is Doc<'spaceRoles'> => r !== undefined)
            .sort((a, b) => b.position - a.position)
            .map((r) => ({ id: r._id, name: r.name, color: r.color, position: r.position }));

          return {
            role: row.role,
            nickname: row.nickname ?? null,
            joinedAt: row.joinedAt,
            roles,
            user: toPublicUser(member, major, online.has(member._id)),
          };
        }),
      )
    ).filter((m): m is NonNullable<typeof m> => m !== null);
  },
});

// ── Creating and editing spaces ────────────────────────────────────────────

/**
 * Student-created spaces (feature 1).
 *
 * Gated on the instance setting, because a campus that wants its Space list
 * curated should be able to have that. MAJOR and COURSE spaces stay off-limits:
 * those are generated from the catalogue and having two "CS 2210" spaces defeats
 * the point of the catalogue.
 */
export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    type: v.union(v.literal('CLUB'), v.literal('INTEREST'), v.literal('GENERAL')),
    visibility: v.union(v.literal('PUBLIC'), v.literal('PRIVATE')),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    const config = await ctx.db.query('instanceConfig').first();
    if (!config?.allowStudentSpaces && !user.isAdmin) {
      throw new Error(
        'FORBIDDEN: This campus keeps space creation with the IT team. Ask them to set one up.',
      );
    }

    const name = args.name.trim();
    if (name.length < 3) throw new Error('BAD_REQUEST: Give it a name of at least 3 characters');
    if (name.length > 60) throw new Error('BAD_REQUEST: That name is too long');

    // A student who has started five spaces and filled none of them is not being
    // stopped from organising; they are being stopped from making a graveyard.
    // Counted through membership rather than `spaces`, so it covers every kind they
    // own and reads one indexed range instead of scanning the table.
    if (!user.isAdmin) {
      const memberships = await ctx.db
        .query('spaceMembers')
        .withIndex('by_user', (q) => q.eq('userId', user._id))
        .collect();
      const owned = memberships.filter((m) => m.role === 'OWNER').length;
      if (owned >= 5) {
        throw new Error(
          'BAD_REQUEST: You already own five spaces. Hand one on before starting another.',
        );
      }
    }

    const now = Date.now();
    const spaceId = await ctx.db.insert('spaces', {
      name,
      slug: await uniqueSlug(ctx, name),
      description: args.description?.trim() || undefined,
      type: args.type,
      visibility: args.visibility,
      ownerId: user._id,
      createdById: user._id,
      publishedAt: now,
      tags: (args.tags ?? [])
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8),
    });

    await ctx.db.insert('spaceMembers', {
      spaceId,
      userId: user._id,
      role: 'OWNER',
      joinedAt: now,
    });
    await createStarterChannels(ctx, spaceId);

    await logAudit(ctx, user, 'SPACE_CREATED', {
      targetType: 'SPACE',
      targetId: spaceId,
      summary: `${user.displayName} created the space "${name}"`,
      metadata: { type: args.type, visibility: args.visibility },
    });

    return spaceId;
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    spaceId: v.id('spaces'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal('PUBLIC'), v.literal('PRIVATE'))),
    tags: v.optional(v.array(v.string())),
    iconUrl: v.optional(v.string()),
    bannerUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const authority = await authorityIn(ctx, args.spaceId, user);
    if (!atLeast(authority.rank, 'ADMIN')) {
      throw new Error('FORBIDDEN: Only space admins can change a space');
    }

    const space = await ctx.db.get(args.spaceId);
    if (!space) throw new Error('NOT_FOUND: No space there');

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined && args.name.trim()) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description.trim() || undefined;
    if (args.visibility !== undefined) patch.visibility = args.visibility;
    if (args.tags !== undefined) {
      patch.tags = args.tags
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8);
    }
    if (args.iconUrl !== undefined) patch.iconUrl = args.iconUrl || undefined;
    if (args.bannerUrl !== undefined) patch.bannerUrl = args.bannerUrl || undefined;

    await ctx.db.patch(args.spaceId, patch);
    await logAudit(ctx, user, 'SPACE_UPDATED', {
      targetType: 'SPACE',
      targetId: args.spaceId,
      summary: `${user.displayName} updated the space "${space.name}"`,
      metadata: { changed: Object.keys(patch) },
    });
    return null;
  },
});

/**
 * Deleting a space.
 *
 * Everything scoped to it goes: channels, messages, reactions, pins, read cursors,
 * roles and memberships. This is one of the few hard deletes in the app, and it is
 * hard because a soft-deleted space is a space that keeps appearing in half the
 * queries that forgot to filter it.
 */
export const remove = mutation({
  args: { token: v.string(), spaceId: v.id('spaces') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const space = await ctx.db.get(args.spaceId);
    if (!space) throw new Error('NOT_FOUND: No space there');

    const rank = await roleIn(ctx, args.spaceId, user._id);
    if (!user.isAdmin && rank !== 'OWNER') {
      throw new Error('FORBIDDEN: Only the owner or a campus admin can delete a space');
    }
    // Auto-generated spaces are part of the catalogue, not somebody's project.
    if (!user.isAdmin && (space.type === 'MAJOR' || space.type === 'COURSE')) {
      throw new Error('FORBIDDEN: Major and course spaces belong to the campus catalogue');
    }

    const channels = await ctx.db
      .query('channels')
      .withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
      .collect();

    for (const channel of channels) {
      const messages = await ctx.db
        .query('messages')
        .withIndex('by_channel', (q) => q.eq('channelId', channel._id))
        .collect();
      for (const message of messages) {
        const reactions = await ctx.db
          .query('reactions')
          .withIndex('by_message', (q) => q.eq('messageId', message._id))
          .collect();
        for (const reaction of reactions) await ctx.db.delete(reaction._id);
        await ctx.db.delete(message._id);
      }

      const pins = await ctx.db
        .query('pinnedMessages')
        .withIndex('by_channel', (q) => q.eq('channelId', channel._id))
        .collect();
      for (const pin of pins) await ctx.db.delete(pin._id);

      const reads = await ctx.db
        .query('channelReads')
        .withIndex('by_channel_user', (q) => q.eq('channelId', channel._id))
        .collect();
      for (const read of reads) await ctx.db.delete(read._id);

      await ctx.db.delete(channel._id);
    }

    const memberships = await ctx.db
      .query('spaceMembers')
      .withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
      .collect();
    for (const membership of memberships) await ctx.db.delete(membership._id);

    const roles = await ctx.db
      .query('spaceRoles')
      .withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
      .collect();
    for (const role of roles) await ctx.db.delete(role._id);

    await ctx.db.delete(args.spaceId);

    await logAudit(ctx, user, 'SPACE_DELETED', {
      targetType: 'SPACE',
      targetId: args.spaceId,
      summary: `${user.displayName} deleted the space "${space.name}"`,
      metadata: { type: space.type, channelsRemoved: channels.length },
    });
    return null;
  },
});

// ── Channels ───────────────────────────────────────────────────────────────

export const createChannel = mutation({
  args: {
    token: v.string(),
    spaceId: v.id('spaces'),
    name: v.string(),
    topic: v.optional(v.string()),
    type: channelTypeValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    await assertPermission(ctx, args.spaceId, user, 'manageChannels', 'manage channels');

    const name = args.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (name.length < 2) throw new Error('BAD_REQUEST: Channel names need at least 2 characters');

    const taken = await ctx.db
      .query('channels')
      .withIndex('by_space_name', (q) => q.eq('spaceId', args.spaceId).eq('name', name))
      .unique();
    if (taken) throw new Error('CONFLICT: This space already has a channel with that name');

    const siblings = await ctx.db
      .query('channels')
      .withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
      .collect();

    return ctx.db.insert('channels', {
      spaceId: args.spaceId,
      name,
      topic: args.topic?.trim() || undefined,
      type: args.type,
      position: siblings.length,
      isDefault: siblings.length === 0,
    });
  },
});

export const updateChannel = mutation({
  args: {
    token: v.string(),
    channelId: v.id('channels'),
    name: v.optional(v.string()),
    topic: v.optional(v.string()),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw new Error('NOT_FOUND: No channel there');
    await assertPermission(ctx, channel.spaceId, user, 'manageChannels', 'manage channels');

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) {
      const name = args.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (name.length < 2) throw new Error('BAD_REQUEST: Channel names need at least 2 characters');
      patch.name = name;
    }
    if (args.topic !== undefined) patch.topic = args.topic.trim() || undefined;
    if (args.position !== undefined) patch.position = args.position;

    await ctx.db.patch(args.channelId, patch);
    return null;
  },
});

export const deleteChannel = mutation({
  args: { token: v.string(), channelId: v.id('channels') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw new Error('NOT_FOUND: No channel there');
    await assertPermission(ctx, channel.spaceId, user, 'manageChannels', 'manage channels');

    const siblings = await ctx.db
      .query('channels')
      .withIndex('by_space', (q) => q.eq('spaceId', channel.spaceId))
      .collect();
    if (siblings.length <= 1) {
      throw new Error('BAD_REQUEST: A space needs at least one channel');
    }

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_channel', (q) => q.eq('channelId', args.channelId))
      .collect();
    for (const message of messages) {
      const reactions = await ctx.db
        .query('reactions')
        .withIndex('by_message', (q) => q.eq('messageId', message._id))
        .collect();
      for (const reaction of reactions) await ctx.db.delete(reaction._id);
      await ctx.db.delete(message._id);
    }

    const pins = await ctx.db
      .query('pinnedMessages')
      .withIndex('by_channel', (q) => q.eq('channelId', args.channelId))
      .collect();
    for (const pin of pins) await ctx.db.delete(pin._id);

    await ctx.db.delete(args.channelId);

    // Something has to be the default, or the space opens onto nothing.
    if (channel.isDefault) {
      const next = siblings.find((c) => c._id !== args.channelId);
      if (next) await ctx.db.patch(next._id, { isDefault: true });
    }
    return null;
  },
});

// ── Membership ─────────────────────────────────────────────────────────────

export const join = mutation({
  args: { token: v.string(), spaceId: v.id('spaces') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const space = await ctx.db.get(args.spaceId);
    if (!space) throw new Error('NOT_FOUND: No space there');
    if (!isPublished(space)) throw new Error('NOT_FOUND: No space there');
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

/** Owner or admin adds someone directly — the invite path for private spaces. */
export const addMember = mutation({
  args: { token: v.string(), spaceId: v.id('spaces'), username: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    await assertPermission(ctx, args.spaceId, user, 'inviteMembers', 'invite people');

    const target = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', args.username.trim().toLowerCase()))
      .unique();
    if (!target || target.deletedAt) throw new Error('NOT_FOUND: No student with that username');

    const existing = await ctx.db
      .query('spaceMembers')
      .withIndex('by_space_user', (q) => q.eq('spaceId', args.spaceId).eq('userId', target._id))
      .unique();
    if (existing) throw new Error('CONFLICT: They are already in this space');

    await ctx.db.insert('spaceMembers', {
      spaceId: args.spaceId,
      userId: target._id,
      role: 'MEMBER',
      joinedAt: Date.now(),
    });

    const space = await ctx.db.get(args.spaceId);
    await ctx.db.insert('notifications', {
      userId: target._id,
      type: 'ANNOUNCEMENT',
      payload: {
        spaceId: args.spaceId,
        from: user.displayName,
        excerpt: `${user.displayName} added you to ${space?.name ?? 'a space'}`,
      },
    });
    return null;
  },
});

/**
 * Move somebody up or down the ladder.
 *
 * Two rules that are not obvious from the signature: you cannot set anyone to
 * OWNER here (that is `transferOwnership`, which is deliberately a separate and
 * scarier call), and you cannot act on somebody at or above your own rank — the
 * usual protection against an ADMIN demoting the other ADMINs.
 */
export const setMemberRole = mutation({
  args: {
    token: v.string(),
    spaceId: v.id('spaces'),
    userId: v.id('users'),
    role: v.union(v.literal('ADMIN'), v.literal('MOD'), v.literal('MEMBER')),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const authority = await authorityIn(ctx, args.spaceId, user);
    if (!atLeast(authority.rank, 'ADMIN')) {
      throw new Error('FORBIDDEN: Only space admins can change roles');
    }

    const membership = await ctx.db
      .query('spaceMembers')
      .withIndex('by_space_user', (q) => q.eq('spaceId', args.spaceId).eq('userId', args.userId))
      .unique();
    if (!membership) throw new Error('NOT_FOUND: They are not in this space');
    if (membership.role === 'OWNER') {
      throw new Error('FORBIDDEN: The owner’s rank is changed by transferring the space');
    }
    if (
      !authority.isCampusAdmin &&
      authority.rank !== 'OWNER' &&
      atLeast(membership.role as 'ADMIN' | 'MOD' | 'MEMBER', 'ADMIN')
    ) {
      throw new Error('FORBIDDEN: You cannot change another admin’s role');
    }

    await ctx.db.patch(membership._id, { role: args.role });
    return null;
  },
});

export const removeMember = mutation({
  args: { token: v.string(), spaceId: v.id('spaces'), userId: v.id('users') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const authority = await assertPermission(
      ctx,
      args.spaceId,
      user,
      'manageMembers',
      'remove members',
    );

    const membership = await ctx.db
      .query('spaceMembers')
      .withIndex('by_space_user', (q) => q.eq('spaceId', args.spaceId).eq('userId', args.userId))
      .unique();
    if (!membership) throw new Error('NOT_FOUND: They are not in this space');
    if (membership.role === 'OWNER') throw new Error('FORBIDDEN: You cannot remove the owner');
    if (
      !authority.isCampusAdmin &&
      authority.rank !== 'OWNER' &&
      atLeast(membership.role as 'ADMIN' | 'MOD' | 'MEMBER', 'ADMIN')
    ) {
      throw new Error('FORBIDDEN: You cannot remove another admin');
    }

    await ctx.db.delete(membership._id);
    return null;
  },
});

export const setNickname = mutation({
  args: {
    token: v.string(),
    spaceId: v.id('spaces'),
    userId: v.id('users'),
    nickname: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    // Setting your own is always allowed; setting someone else's needs the permission.
    if (args.userId !== user._id) {
      await assertPermission(ctx, args.spaceId, user, 'manageMembers', 'rename members');
    }

    const membership = await ctx.db
      .query('spaceMembers')
      .withIndex('by_space_user', (q) => q.eq('spaceId', args.spaceId).eq('userId', args.userId))
      .unique();
    if (!membership) throw new Error('NOT_FOUND: They are not in this space');

    await ctx.db.patch(membership._id, { nickname: args.nickname?.trim() || undefined });
    return null;
  },
});

export const transferOwnership = mutation({
  args: { token: v.string(), spaceId: v.id('spaces'), userId: v.id('users') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const space = await ctx.db.get(args.spaceId);
    if (!space) throw new Error('NOT_FOUND: No space there');

    const rank = await roleIn(ctx, args.spaceId, user._id);
    if (!user.isAdmin && rank !== 'OWNER') {
      throw new Error('FORBIDDEN: Only the current owner can hand a space on');
    }

    const target = await ctx.db
      .query('spaceMembers')
      .withIndex('by_space_user', (q) => q.eq('spaceId', args.spaceId).eq('userId', args.userId))
      .unique();
    if (!target) throw new Error('NOT_FOUND: They have to be in the space first');

    const current = await ctx.db
      .query('spaceMembers')
      .withIndex('by_space_user', (q) => q.eq('spaceId', args.spaceId).eq('userId', space.ownerId))
      .unique();
    // The outgoing owner keeps admin rather than being dropped to member; losing
    // your own space entirely on a handover is a surprise nobody wants.
    if (current) await ctx.db.patch(current._id, { role: 'ADMIN' });

    await ctx.db.patch(target._id, { role: 'OWNER' });
    await ctx.db.patch(args.spaceId, { ownerId: args.userId });

    const newOwner = await ctx.db.get(args.userId);
    await logAudit(ctx, user, 'SPACE_OWNER_ASSIGNED', {
      targetType: 'SPACE',
      targetId: args.spaceId,
      summary: `${user.displayName} made ${newOwner?.displayName ?? 'someone'} owner of "${space.name}"`,
    });
    return null;
  },
});

// ── Custom roles ───────────────────────────────────────────────────────────

export const roles = query({
  args: { token: v.string(), spaceId: v.id('spaces') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    await assertCanView(ctx, args.spaceId, user._id);

    const rows = await ctx.db
      .query('spaceRoles')
      .withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
      .collect();

    const memberships = await ctx.db
      .query('spaceMembers')
      .withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
      .collect();

    return rows
      .sort((a, b) => b.position - a.position)
      .map((role) => ({
        id: role._id,
        name: role.name,
        color: role.color,
        position: role.position,
        permissions: role.permissions,
        memberCount: memberships.filter((m) => (m.roleIds ?? []).includes(role._id)).length,
      }));
  },
});

export const createRole = mutation({
  args: {
    token: v.string(),
    spaceId: v.id('spaces'),
    name: v.string(),
    color: v.string(),
    permissions: permissionsValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const authority = await authorityIn(ctx, args.spaceId, user);
    if (!atLeast(authority.rank, 'ADMIN')) {
      throw new Error('FORBIDDEN: Only space admins can manage roles');
    }

    const name = args.name.trim();
    if (name.length < 2) throw new Error('BAD_REQUEST: Give the role a name');

    const existing = await ctx.db
      .query('spaceRoles')
      .withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
      .collect();
    if (existing.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('CONFLICT: This space already has a role with that name');
    }
    if (existing.length >= 20) throw new Error('BAD_REQUEST: Twenty roles is plenty');

    return ctx.db.insert('spaceRoles', {
      spaceId: args.spaceId,
      name,
      color: /^#[0-9a-fA-F]{6}$/.test(args.color) ? args.color : '#5B5FC7',
      position: existing.length,
      // manageRoles is stripped on the way in as well as on the way out — see
      // lib/permissions.ts. Storing it true would be a lie the UI has to explain.
      permissions: { ...args.permissions, manageRoles: false },
    });
  },
});

export const updateRole = mutation({
  args: {
    token: v.string(),
    roleId: v.id('spaceRoles'),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    position: v.optional(v.number()),
    permissions: v.optional(permissionsValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const role = await ctx.db.get(args.roleId);
    if (!role) throw new Error('NOT_FOUND: No role there');

    const authority = await authorityIn(ctx, role.spaceId, user);
    if (!atLeast(authority.rank, 'ADMIN')) {
      throw new Error('FORBIDDEN: Only space admins can manage roles');
    }

    await ctx.db.patch(args.roleId, {
      ...(args.name !== undefined && args.name.trim() ? { name: args.name.trim() } : {}),
      ...(args.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(args.color)
        ? { color: args.color }
        : {}),
      ...(args.position !== undefined ? { position: args.position } : {}),
      ...(args.permissions ? { permissions: { ...args.permissions, manageRoles: false } } : {}),
    });
    return null;
  },
});

export const deleteRole = mutation({
  args: { token: v.string(), roleId: v.id('spaceRoles') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const role = await ctx.db.get(args.roleId);
    if (!role) throw new Error('NOT_FOUND: No role there');

    const authority = await authorityIn(ctx, role.spaceId, user);
    if (!atLeast(authority.rank, 'ADMIN')) {
      throw new Error('FORBIDDEN: Only space admins can manage roles');
    }

    // Detach before deleting, or every member carries a dangling id forever.
    const memberships = await ctx.db
      .query('spaceMembers')
      .withIndex('by_space', (q) => q.eq('spaceId', role.spaceId))
      .collect();
    for (const membership of memberships) {
      const ids = membership.roleIds ?? [];
      if (ids.includes(args.roleId)) {
        await ctx.db.patch(membership._id, { roleIds: ids.filter((id) => id !== args.roleId) });
      }
    }

    await ctx.db.delete(args.roleId);
    return null;
  },
});

export const setMemberRoles = mutation({
  args: {
    token: v.string(),
    spaceId: v.id('spaces'),
    userId: v.id('users'),
    roleIds: v.array(v.id('spaceRoles')),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const authority = await authorityIn(ctx, args.spaceId, user);
    if (!atLeast(authority.rank, 'ADMIN')) {
      throw new Error('FORBIDDEN: Only space admins can assign roles');
    }

    const membership = await ctx.db
      .query('spaceMembers')
      .withIndex('by_space_user', (q) => q.eq('spaceId', args.spaceId).eq('userId', args.userId))
      .unique();
    if (!membership) throw new Error('NOT_FOUND: They are not in this space');

    // Roles from another space would grant permissions their owner never agreed to.
    const valid: Id<'spaceRoles'>[] = [];
    for (const roleId of args.roleIds) {
      const role = await ctx.db.get(roleId);
      if (role && role.spaceId === args.spaceId) valid.push(roleId);
    }

    await ctx.db.patch(membership._id, { roleIds: valid });
    return null;
  },
});

/** The caller's own authority, for UI that has to decide what to render. */
export const myPermissions = query({
  args: { token: v.string(), spaceId: v.id('spaces') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const space = await ctx.db.get(args.spaceId);
    if (!space) return { rank: null, permissions: NO_PERMISSIONS, isCampusAdmin: false };

    const authority = await authorityIn(ctx, args.spaceId, user);
    return {
      rank: authority.rank,
      permissions: authority.permissions,
      isCampusAdmin: authority.isCampusAdmin,
    };
  },
});
