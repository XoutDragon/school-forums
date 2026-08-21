import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireUser } from './lib/auth';
import { reevaluateBadges } from './lib/karma';
import { toPublicUser } from './lib/serialize';
import { notify } from './notifications';

/** Club directory, pages and the quiz — ported from routes/clubs.ts. */

export const list = query({
  args: {
    token: v.string(),
    category: v.optional(v.string()),
    recruiting: v.optional(v.boolean()),
    search: v.optional(v.string()),
    sort: v.optional(v.union(v.literal('members'), v.literal('newest'))),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const search = (args.search ?? '').trim();

    let rows = search
      ? await ctx.db
          .query('clubs')
          .withSearchIndex('search_clubs', (q) => q.search('name', search))
          .take(60)
      : await ctx.db.query('clubs').collect();

    if (args.category && args.category !== 'ALL') {
      rows = rows.filter((c) => c.category === args.category);
    }
    if (args.recruiting) rows = rows.filter((c) => c.isRecruiting);

    const mine = new Map(
      (
        await ctx.db
          .query('clubMemberships')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .collect()
      ).map((m) => [m.clubId, m.role]),
    );

    const withCounts = await Promise.all(
      rows.map(async (club) => {
        const space = await ctx.db
          .query('spaces')
          .withIndex('by_club', (q) => q.eq('linkedClubId', club._id))
          .first();
        return {
          id: club._id,
          name: club.name,
          slug: club.slug,
          description: club.description,
          category: club.category,
          logoUrl: club.logoUrl ?? null,
          meetingInfo: club.meetingInfo ?? null,
          isRecruiting: club.isRecruiting,
          memberCount: (
            await ctx.db
              .query('clubMemberships')
              .withIndex('by_club', (q) => q.eq('clubId', club._id))
              .collect()
          ).length,
          spaceId: space?._id ?? null,
          myRole: mine.get(club._id) ?? null,
          createdAt: club._creationTime,
        };
      }),
    );

    return args.sort === 'newest'
      ? withCounts.sort((a, b) => b.createdAt - a.createdAt)
      : withCounts.sort((a, b) => b.memberCount - a.memberCount);
  },
});

export const getBySlug = query({
  args: { token: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    const club = await ctx.db
      .query('clubs')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique();
    if (!club) throw new Error('NOT_FOUND: No club there');

    const memberships = await ctx.db
      .query('clubMemberships')
      .withIndex('by_club', (q) => q.eq('clubId', club._id))
      .collect();

    const execs = (
      await Promise.all(
        memberships
          .filter((m) => m.role === 'PRESIDENT' || m.role === 'EXEC')
          .map(async (m) => {
            const member = await ctx.db.get(m.userId);
            if (!member) return null;
            const major = member.majorId ? await ctx.db.get(member.majorId) : null;
            return { role: m.role, user: toPublicUser(member, major) };
          }),
      )
    ).filter((e): e is NonNullable<typeof e> => e !== null);

    const space = await ctx.db
      .query('spaces')
      .withIndex('by_club', (q) => q.eq('linkedClubId', club._id))
      .first();

    const now = Date.now();
    const events = (
      await ctx.db
        .query('events')
        .withIndex('by_host', (q) => q.eq('hostType', 'CLUB').eq('hostId', club._id))
        .collect()
    )
      .filter((e) => e.startsAt >= now)
      .sort((a, b) => a.startsAt - b.startsAt)
      .slice(0, 5);

    // Photo strip: recent image attachments from the club's own space (section 5.4).
    let photos: { url: string; name: string }[] = [];
    if (space) {
      const channels = await ctx.db
        .query('channels')
        .withIndex('by_space', (q) => q.eq('spaceId', space._id))
        .collect();

      for (const channel of channels) {
        const messages = await ctx.db
          .query('messages')
          .withIndex('by_channel', (q) => q.eq('channelId', channel._id))
          .order('desc')
          .take(40);

        photos.push(
          ...messages
            .filter((m) => !m.deletedAt)
            .flatMap((m) => m.attachments)
            .filter((a) => a.mimeType.startsWith('image/'))
            .map((a) => ({ url: a.url, name: a.name })),
        );
        if (photos.length >= 8) break;
      }
      photos = photos.slice(0, 8);
    }

    return {
      id: club._id,
      name: club.name,
      slug: club.slug,
      description: club.description,
      category: club.category,
      logoUrl: club.logoUrl ?? null,
      meetingInfo: club.meetingInfo ?? null,
      isRecruiting: club.isRecruiting,
      socialLinks: club.socialLinks,
      memberCount: memberships.length,
      spaceId: space?._id ?? null,
      myRole: memberships.find((m) => m.userId === user._id)?.role ?? null,
      execs,
      events: events.map((e) => ({
        id: e._id,
        title: e.title,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        location: e.location,
      })),
      photos,
    };
  },
});

