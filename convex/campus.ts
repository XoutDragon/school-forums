import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { consumeRateLimit, requireAdmin, requireUser } from './lib/auth';
import { toPublicUser } from './lib/serialize';
import { notify } from './notifications';

/** Marketplace, lost & found, mentorship and moderation — from routes/misc.ts. */

// ── Marketplace ────────────────────────────────────────────────────────────

export const listings = query({
  args: {
    token: v.string(),
    category: v.optional(v.string()),
    courseId: v.optional(v.id('courses')),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.token);

    let rows = await ctx.db
      .query('marketplaceListings')
      .withIndex('by_status', (q) => q.eq('status', 'ACTIVE'))
      .collect();

    if (args.category && args.category !== 'ALL') {
      rows = rows.filter((l) => l.category === args.category);
    }
    if (args.courseId) rows = rows.filter((l) => l.courseId === args.courseId);

    return Promise.all(
      rows
        .sort((a, b) => b._creationTime - a._creationTime)
        .slice(0, 60)
        .map(async (listing) => {
          const seller = await ctx.db.get(listing.sellerId);
          const major = seller?.majorId ? await ctx.db.get(seller.majorId) : null;
          const course = listing.courseId ? await ctx.db.get(listing.courseId) : null;
          return {
            id: listing._id,
            title: listing.title,
            description: listing.description ?? null,
            priceCents: listing.priceCents,
            category: listing.category,
            photos: listing.photos,
            status: listing.status,
            createdAt: listing._creationTime,
            seller: seller ? toPublicUser(seller, major) : null,
            course: course ? { id: course._id, code: course.code } : null,
          };
        }),
    );
  },
});

export const createListing = mutation({
  args: {
    token: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    priceCents: v.number(),
    category: v.union(
      v.literal('TEXTBOOK'),
      v.literal('ELECTRONICS'),
      v.literal('FURNITURE'),
      v.literal('TICKETS'),
      v.literal('OTHER'),
    ),
    courseId: v.optional(v.id('courses')),
    /**
     * Photos are optional (feature 5). The client uploads to Convex storage first
     * and passes storage ids; the URLs are resolved here and denormalised onto the
     * listing, so the grid renders from one read instead of one read per photo.
     */
    photoStorageIds: v.optional(v.array(v.id('_storage'))),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    const title = args.title.trim();
    if (title.length < 3) throw new Error('BAD_REQUEST: Give the listing a title');
    if (args.priceCents < 0) throw new Error('BAD_REQUEST: A price cannot be negative');

    const ids = (args.photoStorageIds ?? []).slice(0, 4);
    const photos = (await Promise.all(ids.map((id) => ctx.storage.getUrl(id)))).filter(
      (url): url is string => url !== null,
    );

    return ctx.db.insert('marketplaceListings', {
      sellerId: user._id,
      title,
      description: args.description?.trim() || undefined,
      priceCents: Math.round(args.priceCents),
      category: args.category,
      courseId: args.courseId,
      photos,
      status: 'ACTIVE',
    });
  },
});

export const setListingStatus = mutation({
  args: {
    token: v.string(),
    listingId: v.id('marketplaceListings'),
    status: v.union(v.literal('ACTIVE'), v.literal('PENDING'), v.literal('SOLD')),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const listing = await ctx.db.get(args.listingId);
    if (!listing) throw new Error('NOT_FOUND: No listing there');
    if (listing.sellerId !== user._id) throw new Error("FORBIDDEN: That listing isn't yours");

    await ctx.db.patch(args.listingId, { status: args.status });
    return null;
  },
});

// ── Lost & found ───────────────────────────────────────────────────────────

export const lostFound = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.token);

    const rows = await ctx.db
      .query('lostFoundItems')
      .withIndex('by_status', (q) => q.eq('status', 'OPEN'))
      .collect();

    return Promise.all(
      rows
        .sort((a, b) => b._creationTime - a._creationTime)
        .map(async (item) => {
          const reporter = await ctx.db.get(item.reporterId);
          const major = reporter?.majorId ? await ctx.db.get(reporter.majorId) : null;
          return {
            id: item._id,
            kind: item.kind,
            title: item.title,
            description: item.description,
            location: item.location,
            photoUrl: item.photoUrl ?? null,
            status: item.status,
            createdAt: item._creationTime,
            reporter: reporter ? toPublicUser(reporter, major) : null,
          };
        }),
    );
  },
});

export const reportLostFound = mutation({
  args: {
    token: v.string(),
    kind: v.union(v.literal('LOST'), v.literal('FOUND')),
    title: v.string(),
    description: v.string(),
    location: v.string(),
    photoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    return ctx.db.insert('lostFoundItems', {
      reporterId: user._id,
      kind: args.kind,
      title: args.title,
      description: args.description,
      location: args.location,
      photoUrl: args.photoUrl,
      status: 'OPEN',
    });
  },
});

export const resolveLostFound = mutation({
  args: { token: v.string(), itemId: v.id('lostFoundItems') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const item = await ctx.db.get(args.itemId);
    if (item && item.reporterId === user._id) {
      await ctx.db.patch(args.itemId, { status: 'RESOLVED' });
    }
    return null;
  },
});

// ── Mentorship ─────────────────────────────────────────────────────────────

