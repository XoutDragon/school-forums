import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireUser } from './lib/auth';
import { currentTerm } from './lib/karma';
import { toPublicUser } from './lib/serialize';

/**
 * The home feed — ported from routes/home.ts.
 *
 * Returns seven dated buckets, always seven, even when empty. The client renders a
 * week, so the server hands it one rather than making it reason about gaps.
 */

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday-first: a campus week starts when classes do, not on Sunday. */
function startOfWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7;
  const start = startOfDay(d);
  start.setDate(start.getDate() - day);
  return start;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export const feed = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const term = currentTerm();

    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart.getTime() + 7 * 864e5);

    const clubIds = new Set(
      (
        await ctx.db
          .query('clubMemberships')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .collect()
      ).map((m) => m.clubId as string),
    );

    const spaceIds = new Set(
      (
        await ctx.db
          .query('spaceMembers')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .collect()
      ).map((m) => m.spaceId as string),
    );

    const majorSpace = user.majorId
      ? await ctx.db
          .query('spaces')
          .withIndex('by_major', (q) => q.eq('linkedMajorId', user.majorId!))
          .first()
      : null;
    if (majorSpace) spaceIds.add(majorSpace._id);

    // ── This week's events ────────────────────────────────────────────────
    const allEvents = await ctx.db
      .query('events')
      .withIndex('by_start', (q) =>
        q.gte('startsAt', weekStart.getTime()).lt('startsAt', weekEnd.getTime()),
      )
      .collect();

    const events = allEvents.filter(
      (e) =>
        e.hostType === 'CAMPUS' ||
        (e.hostType === 'CLUB' && clubIds.has(e.hostId)) ||
        (e.hostType === 'SPACE' && spaceIds.has(e.hostId)),
    );

    const week = await Promise.all(
      Array.from({ length: 7 }, async (_, i) => {
        const date = new Date(weekStart.getTime() + i * 864e5);
        const dayEvents = events.filter((e) => sameDay(new Date(e.startsAt), date));

        return {
          date: date.getTime(),
          weekday: date.toLocaleDateString('en-CA', { weekday: 'short' }),
          dayOfMonth: date.getDate(),
          isToday: sameDay(date, now),
          isPast: date < startOfDay(now),
          events: await Promise.all(
            dayEvents.map(async (event) => {
              const rsvps = await ctx.db
                .query('eventRsvps')
                .withIndex('by_event', (q) => q.eq('eventId', event._id))
                .collect();
              return {
                id: event._id,
                title: event.title,
                startsAt: event.startsAt,
                location: event.location,
                tags: event.tags,
                goingCount: rsvps.filter((r) => r.status === 'GOING').length,
                myRsvp: rsvps.find((r) => r.userId === user._id)?.status ?? null,
              };
            }),
          ),
        };
      }),
    );

    // ── Announcements from spaces you're in ───────────────────────────────
    const announcements: {
      id: string;
      excerpt: string;
      createdAt: number;
      author: ReturnType<typeof toPublicUser> | null;
      channel: { id: string; name: string };
      space: { id: string; name: string };
    }[] = [];

    const fortnightAgo = Date.now() - 14 * 864e5;

    for (const spaceId of [...spaceIds].slice(0, 20)) {
      const channels = await ctx.db
        .query('channels')
        .withIndex('by_space_type', (q) =>
          q.eq('spaceId', spaceId as never).eq('type', 'ANNOUNCEMENT'),
        )
        .collect();

      for (const channel of channels) {
        const messages = await ctx.db
          .query('messages')
          .withIndex('by_channel', (q) => q.eq('channelId', channel._id))
          .order('desc')
          .take(5);

        const space = await ctx.db.get(channel.spaceId);

        for (const message of messages) {
          if (message.deletedAt || message._creationTime < fortnightAgo) continue;
          const author = message.authorId ? await ctx.db.get(message.authorId) : null;
          const major = author?.majorId ? await ctx.db.get(author.majorId) : null;

          announcements.push({
            id: message._id,
            excerpt: message.content.slice(0, 220),
            createdAt: message._creationTime,
            author: message.isAnonymous || !author ? null : toPublicUser(author, major),
            channel: { id: channel._id, name: channel.name },
            space: { id: channel.spaceId, name: space?.name ?? 'A space' },
          });
        }
      }
      if (announcements.length >= 5) break;
    }

    announcements.sort((a, b) => b.createdAt - a.createdAt);

    // ── Trending resources in your courses ────────────────────────────────
    const enrolments = await ctx.db
      .query('userCourses')
      .withIndex('by_user_term', (q) => q.eq('userId', user._id).eq('term', term))
      .collect();

    const courses = (await Promise.all(enrolments.map((row) => ctx.db.get(row.courseId)))).filter(
      (c): c is NonNullable<typeof c> => c !== null,
    );

    const resources = (
      await Promise.all(
        courses.map((course) =>
          ctx.db
            .query('resources')
            .withIndex('by_course_score', (q) => q.eq('courseId', course._id))
            .order('desc')
            .take(2),
        ),
      )
    )
      .flat()
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    // ── One club worth a look ─────────────────────────────────────────────
    const joinedClubs = new Set(
      (
        await ctx.db
          .query('clubMemberships')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .collect()
      ).map((m) => m.clubId as string),
    );

    const candidates = (
      await ctx.db
        .query('clubs')
        .withIndex('by_recruiting', (q) => q.eq('isRecruiting', true))
        .take(30)
    ).filter((c) => !joinedClubs.has(c._id));

    const suggestedClub = candidates[0]
      ? {
          id: candidates[0]._id,
          name: candidates[0].name,
          slug: candidates[0].slug,
          description: candidates[0].description,
          category: candidates[0].category,
          logoUrl: candidates[0].logoUrl ?? null,
          memberCount: (
            await ctx.db
              .query('clubMemberships')
              .withIndex('by_club', (q) => q.eq('clubId', candidates[0]!._id))
              .collect()
          ).length,
        }
      : null;

    return {
      displayName: user.displayName,
      karma: user.karma,
      term,
      weekStart: weekStart.getTime(),
      week,
      eventCount: events.length,
      courses: courses.map((c) => ({ id: c._id, code: c.code, title: c.title })),
      announcements: announcements.slice(0, 5),
      resources: await Promise.all(
        resources.map(async (r) => {
          const course = r.courseId ? await ctx.db.get(r.courseId) : null;
          return {
            id: r._id,
            title: r.title,
            type: r.type,
            score: r.score,
            term: r.term ?? null,
            course: course ? { id: course._id, code: course.code } : null,
          };
        }),
      ),
      suggestedClub,
    };
  },
});