/** Joining a club joins its space; following gets announcements only (section 5.4). */
export const setMembership = mutation({
  args: {
    token: v.string(),
    clubId: v.id('clubs'),
    role: v.union(v.literal('MEMBER'), v.literal('FOLLOWER')),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const club = await ctx.db.get(args.clubId);
    if (!club) throw new Error('NOT_FOUND: No club there');

    const existing = await ctx.db
      .query('clubMemberships')
      .withIndex('by_club_user', (q) => q.eq('clubId', args.clubId).eq('userId', user._id))
      .unique();

    if (existing) await ctx.db.patch(existing._id, { role: args.role });
    else
      await ctx.db.insert('clubMemberships', {
        clubId: args.clubId,
        userId: user._id,
        role: args.role,
      });

    const existingSpace = await ctx.db
      .query('spaces')
      .withIndex('by_club', (q) => q.eq('linkedClubId', args.clubId))
      .first();

    // Tracked as an id rather than a stand-in document: the freshly inserted space
    // is not a full Doc, and casting a partial object to one is a lie the next
    // reader of this code has to catch.
    let spaceId = existingSpace?._id ?? null;

    // A club with no space yet gets one on first join, so joining never lands
    // somebody nowhere.
    if (args.role === 'MEMBER' && !spaceId) {
      spaceId = await ctx.db.insert('spaces', {
        name: club.name,
        slug: `club-${club.slug}`,
        description: club.description,
        type: 'CLUB',
        visibility: 'PUBLIC',
        ownerId: user._id,
        createdById: user._id,
        linkedClubId: args.clubId,
        publishedAt: Date.now(),
      });

      const channelNames = ['general', 'announcements', 'resources'];
      for (let i = 0; i < channelNames.length; i++) {
        await ctx.db.insert('channels', {
          spaceId,
          name: channelNames[i]!,
          type: i === 1 ? 'ANNOUNCEMENT' : 'TEXT',
          position: i,
          isDefault: i === 0,
          topic: i === 1 ? 'Announcements from leadership.' : undefined,
        });
      }

      // The space records this person as its owner, so their membership has to say
      // so too. Permission checks read the spaceMembers row, not `ownerId` — leaving
      // them at MEMBER would mean the declared owner could not manage, delete or
      // hand on the space they supposedly own.
      await ctx.db.insert('spaceMembers', {
        spaceId,
        userId: user._id,
        role: 'OWNER',
        joinedAt: Date.now(),
      });
    }

    if (args.role === 'MEMBER' && spaceId) {
      const member = await ctx.db
        .query('spaceMembers')
        .withIndex('by_space_user', (q) => q.eq('spaceId', spaceId!).eq('userId', user._id))
        .unique();
      if (!member) {
        await ctx.db.insert('spaceMembers', {
          spaceId,
          userId: user._id,
          role: 'MEMBER',
          joinedAt: Date.now(),
        });
      }
    }

    await reevaluateBadges(ctx, user._id);
    return { role: args.role, spaceId };
  },
});

export const leave = mutation({
  args: { token: v.string(), clubId: v.id('clubs') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const existing = await ctx.db
      .query('clubMemberships')
      .withIndex('by_club_user', (q) => q.eq('clubId', args.clubId).eq('userId', user._id))
      .unique();
    if (existing) await ctx.db.delete(existing._id);

    // Also remove from the linked space
    const space = await ctx.db
      .query('spaces')
      .withIndex('by_club', (q) => q.eq('linkedClubId', args.clubId))
      .first();

    if (space) {
      const spaceMember = await ctx.db
        .query('spaceMembers')
        .withIndex('by_space_user', (q) => q.eq('spaceId', space._id).eq('userId', user._id))
        .unique();
      if (spaceMember) await ctx.db.delete(spaceMember._id);
    }

    return null;
  },
});

