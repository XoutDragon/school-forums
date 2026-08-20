import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireUser } from './lib/auth';

/**
 * Global search behind the Ctrl-K palette — ported from services/search.service.ts.
 *
 * FTS5 virtual tables and their sync triggers are gone. Convex search indexes are
 * declared on the table in schema.ts and stay current automatically, so the
 * rebuild script (prisma/fts.ts) has no equivalent here and is not needed.
 */

export interface SearchHit {
  kind: 'course' | 'club' | 'person' | 'space' | 'resource' | 'event';
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  badge: string | null;
}

export const search = query({
  args: {
    token: v.string(),
    q: v.string(),
    scope: v.optional(
      v.union(
        v.literal('all'),
        v.literal('courses'),
        v.literal('clubs'),
        v.literal('people'),
        v.literal('spaces'),
        v.literal('resources'),
        v.literal('events'),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.token);

    const term = args.q.trim();
    if (!term) return {};

    const scope = args.scope ?? 'all';
    const limit = args.limit ?? 10;
    const perScope = scope === 'all' ? Math.max(3, Math.floor(limit / 2)) : limit;

    const wants = (kind: string) => scope === 'all' || scope === kind;
    const result: Record<string, SearchHit[]> = {};

    if (wants('courses')) {
      const byCode = await ctx.db
        .query('courses')
        .withSearchIndex('search_course_codes', (q) => q.search('code', term))
        .take(perScope);
      const byTitle = await ctx.db
        .query('courses')
        .withSearchIndex('search_courses', (q) => q.search('title', term))
        .take(perScope);

      const seen = new Set<string>();
      result.courses = await Promise.all(
        [...byCode, ...byTitle]
          .filter((c) => {
            if (seen.has(c._id)) return false;
            seen.add(c._id);
            return true;
          })
          .slice(0, perScope)
          .map(async (course) => {
            const major = course.majorId ? await ctx.db.get(course.majorId) : null;
            return {
              kind: 'course' as const,
              id: course._id,
              title: course.code,
              subtitle: course.title,
              href: `/courses/${encodeURIComponent(course.code)}`,
              badge: major?.name ?? null,
            };
          }),
      );
    }

    if (wants('clubs')) {
      const clubs = await ctx.db
        .query('clubs')
        .withSearchIndex('search_clubs', (q) => q.search('name', term))
        .take(perScope);

      result.clubs = clubs.map((club) => ({
        kind: 'club' as const,
        id: club._id,
        title: club.name,
        subtitle: club.description.slice(0, 80),
        href: `/clubs/${club.slug}`,
        badge: club.isRecruiting ? 'Recruiting' : null,
      }));
    }

    if (wants('people')) {
      const people = await ctx.db
        .query('users')
        .withSearchIndex('search_people', (q) =>
          q.search('displayName', term).eq('deletedAt', undefined),
        )
        .take(perScope);

      result.people = await Promise.all(
        people.map(async (person) => {
          const major = person.majorId ? await ctx.db.get(person.majorId) : null;
          return {
            kind: 'person' as const,
            id: person._id,
            title: person.displayName,
            subtitle: `@${person.username}`,
            href: `/u/${person.username}`,
            badge: major?.name ?? null,
          };
        }),
      );
    }

    if (wants('spaces')) {
      const spaces = await ctx.db
        .query('spaces')
        .withSearchIndex('search_spaces', (q) => q.search('name', term).eq('visibility', 'PUBLIC'))
        .take(perScope);

      result.spaces = spaces.map((space) => ({
        kind: 'space' as const,
        id: space._id,
        title: space.name,
        subtitle: space.description?.slice(0, 80) ?? null,
        href: `/spaces/${space._id}`,
        badge: space.type,
      }));
    }

    if (wants('resources')) {
      const resources = await ctx.db
        .query('resources')
        .withSearchIndex('search_resources', (q) => q.search('title', term))
        .take(perScope);

      result.resources = await Promise.all(
        resources.map(async (resource) => {
          const course = resource.courseId ? await ctx.db.get(resource.courseId) : null;
          return {
            kind: 'resource' as const,
            id: resource._id,
            title: resource.title,
            subtitle: course ? `${course.code} · ${resource.type}` : resource.type,
            href: course ? `/courses/${encodeURIComponent(course.code)}?tab=resources` : '/explore',
            badge: resource.term ?? null,
          };
        }),
      );
    }

    if (wants('events')) {
      const now = Date.now();
      const events = (
        await ctx.db
          .query('events')
          .withSearchIndex('search_events', (q) => q.search('title', term))
          .take(perScope * 2)
      )
        .filter((e) => e.startsAt >= now)
        .slice(0, perScope);

      result.events = events.map((event) => ({
        kind: 'event' as const,
        id: event._id,
        title: event.title,
        subtitle: event.location,
        href: `/events/${event._id}`,
        badge: new Date(event.startsAt).toLocaleDateString('en-CA', {
          month: 'short',
          day: 'numeric',
        }),
      }));
    }

    return result;
  },
});
