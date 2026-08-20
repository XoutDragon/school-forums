import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { consumeRateLimit, requireUser } from './lib/auth';
import { KARMA, grantKarma, reevaluateBadges } from './lib/karma';
import { toPublicUser } from './lib/serialize';

/**
 * The resource library — ported from routes/courses.ts.
 *
 * Files move from server/uploads/ on local disk to Convex file storage. Uploads are
 * a two-step handshake: the client asks for an upload URL, POSTs the file straight
 * to it, then passes the returned storageId back here.
 */

export const list = query({
  args: {
    token: v.string(),
    courseId: v.optional(v.id('courses')),
    spaceId: v.optional(v.id('spaces')),
    sort: v.optional(v.union(v.literal('top'), v.literal('new'))),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    const rows = args.courseId
      ? await ctx.db
          .query('resources')
          .withIndex('by_course', (q) => q.eq('courseId', args.courseId))
          .collect()
      : args.spaceId
        ? await ctx.db
            .query('resources')
            .withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
            .collect()
        : await ctx.db.query('resources').take(50);

    const sorted =
      args.sort === 'new'
        ? rows.sort((a, b) => b._creationTime - a._creationTime)
        : rows.sort((a, b) => b.score - a.score || b._creationTime - a._creationTime);

    return Promise.all(
      sorted.slice(0, 50).map(async (resource) => {
        const uploader = await ctx.db.get(resource.uploaderId);
        const major = uploader?.majorId ? await ctx.db.get(uploader.majorId) : null;
        const course = resource.courseId ? await ctx.db.get(resource.courseId) : null;

        const myVote = await ctx.db
          .query('resourceVotes')
          .withIndex('by_resource_user', (q) =>
            q.eq('resourceId', resource._id).eq('userId', user._id),
          )
          .unique();

        return {
          id: resource._id,
          title: resource.title,
          description: resource.description ?? null,
          type: resource.type,
          // Signed URL, valid for the life of the query result.
          fileUrl: resource.storageId ? await ctx.storage.getUrl(resource.storageId) : null,
          linkUrl: resource.linkUrl ?? null,
          term: resource.term ?? null,
          score: resource.score,
          downloadCount: resource.downloadCount,
          createdAt: resource._creationTime,
          uploader: uploader ? toPublicUser(uploader, major) : null,
          course: course ? { id: course._id, code: course.code } : null,
          myVote: myVote?.value ?? 0,
        };
      }),
    );
  },
});

/** Step one of an upload: a short-lived URL the browser POSTs the file to. */
export const generateUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    await consumeRateLimit(ctx, 'uploads', user._id);
    return ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    type: v.union(
      v.literal('NOTES'),
      v.literal('PRACTICE_EXAM'),
      v.literal('CHEAT_SHEET'),
      v.literal('LINK'),
      v.literal('GUIDE'),
      v.literal('OTHER'),
    ),
    courseId: v.optional(v.id('courses')),
    spaceId: v.optional(v.id('spaces')),
    storageId: v.optional(v.id('_storage')),
    linkUrl: v.optional(v.string()),
    term: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    if (!args.storageId && !args.linkUrl) {
      throw new Error('BAD_REQUEST: Attach a file or paste a link');
    }
    if (!args.courseId && !args.spaceId) {
      throw new Error('BAD_REQUEST: A resource has to live on a course or a space');
    }

    return ctx.db.insert('resources', {
      courseId: args.courseId,
      spaceId: args.spaceId,
      uploaderId: user._id,
      title: args.title,
      description: args.description,
      type: args.type,
      storageId: args.storageId,
      linkUrl: args.linkUrl,
      term: args.term,
      downloadCount: 0,
      score: 0,
    });
  },
});

export const vote = mutation({
  args: { token: v.string(), resourceId: v.id('resources'), value: v.number() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    if (![1, -1, 0].includes(args.value)) throw new Error('BAD_REQUEST: Invalid vote');

    const resource = await ctx.db.get(args.resourceId);
    if (!resource) throw new Error('NOT_FOUND: No resource there');

    const previous = await ctx.db
      .query('resourceVotes')
      .withIndex('by_resource_user', (q) =>
        q.eq('resourceId', args.resourceId).eq('userId', user._id),
      )
      .unique();

    if (args.value === 0) {
      if (previous) await ctx.db.delete(previous._id);
    } else if (previous) {
      await ctx.db.patch(previous._id, { value: args.value });
    } else {
      await ctx.db.insert('resourceVotes', {
        resourceId: args.resourceId,
        userId: user._id,
        value: args.value,
      });
    }

    const delta = args.value - (previous?.value ?? 0);
    await ctx.db.patch(args.resourceId, { score: resource.score + delta });

    // Karma follows the upvote, not the vote count, so flipping can't farm it.
    if (delta > 0 && resource.uploaderId !== user._id) {
      await grantKarma(ctx, resource.uploaderId, KARMA.RESOURCE_UPVOTE * delta);
      await reevaluateBadges(ctx, resource.uploaderId);
    }

    return { score: resource.score + delta, myVote: args.value };
  },
});

export const registerDownload = mutation({
  args: { token: v.string(), resourceId: v.id('resources') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const resource = await ctx.db.get(args.resourceId);
    if (!resource) throw new Error('NOT_FOUND: No resource there');

    await ctx.db.patch(args.resourceId, { downloadCount: resource.downloadCount + 1 });
    if (resource.uploaderId !== user._id) {
      await grantKarma(ctx, resource.uploaderId, KARMA.RESOURCE_DOWNLOAD);
    }

    const url = resource.storageId
      ? await ctx.storage.getUrl(resource.storageId)
      : (resource.linkUrl ?? null);

    return { url, downloadCount: resource.downloadCount + 1 };
  },
});
