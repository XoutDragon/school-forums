import { v } from 'convex/values';
import { query } from './_generated/server';
import { onlineUserIds, requireUser } from './lib/auth';
import { toPublicUser } from './lib/serialize';

/** Majors, interests and the word filter — ported from routes/misc.ts. */

export const majors = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('majors').collect();

    return Promise.all(
      rows
        .sort((a, b) => a.faculty.localeCompare(b.faculty) || a.name.localeCompare(b.name))
        .map(async (major) => ({
          id: major._id,
          name: major.name,
          faculty: major.faculty,
          description: major.description,
          studentCount: (
            await ctx.db
              .query('users')
              .withIndex('by_major', (q) => q.eq('majorId', major._id))
              .collect()
          ).filter((u) => !u.deletedAt).length,
          courseCount: (
            await ctx.db
              .query('courses')
              .withIndex('by_major', (q) => q.eq('majorId', major._id))
              .collect()
          ).length,
        })),
    );
  },
});

export const major = query({
  args: { token: v.string(), majorId: v.id('majors') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const row = await ctx.db.get(args.majorId);
    if (!row) throw new Error('NOT_FOUND: No major there');

    const students = (
      await ctx.db
        .query('users')
        .withIndex('by_major', (q) => q.eq('majorId', args.majorId))
        .collect()
    ).filter((u) => !u.deletedAt);

    const byYear = new Map<string, number>();
    for (const student of students) {
      if (student.year) byYear.set(student.year, (byYear.get(student.year) ?? 0) + 1);
    }

    const online = await onlineUserIds(ctx);

    // "People in your year", discoverable only (section 5.3).
    const peers = students
      .filter((s) => s._id !== user._id && s.year === user.year && s.settings.discoverable)
      .slice(0, 18)
      .map((s) => toPublicUser(s, row, online.has(s._id)));

    const space = await ctx.db
      .query('spaces')
      .withIndex('by_major', (q) => q.eq('linkedMajorId', args.majorId))
      .first();

    const courses = await ctx.db
      .query('courses')
      .withIndex('by_major', (q) => q.eq('majorId', args.majorId))
      .collect();
    const courseIds = new Set(courses.map((c) => c._id));

    const topResources = (await ctx.db.query('resources').collect())
      .filter((r) => r.courseId && courseIds.has(r.courseId))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const now = Date.now();
    const events = (
      await ctx.db
        .query('events')
        .withIndex('by_start', (q) => q.gte('startsAt', now))
        .take(40)
    )
      .filter((e) => e.tags.includes(row.name))
      .slice(0, 5);

    return {
      id: row._id,
      name: row.name,
      faculty: row.faculty,
      description: row.description,
      space: space ? { id: space._id, name: space.name, slug: space.slug } : null,
      byYear: [...byYear.entries()].map(([year, count]) => ({ year, count })),
      peers,
      events: events.map((e) => ({
        id: e._id,
        title: e.title,
        startsAt: e.startsAt,
        location: e.location,
      })),
      topResources: await Promise.all(
        topResources.map(async (r) => {
          const course = r.courseId ? await ctx.db.get(r.courseId) : null;
          return {
            id: r._id,
            title: r.title,
            type: r.type,
            score: r.score,
            term: r.term ?? null,
            course: course ? { code: course.code } : null,
          };
        }),
      ),
    };
  },
});

export const interests = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('interests').collect();
    return rows
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
      .map((i) => ({ id: i._id, name: i.name, category: i.category }));
  },
});

/**
 * Soft word filter (section 5.10). The Express build read this from a JSON file on disk;
 * Convex has no filesystem, so the list is inlined. `blocked` stays empty on
 * purpose — shipping a slur list in the repo is worse than leaving it configurable.
 */
const SOFT_FILTER_WORDS = ['idiot', 'stupid', 'shut up', 'moron', 'trash', 'pathetic'];

export const filterWords = query({
  args: {},
  handler: async () => ({ words: SOFT_FILTER_WORDS }),
});
