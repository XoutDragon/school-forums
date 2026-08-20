import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { onlineUserIds, requireUser } from './lib/auth';
import { currentTerm, reevaluateBadges } from './lib/karma';
import { toPublicUser } from './lib/serialize';
import { notify } from './notifications';

/** Profiles, onboarding, waves and course enrolment — ported from routes/users.ts. */

export const profile = query({
  args: { token: v.string(), username: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx, args.token);

    const user = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', args.username))
      .unique();
    if (!user || user.deletedAt) throw new Error('NOT_FOUND: No student by that name');

    const major = user.majorId ? await ctx.db.get(user.majorId) : null;
    const isSelf = user._id === viewer._id;
    const online = await onlineUserIds(ctx);

    const badgeRows = await ctx.db
      .query('userBadges')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();
    const badges = (
      await Promise.all(
        badgeRows.map(async (row) => {
          const badge = await ctx.db.get(row.badgeId);
          return badge ? { ...badge, awardedAt: row.awardedAt } : null;
        }),
      )
    ).filter((b): b is NonNullable<typeof b> => b !== null);

    const term = currentTerm();
    const enrolments = await ctx.db
      .query('userCourses')
      .withIndex('by_user_term', (q) => q.eq('userId', user._id).eq('term', term))
      .collect();

    const courses = await Promise.all(
      enrolments.map(async (row) => {
        const course = await ctx.db.get(row.courseId);
        return course
          ? {
              status: row.status,
              term: row.term,
              course: { id: course._id, code: course.code, title: course.title },
            }
          : null;
      }),
    );

    const clubRows = await ctx.db
      .query('clubMemberships')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();
    const clubs = (
      await Promise.all(
        clubRows.map(async (row) => {
          const club = await ctx.db.get(row.clubId);
          return club
            ? {
                id: club._id,
                name: club.name,
                slug: club.slug,
                category: club.category,
                role: row.role,
              }
            : null;
        }),
      )
    ).filter((c): c is NonNullable<typeof c> => c !== null);

    const spaceRows = await ctx.db
      .query('spaceMembers')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .take(12);
    const spaces = (
      await Promise.all(
        spaceRows.map(async (row) => {
          const space = await ctx.db.get(row.spaceId);
          return space
            ? { id: space._id, name: space.name, slug: space.slug, type: space.type }
            : null;
        }),
      )
    ).filter((s): s is NonNullable<typeof s> => s !== null);

    return {
      ...toPublicUser(user, major, online.has(user._id)),
      bio: user.bio ?? null,
      joinedAt: user._creationTime,
      badges: badges.map((b) => ({
        key: b.key,
        name: b.name,
        emoji: b.emoji,
        description: b.description,
        awardedAt: b.awardedAt,
      })),
      // The profile respects the student's own privacy switches (section 5.1).
      courses: isSelf || user.settings.showCourses ? courses.filter(Boolean) : [],
      clubs,
      spaces,
      canWave: !isSelf && user.settings.discoverable,
      canDm: isSelf ? false : user.settings.dmPrivacy !== 'NOBODY',
    };
  },
});

export const onboard = mutation({
  args: {
    token: v.string(),
    majorId: v.id('majors'),
    year: v.union(
      v.literal('FRESHMAN'),
      v.literal('SOPHOMORE'),
      v.literal('JUNIOR'),
      v.literal('SENIOR'),
      v.literal('GRAD'),
      v.literal('ALUM'),
    ),
    interestIds: v.array(v.id('interests')),
    courseIds: v.optional(v.array(v.id('courses'))),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    if (args.interestIds.length < 3) throw new Error('BAD_REQUEST: Pick at least 3 interests');

    await ctx.db.patch(user._id, {
      majorId: args.majorId,
      year: args.year,
      onboardedAt: Date.now(),
    });

    const existing = await ctx.db
      .query('userInterests')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
    for (const interestId of args.interestIds) {
      await ctx.db.insert('userInterests', { userId: user._id, interestId });
    }

    const term = currentTerm();
    for (const courseId of args.courseIds ?? []) {
      const already = await ctx.db
        .query('userCourses')
        .withIndex('by_user_course_term', (q) =>
          q.eq('userId', user._id).eq('courseId', courseId).eq('term', term),
        )
        .unique();
      if (!already) {
        await ctx.db.insert('userCourses', {
          userId: user._id,
          courseId,
          term,
          status: 'TAKING',
        });
      }
    }
    return null;
  },
});

