import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { onlineUserIds, requireUser } from './lib/auth';
import { KARMA, currentTerm, grantKarma, reevaluateBadges } from './lib/karma';
import { toPublicUser } from './lib/serialize';

/** The Course Hub — ported from routes/courses.ts. */

function toCourseDto(course: Doc<'courses'>, major: Doc<'majors'> | null) {
  return {
    id: course._id,
    code: course.code,
    title: course.title,
    description: course.description ?? null,
    level: course.level,
    major: major ? { id: major._id, name: major.name } : null,
    avgDifficulty: course.avgDifficulty ?? null,
    avgWorkload: course.avgWorkload ?? null,
    avgRating: course.avgRating ?? null,
    reviewCount: course.reviewCount,
    takingThisTerm: 0,
  };
}

export const list = query({
  args: {
    token: v.string(),
    search: v.optional(v.string()),
    majorId: v.optional(v.id('majors')),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.token);
    const search = (args.search ?? '').trim();

    let rows: Doc<'courses'>[];
    if (search) {
      // Two search indexes: a code prefix ("CS 22") and a title match. Merged and
      // de-duplicated, since either can be what the student meant.
      const byCode = await ctx.db
        .query('courses')
        .withSearchIndex('search_course_codes', (q) => q.search('code', search))
        .take(30);
      const byTitle = await ctx.db
        .query('courses')
        .withSearchIndex('search_courses', (q) => q.search('title', search))
        .take(30);

      const seen = new Set<Id<'courses'>>();
      rows = [...byCode, ...byTitle].filter((c) => {
        if (seen.has(c._id)) return false;
        seen.add(c._id);
        return true;
      });
    } else {
      rows = await ctx.db.query('courses').take(60);
    }

    if (args.majorId) rows = rows.filter((c) => c.majorId === args.majorId);
    rows.sort((a, b) => a.code.localeCompare(b.code));

    return Promise.all(
      rows.slice(0, 60).map(async (course) => {
        const major = course.majorId ? await ctx.db.get(course.majorId) : null;
        return toCourseDto(course, major);
      }),
    );
  },
});

export const getByCode = query({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.token);

    const course = await ctx.db
      .query('courses')
      .withIndex('by_code', (q) => q.eq('code', args.code))
      .unique();
    if (!course) throw new Error('NOT_FOUND: No course with that code');

    const major = course.majorId ? await ctx.db.get(course.majorId) : null;
    const term = currentTerm();

    const takingThisTerm = (
      await ctx.db
        .query('userCourses')
        .withIndex('by_course_term', (q) => q.eq('courseId', course._id).eq('term', term))
        .collect()
    ).filter((row) => row.status === 'TAKING').length;

    const space = await ctx.db
      .query('spaces')
      .withIndex('by_course', (q) => q.eq('linkedCourseId', course._id))
      .first();

    const textbookListings = (
      await ctx.db
        .query('marketplaceListings')
        .withIndex('by_course_status', (q) => q.eq('courseId', course._id).eq('status', 'ACTIVE'))
        .collect()
    ).filter((l) => l.category === 'TEXTBOOK').length;

    return {
      ...toCourseDto(course, major),
      takingThisTerm,
      space: space ? { id: space._id, name: space.name } : null,
      textbookListings,
    };
  },
});

// ── Reviews ────────────────────────────────────────────────────────────────

export const reviews = query({
  args: { token: v.string(), courseId: v.id('courses') },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.token);

    const rows = await ctx.db
      .query('courseReviews')
      .withIndex('by_course', (q) => q.eq('courseId', args.courseId))
      .collect();

    return Promise.all(
      rows
        .sort((a, b) => b.helpfulCount - a.helpfulCount || b._creationTime - a._creationTime)
        .map(async (review) => {
          // Anonymous unless the author opted in.
          let author = null;
          if (review.showName) {
            const user = await ctx.db.get(review.authorId);
            if (user) {
              const major = user.majorId ? await ctx.db.get(user.majorId) : null;
              author = toPublicUser(user, major);
            }
          }
          return {
            id: review._id,
            term: review.term,
            profName: review.profName,
            difficulty: review.difficulty,
            workload: review.workload,
            rating: review.rating,
            tips: review.tips,
            wouldRecommend: review.wouldRecommend,
            helpfulCount: review.helpfulCount,
            createdAt: review._creationTime,
            author,
          };
        }),
    );
  },
});