/** Exec announcement: cross-posts to the space and notifies followers (section 5.4). */
export const announce = mutation({
  args: { token: v.string(), clubId: v.id('clubs'), content: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    const membership = await ctx.db
      .query('clubMemberships')
      .withIndex('by_club_user', (q) => q.eq('clubId', args.clubId).eq('userId', user._id))
      .unique();
    if (!membership || !['PRESIDENT', 'EXEC'].includes(membership.role)) {
      throw new Error('FORBIDDEN: Club execs only');
    }

    const club = await ctx.db.get(args.clubId);
    if (!club) throw new Error('NOT_FOUND: No club there');

    const space = await ctx.db
      .query('spaces')
      .withIndex('by_club', (q) => q.eq('linkedClubId', args.clubId))
      .first();

    let messageId = null;
    if (space) {
      const channel = (
        await ctx.db
          .query('channels')
          .withIndex('by_space_type', (q) => q.eq('spaceId', space._id).eq('type', 'ANNOUNCEMENT'))
          .collect()
      )[0];

      if (channel) {
        messageId = await ctx.db.insert('messages', {
          channelId: channel._id,
          authorId: user._id,
          content: args.content,
          attachments: [],
          isAnonymous: false,
        });
      }
    }

    const audience = (
      await ctx.db
        .query('clubMemberships')
        .withIndex('by_club', (q) => q.eq('clubId', args.clubId))
        .collect()
    ).filter((m) => m.userId !== user._id);

    for (const member of audience) {
      await notify(ctx, member.userId, 'ANNOUNCEMENT', {
        clubId: args.clubId,
        clubName: club.name,
        excerpt: args.content.slice(0, 140),
        messageId,
      });
    }

    return { messageId, notified: audience.length };
  },
});

// ── Quiz (section 5.4) ──────────────────────────────────────────────────────────

export const QUIZ_QUESTIONS = [
  {
    id: 'when',
    prompt: 'When do you actually have energy?',
    options: [
      { label: 'Weeknights', tags: ['weeknight', 'casual'] },
      { label: 'Weekends', tags: ['weekend', 'outdoors'] },
      { label: 'Whenever, I have no schedule', tags: ['flexible', 'casual'] },
    ],
  },
  {
    id: 'mode',
    prompt: 'Pick a verb.',
    options: [
      { label: 'Build things', tags: ['making', 'technical'] },
      { label: 'Debate things', tags: ['discussion', 'academic'] },
      { label: 'Perform things', tags: ['performance', 'creative'] },
      { label: 'Move things', tags: ['sport', 'outdoors'] },
    ],
  },
  {
    id: 'size',
    prompt: 'How many people is too many people?',
    options: [
      { label: 'More than six', tags: ['small', 'casual'] },
      { label: 'A packed room is the point', tags: ['large', 'social'] },
    ],
  },
  {
    id: 'stakes',
    prompt: 'Would you compete?',
    options: [
      { label: 'Only if there is a trophy', tags: ['competitive'] },
      { label: 'I am here to hang out', tags: ['casual', 'social'] },
    ],
  },
  {
    id: 'outcome',
    prompt: 'What would make the term feel worth it?',
    options: [
      { label: 'A portfolio piece', tags: ['making', 'career'] },
      { label: 'A group chat that keeps going', tags: ['social', 'casual'] },
      { label: 'Something that helped someone', tags: ['volunteer', 'service'] },
    ],
  },
  {
    id: 'setting',
    prompt: 'Where does this happen?',
    options: [
      { label: 'A lab or a workshop', tags: ['making', 'technical'] },
      { label: 'A field or a trail', tags: ['outdoors', 'sport'] },
      { label: 'A stage or a studio', tags: ['performance', 'creative'] },
      { label: 'A booked room with snacks', tags: ['discussion', 'social'] },
    ],
  },
] as const;

export const quizQuestions = query({
  args: {},
  handler: async () => QUIZ_QUESTIONS,
});

export const quizResults = query({
  args: { token: v.string(), tags: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.token);
    const picked = args.tags.map((t) => t.toLowerCase());

    const clubs = await ctx.db.query('clubs').collect();

    const ranked = clubs
      .map((club) => {
        const overlap = club.tags.map((t) => t.toLowerCase()).filter((t) => picked.includes(t));
        return { club, overlap, score: overlap.length + (club.isRecruiting ? 0.5 : 0) };
      })
      .filter((entry) => entry.overlap.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return Promise.all(
      ranked.map(async ({ club, overlap }) => ({
        id: club._id,
        name: club.name,
        slug: club.slug,
        description: club.description,
        category: club.category,
        logoUrl: club.logoUrl ?? null,
        isRecruiting: club.isRecruiting,
        memberCount: (
          await ctx.db
            .query('clubMemberships')
            .withIndex('by_club', (q) => q.eq('clubId', club._id))
            .collect()
        ).length,
        matchedOn: overlap.slice(0, 3),
      })),
    );
  },
});
