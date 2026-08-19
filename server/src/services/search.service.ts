import type { SearchQuery } from '@campusconnect/shared';
import { prisma } from '../lib/prisma.js';

/** FTS5 lives in a hand-written migration (Prisma can't express virtual tables), so this
 *  module talks to it with $queryRaw. If the virtual tables are missing — someone ran
 *  `db push` instead of `migrate` — every query falls back to LIKE rather than 500ing. */

export interface SearchHit {
  kind: 'course' | 'club' | 'person' | 'space' | 'resource' | 'event';
  id: string;
  title: string;
  subtitle: string | null;
  /** Route the ⌘K palette navigates to on Enter. */
  href: string;
  badge: string | null;
}

let ftsAvailable: boolean | null = null;

async function hasFts(): Promise<boolean> {
  if (ftsAvailable !== null) return ftsAvailable;
  try {
    const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='course_fts'`,
    );
    ftsAvailable = rows.length > 0;
  } catch {
    ftsAvailable = false;
  }
  return ftsAvailable;
}

/** FTS5 treats most punctuation as syntax. Quote each token and add a prefix wildcard so
 *  "CS 22" finds "CS 2210" while a stray quote can't break the MATCH expression. */
function toMatchQuery(raw: string): string {
  const tokens = raw
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
  if (!tokens.length) return '""';
  return tokens.map((t) => `"${t}"*`).join(' ');
}

async function ftsIds(table: string, q: string, limit: number): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM ${table} WHERE ${table} MATCH ? ORDER BY rank LIMIT ?`,
    toMatchQuery(q),
    limit,
  );
  return rows.map((r) => r.id);
}

async function searchCourses(q: string, limit: number): Promise<SearchHit[]> {
  const ids = (await hasFts()) ? await ftsIds('course_fts', q, limit) : [];
  const courses = ids.length
    ? await prisma.course.findMany({ where: { id: { in: ids } }, select: courseSel })
    : await prisma.course.findMany({
        where: { OR: [{ code: { contains: q } }, { title: { contains: q } }] },
        take: limit,
        select: courseSel,
      });

  return courses.map((c) => ({
    kind: 'course' as const,
    id: c.id,
    title: c.code,
    subtitle: c.title,
    href: `/courses/${encodeURIComponent(c.code)}`,
    badge: c.major?.name ?? null,
  }));
}
const courseSel = { id: true, code: true, title: true, major: { select: { name: true } } } as const;

async function searchClubs(q: string, limit: number): Promise<SearchHit[]> {
  const ids = (await hasFts()) ? await ftsIds('club_fts', q, limit) : [];
  const clubs = ids.length
    ? await prisma.club.findMany({ where: { id: { in: ids } }, select: clubSel })
    : await prisma.club.findMany({
        where: { OR: [{ name: { contains: q } }, { description: { contains: q } }] },
        take: limit,
        select: clubSel,
      });

  return clubs.map((c) => ({
    kind: 'club' as const,
    id: c.id,
    title: c.name,
    subtitle: c.description.slice(0, 80),
    href: `/clubs/${c.slug}`,
    badge: c.isRecruiting ? 'Recruiting' : null,
  }));
}
const clubSel = {
  id: true,
  name: true,
  slug: true,
  description: true,
  isRecruiting: true,
} as const;

async function searchPeople(q: string, limit: number): Promise<SearchHit[]> {
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      OR: [{ username: { contains: q } }, { displayName: { contains: q } }],
    },
    take: limit,
    select: { id: true, username: true, displayName: true, major: { select: { name: true } } },
  });
  return users.map((u) => ({
    kind: 'person' as const,
    id: u.id,
    title: u.displayName,
    subtitle: `@${u.username}`,
    href: `/u/${u.username}`,
    badge: u.major?.name ?? null,
  }));
}

async function searchSpaces(q: string, limit: number): Promise<SearchHit[]> {
  const spaces = await prisma.space.findMany({
    where: { visibility: 'PUBLIC', name: { contains: q } },
    take: limit,
    select: { id: true, name: true, description: true, type: true },
  });
  return spaces.map((s) => ({
    kind: 'space' as const,
    id: s.id,
    title: s.name,
    subtitle: s.description?.slice(0, 80) ?? null,
    href: `/spaces/${s.id}`,
    badge: s.type,
  }));
}

async function searchResources(q: string, limit: number): Promise<SearchHit[]> {
  const ids = (await hasFts()) ? await ftsIds('resource_fts', q, limit) : [];
  const resources = ids.length
    ? await prisma.resource.findMany({ where: { id: { in: ids } }, select: resourceSel })
    : await prisma.resource.findMany({
        where: { OR: [{ title: { contains: q } }, { description: { contains: q } }] },
        take: limit,
        select: resourceSel,
      });

  return resources.map((r) => ({
    kind: 'resource' as const,
    id: r.id,
    title: r.title,
    subtitle: r.course ? `${r.course.code} · ${r.type}` : r.type,
    href: r.course ? `/courses/${encodeURIComponent(r.course.code)}?tab=resources` : '/explore',
    badge: r.term ?? null,
  }));
}
const resourceSel = {
  id: true,
  title: true,
  description: true,
  type: true,
  term: true,
  course: { select: { code: true } },
} as const;

async function searchEvents(q: string, limit: number): Promise<SearchHit[]> {
  const events = await prisma.event.findMany({
    where: { title: { contains: q }, startsAt: { gte: new Date() } },
    orderBy: { startsAt: 'asc' },
    take: limit,
    select: { id: true, title: true, location: true, startsAt: true },
  });
  return events.map((e) => ({
    kind: 'event' as const,
    id: e.id,
    title: e.title,
    subtitle: e.location,
    href: `/events/${e.id}`,
    badge: e.startsAt.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
  }));
}

export async function search({
  q,
  scope,
  limit,
}: SearchQuery): Promise<Record<string, SearchHit[]>> {
  const runners: Record<string, () => Promise<SearchHit[]>> = {
    courses: () => searchCourses(q, limit),
    clubs: () => searchClubs(q, limit),
    people: () => searchPeople(q, limit),
    spaces: () => searchSpaces(q, limit),
    resources: () => searchResources(q, limit),
    events: () => searchEvents(q, limit),
  };

  if (scope !== 'all') {
    return { [scope]: await runners[scope]!() };
  }

  const perScope = Math.max(3, Math.floor(limit / 2));
  const entries = await Promise.all(
    Object.entries(runners).map(async ([key, run]) => {
      const hits = await run().catch(() => [] as SearchHit[]);
      return [key, hits.slice(0, perScope)] as const;
    }),
  );
  return Object.fromEntries(entries);
}