/** What the wizard's last step renders: one click per suggestion (section 5.1). */
export const suggestions = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const term = currentTerm();

    const joinedSpaces = new Set(
      (
        await ctx.db
          .query('spaceMembers')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .collect()
      ).map((m) => m.spaceId),
    );

    const majorSpaceRow = user.majorId
      ? await ctx.db
          .query('spaces')
          .withIndex('by_major', (q) => q.eq('linkedMajorId', user.majorId!))
          .first()
      : null;
    const majorSpace =
      majorSpaceRow && !joinedSpaces.has(majorSpaceRow._id)
        ? {
            id: majorSpaceRow._id,
            name: majorSpaceRow.name,
            description: majorSpaceRow.description ?? null,
          }
        : null;

    const enrolments = await ctx.db
      .query('userCourses')
      .withIndex('by_user_term', (q) => q.eq('userId', user._id).eq('term', term))
      .collect();

    const courseSpaces = (
      await Promise.all(
        enrolments.map(async (row) =>
          ctx.db
            .query('spaces')
            .withIndex('by_course', (q) => q.eq('linkedCourseId', row.courseId))
            .first(),
        ),
      )
    )
      .filter((s): s is NonNullable<typeof s> => s !== null && !joinedSpaces.has(s._id))
      .slice(0, 6)
      .map((s) => ({ id: s._id, name: s.name }));

    const interestRows = await ctx.db
      .query('userInterests')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();
    const interestNames = (await Promise.all(interestRows.map((row) => ctx.db.get(row.interestId))))
      .filter((i): i is NonNullable<typeof i> => i !== null)
      .map((i) => i.name.toLowerCase());

    const joinedClubs = new Set(
      (
        await ctx.db
          .query('clubMemberships')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .collect()
      ).map((m) => m.clubId),
    );

    const clubs = (await ctx.db.query('clubs').take(60))
      .filter((club) => !joinedClubs.has(club._id))
      .map((club) => {
        const overlap = club.tags
          .map((t) => t.toLowerCase())
          .filter((tag) => interestNames.some((i) => i.includes(tag) || tag.includes(i)));
        return { club, overlap };
      })
      .filter((entry) => entry.overlap.length > 0)
      .sort((a, b) => b.overlap.length - a.overlap.length)
      .slice(0, 3);

    return {
      majorSpace,
      courseSpaces,
      clubs: await Promise.all(
        clubs.map(async ({ club, overlap }) => ({
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
          // Never show a suggestion without its reason — same rule as buddy matching.
          reason: `Matches your interest in ${overlap.slice(0, 2).join(' and ')}`,
        })),
      ),
    };
  },
});

/** A wave is deliberately smaller than a DM. One per pair, ever (section 5.3). */
export const wave = mutation({
  args: { token: v.string(), toId: v.id('users'), context: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    if (user._id === args.toId) throw new Error("BAD_REQUEST: You can't wave at yourself");

    const target = await ctx.db.get(args.toId);
    if (!target || target.deletedAt) throw new Error('NOT_FOUND: No student there');
    if (!target.settings.discoverable) {
      throw new Error("FORBIDDEN: That student isn't discoverable right now");
    }

    const existing = await ctx.db
      .query('waves')
      .withIndex('by_from_to', (q) => q.eq('fromId', user._id).eq('toId', args.toId))
      .unique();
    if (!existing) {
      await ctx.db.insert('waves', {
        fromId: user._id,
        toId: args.toId,
        context: args.context,
      });
    }

    const mutual = await ctx.db
      .query('waves')
      .withIndex('by_from_to', (q) => q.eq('fromId', args.toId).eq('toId', user._id))
      .unique();

    if (mutual) {
      // Both sides reached out, so a DM is now a suggestion rather than a cold
      // approach — the whole point of the wave.
      await notify(ctx, args.toId, 'WAVE_MUTUAL', {
        userId: user._id,
        name: user.displayName,
        username: user.username,
      });
      await notify(ctx, user._id, 'WAVE_MUTUAL', {
        userId: args.toId,
        name: target.displayName,
        username: target.username,
      });
    } else {
      await notify(ctx, args.toId, 'WAVE', {
        userId: user._id,
        name: user.displayName,
        username: user.username,
        context: args.context ?? null,
      });
    }

    return { mutual: Boolean(mutual) };
  },
});

export const enrol = mutation({
  args: {
    token: v.string(),
    courseId: v.id('courses'),
    term: v.optional(v.string()),
    status: v.optional(v.union(v.literal('TAKING'), v.literal('COMPLETED'), v.literal('PLANNED'))),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const term = args.term ?? currentTerm();
    const status = args.status ?? 'TAKING';

    const existing = await ctx.db
      .query('userCourses')
      .withIndex('by_user_course_term', (q) =>
        q.eq('userId', user._id).eq('courseId', args.courseId).eq('term', term),
      )
      .unique();

    if (existing) await ctx.db.patch(existing._id, { status });
    else
      await ctx.db.insert('userCourses', {
        userId: user._id,
        courseId: args.courseId,
        term,
        status,
      });

    await reevaluateBadges(ctx, user._id);
    return null;
  },
});

export const unenrol = mutation({
  args: { token: v.string(), enrolmentId: v.id('userCourses') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const row = await ctx.db.get(args.enrolmentId);
    if (row && row.userId === user._id) await ctx.db.delete(row._id);
    return null;
  },
});