export const mentors = query({
  args: { token: v.string(), majorId: v.optional(v.id('majors')) },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.token);

    const profiles = await ctx.db
      .query('mentorProfiles')
      .withIndex('by_is_mentor', (q) => q.eq('isMentor', true))
      .take(60);

    return (
      await Promise.all(
        profiles.map(async (profile) => {
          const mentor = await ctx.db.get(profile.userId);
          if (!mentor || mentor.deletedAt) return null;
          if (args.majorId && mentor.majorId !== args.majorId) return null;

          const major = mentor.majorId ? await ctx.db.get(mentor.majorId) : null;
          const taken = (
            await ctx.db
              .query('mentorLinks')
              .withIndex('by_mentor_status', (q) =>
                q.eq('mentorId', mentor._id).eq('status', 'ACTIVE'),
              )
              .collect()
          ).length;

          return {
            id: profile._id,
            user: toPublicUser(mentor, major),
            topics: profile.topics,
            blurb: profile.blurb,
            capacity: profile.capacity,
            taken,
            hasRoom: taken < profile.capacity,
          };
        }),
      )
    ).filter((m): m is NonNullable<typeof m> => m !== null);
  },
});

export const requestMentor = mutation({
  args: { token: v.string(), mentorId: v.id('users'), message: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    if (user._id === args.mentorId) throw new Error("BAD_REQUEST: You can't mentor yourself");

    const profile = await ctx.db
      .query('mentorProfiles')
      .withIndex('by_user', (q) => q.eq('userId', args.mentorId))
      .unique();
    if (!profile) throw new Error("NOT_FOUND: That student isn't mentoring");

    const active = (
      await ctx.db
        .query('mentorLinks')
        .withIndex('by_mentor_status', (q) =>
          q.eq('mentorId', args.mentorId).eq('status', 'ACTIVE'),
        )
        .collect()
    ).length;
    if (active >= profile.capacity) throw new Error('CONFLICT: That mentor is at capacity');

    const existing = await ctx.db
      .query('mentorLinks')
      .withIndex('by_pair', (q) => q.eq('mentorId', args.mentorId).eq('menteeId', user._id))
      .unique();

    if (existing) await ctx.db.patch(existing._id, { message: args.message });
    else {
      await ctx.db.insert('mentorLinks', {
        mentorId: args.mentorId,
        menteeId: user._id,
        status: 'REQUESTED',
        message: args.message,
      });
    }

    await notify(ctx, args.mentorId, 'MENTOR_REQUEST', {
      userId: user._id,
      name: user.displayName,
      username: user.username,
      message: args.message ?? null,
    });
    return null;
  },
});

export const acceptMentee = mutation({
  args: { token: v.string(), linkId: v.id('mentorLinks') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error('NOT_FOUND: No request there');
    if (link.mentorId !== user._id) throw new Error('FORBIDDEN: Not your request to accept');

    await ctx.db.patch(args.linkId, { status: 'ACTIVE' });

    const now = Date.now();
    const conversationId = await ctx.db.insert('directConversations', {
      isGroup: false,
      lastMessageAt: now,
    });
    await ctx.db.insert('directMembers', { conversationId, userId: user._id, lastReadAt: now });
    await ctx.db.insert('directMembers', {
      conversationId,
      userId: link.menteeId,
      lastReadAt: now,
    });

    await notify(ctx, link.menteeId, 'MENTOR_ACCEPTED', { userId: user._id, conversationId });
    return { conversationId };
  },
});

// ── Moderation (section 5.10) ───────────────────────────────────────────────────

export const report = mutation({
  args: {
    token: v.string(),
    targetType: v.union(
      v.literal('MESSAGE'),
      v.literal('USER'),
      v.literal('RESOURCE'),
      v.literal('LISTING'),
      v.literal('REVIEW'),
      v.literal('EVENT'),
    ),
    targetId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    await consumeRateLimit(ctx, 'reports', user._id);

    return ctx.db.insert('reports', {
      reporterId: user._id,
      targetType: args.targetType,
      targetId: args.targetId,
      reason: args.reason,
      status: 'OPEN',
    });
  },
});

export const openReports = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);

    const rows = await ctx.db
      .query('reports')
      .withIndex('by_status', (q) => q.eq('status', 'OPEN'))
      .collect();

    return Promise.all(
      rows.map(async (row) => {
        const reporter = await ctx.db.get(row.reporterId);
        const major = reporter?.majorId ? await ctx.db.get(reporter.majorId) : null;
        return {
          id: row._id,
          targetType: row.targetType,
          targetId: row.targetId,
          reason: row.reason,
          createdAt: row._creationTime,
          reporter: reporter ? toPublicUser(reporter, major) : null,
        };
      }),
    );
  },
});

export const resolveReport = mutation({
  args: {
    token: v.string(),
    reportId: v.id('reports'),
    status: v.union(v.literal('ACTIONED'), v.literal('DISMISSED')),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    await ctx.db.patch(args.reportId, { status: args.status, resolvedById: admin._id });
    return null;
  },
});

/** Unmasking an anonymous post is itself a moderation action, and is logged as one. */
export const revealAnonymousAuthor = mutation({
  args: { token: v.string(), messageId: v.id('messages') },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error('NOT_FOUND: No message there');
    if (!message.authorId) return { author: null };

    await ctx.db.insert('moderationActions', {
      moderatorId: admin._id,
      targetUserId: message.authorId,
      type: 'CONTENT_REMOVED',
      reason: `Viewed authorship of anonymous message ${args.messageId}`,
    });

    const author = await ctx.db.get(message.authorId);
    const major = author?.majorId ? await ctx.db.get(author.majorId) : null;
    return { author: author ? toPublicUser(author, major) : null };
  },
});
