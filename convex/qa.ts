import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireUser } from './lib/auth';
import { KARMA, grantKarma, reevaluateBadges } from './lib/karma';
import { toPublicUser } from './lib/serialize';

/** Course Q&A — ported from routes/courses.ts. */

export const list = query({
  args: {
    token: v.string(),
    courseId: v.optional(v.id('courses')),
    spaceId: v.optional(v.id('spaces')),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.token);

    const rows = args.courseId
      ? await ctx.db
          .query('qaPosts')
          .withIndex('by_course', (q) => q.eq('courseId', args.courseId))
          .collect()
      : args.spaceId
        ? await ctx.db
            .query('qaPosts')
            .withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
            .collect()
        : await ctx.db.query('qaPosts').take(40);

    return Promise.all(
      rows
        .sort((a, b) => b._creationTime - a._creationTime)
        .slice(0, 40)
        .map(async (post) => {
          const author = await ctx.db.get(post.authorId);
          const major = author?.majorId ? await ctx.db.get(author.majorId) : null;
          const answers = await ctx.db
            .query('qaAnswers')
            .withIndex('by_post', (q) => q.eq('postId', post._id))
            .collect();

          return {
            id: post._id,
            title: post.title,
            body: post.body,
            score: post.score,
            createdAt: post._creationTime,
            author: author ? toPublicUser(author, major) : null,
            answerCount: answers.length,
            isResolved: Boolean(post.acceptedAnswerId),
          };
        }),
    );
  },
});

export const get = query({
  args: { token: v.string(), postId: v.id('qaPosts') },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.token);

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error('NOT_FOUND: No question there');

    const author = await ctx.db.get(post.authorId);
    const authorMajor = author?.majorId ? await ctx.db.get(author.majorId) : null;

    const answers = await ctx.db
      .query('qaAnswers')
      .withIndex('by_post', (q) => q.eq('postId', args.postId))
      .collect();

    return {
      id: post._id,
      title: post.title,
      body: post.body,
      score: post.score,
      createdAt: post._creationTime,
      author: author ? toPublicUser(author, authorMajor) : null,
      acceptedAnswerId: post.acceptedAnswerId ?? null,
      answers: await Promise.all(
        answers
          .sort((a, b) => b.score - a.score || a._creationTime - b._creationTime)
          .map(async (answer) => {
            const answerAuthor = await ctx.db.get(answer.authorId);
            const major = answerAuthor?.majorId ? await ctx.db.get(answerAuthor.majorId) : null;
            return {
              id: answer._id,
              body: answer.body,
              score: answer.score,
              createdAt: answer._creationTime,
              author: answerAuthor ? toPublicUser(answerAuthor, major) : null,
              isAccepted: answer._id === post.acceptedAnswerId,
            };
          }),
      ),
    };
  },
});

export const ask = mutation({
  args: {
    token: v.string(),
    title: v.string(),
    body: v.string(),
    courseId: v.optional(v.id('courses')),
    spaceId: v.optional(v.id('spaces')),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    if (args.title.length < 8) throw new Error('BAD_REQUEST: Give the question a fuller title');

    return ctx.db.insert('qaPosts', {
      courseId: args.courseId,
      spaceId: args.spaceId,
      authorId: user._id,
      title: args.title,
      body: args.body,
      score: 0,
    });
  },
});

export const answer = mutation({
  args: { token: v.string(), postId: v.id('qaPosts'), body: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    if (args.body.length < 10) throw new Error('BAD_REQUEST: Answers need a bit more than that');

    return ctx.db.insert('qaAnswers', {
      postId: args.postId,
      authorId: user._id,
      body: args.body,
      score: 0,
    });
  },
});

/** Only the asker accepts, and an accepted answer is worth +10 karma (section 5.5). */
export const accept = mutation({
  args: { token: v.string(), postId: v.id('qaPosts'), answerId: v.id('qaAnswers') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error('NOT_FOUND: No question there');
    if (post.authorId !== user._id) {
      throw new Error('FORBIDDEN: Only the asker can accept an answer');
    }

    const answer = await ctx.db.get(args.answerId);
    if (!answer || answer.postId !== args.postId) throw new Error('NOT_FOUND: No answer there');

    await ctx.db.patch(args.postId, { acceptedAnswerId: args.answerId });

    if (answer.authorId !== user._id) {
      await grantKarma(ctx, answer.authorId, KARMA.ACCEPTED_ANSWER);
      await reevaluateBadges(ctx, answer.authorId);
    }
    return null;
  },
});