/** Aggregates live on the course row so the Overview gauges are one read. */
async function recomputeAggregates(ctx: MutationCtx, courseId: Id<'courses'>): Promise<void> {
  const rows = await ctx.db
    .query('courseReviews')
    .withIndex('by_course', (q) => q.eq('courseId', courseId))
    .collect();

  if (!rows.length) {
    await ctx.db.patch(courseId, {
      avgDifficulty: undefined,
      avgWorkload: undefined,
      avgRating: undefined,
      reviewCount: 0,
    });
    return;
  }

  const mean = (pick: (r: Doc<'courseReviews'>) => number) =>
    rows.reduce((sum, r) => sum + pick(r), 0) / rows.length;

  await ctx.db.patch(courseId, {
    avgDifficulty: mean((r) => r.difficulty),
    avgWorkload: mean((r) => r.workload),
    avgRating: mean((r) => r.rating),
    reviewCount: rows.length,
  });
}

export const writeReview = mutation({
  args: {
    token: v.string(),
    courseId: v.id('courses'),
    term: v.string(),
    profName: v.string(),
    difficulty: v.number(),
    workload: v.number(),
    rating: v.number(),
    tips: v.string(),
    wouldRecommend: v.boolean(),
    showName: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    if (args.tips.length < 20) {
      throw new Error('BAD_REQUEST: Give future students something useful — 20 characters minimum');
    }

    // UNIQUE: one review per user per course per term.
    const existing = await ctx.db
      .query('courseReviews')
      .withIndex('by_course_author_term', (q) =>
        q.eq('courseId', args.courseId).eq('authorId', user._id).eq('term', args.term),
      )
      .unique();
    if (existing) {
      throw new Error(`CONFLICT: You already reviewed this course for ${args.term}`);
    }

    await ctx.db.insert('courseReviews', {
      courseId: args.courseId,
      authorId: user._id,
      term: args.term,
      profName: args.profName,
      difficulty: args.difficulty,
      workload: args.workload,
      rating: args.rating,
      tips: args.tips,
      wouldRecommend: args.wouldRecommend,
      showName: args.showName ?? false,
      helpfulCount: 0,
    });

    await recomputeAggregates(ctx, args.courseId);
    await grantKarma(ctx, user._id, KARMA.REVIEW_POSTED);
    await reevaluateBadges(ctx, user._id);
    return null;
  },
});

// ── Classmates ─────────────────────────────────────────────────────────────

export const classmates = query({
  args: { token: v.string(), courseId: v.id('courses') },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx, args.token);
    const term = currentTerm();

    const enrolments = await ctx.db
      .query('userCourses')
      .withIndex('by_course_term', (q) => q.eq('courseId', args.courseId).eq('term', term))
      .collect();

    const online = await onlineUserIds(ctx);

    const waved = new Set(
      (
        await ctx.db
          .query('waves')
          .withIndex('by_from_to', (q) => q.eq('fromId', viewer._id))
          .collect()
      ).map((w) => w.toId),
    );

    return (
      await Promise.all(
        enrolments
          .filter((row) => row.status === 'TAKING' && row.userId !== viewer._id)
          .slice(0, 60)
          .map(async (row) => {
            const user = await ctx.db.get(row.userId);
            if (!user || user.deletedAt || !user.settings.discoverable) return null;
            const major = user.majorId ? await ctx.db.get(user.majorId) : null;
            return {
              ...toPublicUser(user, major, online.has(user._id)),
              alreadyWaved: waved.has(user._id),
            };
          }),
      )
    ).filter((c): c is NonNullable<typeof c> => c !== null);
  },
});
