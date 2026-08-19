import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { BuddyMatchDto } from '@campusconnect/shared';
import { api } from '@/lib/api';
import { cn, relativeTime } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import { Avatar, Badge, Button, Card, Code, EmptyState, Skeleton } from '@/components/ui';
import { IconChevron, IconSparkle } from '@/components/Icons';

interface WeekEvent {
  id: string;
  title: string;
  startsAt: string;
  location: string;
  tags: string[];
  goingCount: number;
  myRsvp: string | null;
}

interface Feed {
  displayName: string;
  karma: number;
  term: string;
  weekStart: string;
  week: {
    date: string;
    weekday: string;
    dayOfMonth: number;
    isToday: boolean;
    isPast: boolean;
    events: WeekEvent[];
  }[];
  eventCount: number;
  courses: { id: string; code: string; title: string }[];
  announcements: {
    id: string;
    excerpt: string;
    createdAt: string;
    author: { displayName: string; avatarUrl: string | null; id: string } | null;
    channel: { id: string; name: string };
    space: { id: string; name: string };
  }[];
  resources: {
    id: string;
    title: string;
    type: string;
    score: number;
    term: string | null;
    course: { id: string; code: string } | null;
  }[];
  suggestedClub: {
    id: string;
    name: string;
    slug: string;
    description: string;
    category: string;
    memberCount: number;
  } | null;
}

export function HomePage() {
  const user = useAuth((s) => s.user);

  const { data, isLoading } = useQuery({
    queryKey: ['home-feed'],
    queryFn: () => api.get<Feed>('/home/feed'),
  });

  const { data: matches } = useQuery({
    queryKey: ['buddy-matches'],
    queryFn: () => api.get<BuddyMatchDto[]>('/study/buddy/matches'),
  });

  if (isLoading || !data) return <HomeSkeleton />;

  const firstName = data.displayName.split(' ')[0];

  return (
    <div className="space-y-9">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-display-lg text-chalk">
            {greeting()}, {firstName}.
          </h1>
          <span className="code-chip">{data.term}</span>
        </div>
        <p className="mt-2 text-[0.9375rem] text-dim">
          {data.eventCount === 0
            ? 'Nothing scheduled this week. A good week to start something.'
            : `${data.eventCount} ${data.eventCount === 1 ? 'thing' : 'things'} on this week across your clubs and major.`}
        </p>
      </header>

      {/* ── The week. A student's unit of time is the week, so that's the hero:
             seven real days, not a summary statistic. ───────────────────────── */}
      <section aria-labelledby="week-heading">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="week-heading" className="eyebrow">
            Your week
          </h2>
          <Link
            to="/calendar"
            className="flex items-center gap-1 text-xs font-medium text-dim transition hover:text-chalk"
          >
            Full calendar <IconChevron className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
          {data.week.map((day) => (
            <div
              key={day.date}
              className={cn(
                'day-col',
                day.isToday && 'day-col-today',
                day.isPast && !day.isToday && 'day-col-past',
              )}
            >
              <div className="flex items-baseline justify-between pl-1">
                <span
                  className={cn(
                    'font-mono text-[0.625rem] uppercase tracking-wider',
                    day.isToday ? 'text-accent-lift' : 'text-faint',
                  )}
                >
                  {day.weekday}
                </span>
                <span
                  className={cn(
                    'font-display text-lg leading-none',
                    day.isToday ? 'text-chalk' : 'text-dim',
                  )}
                >
                  {day.dayOfMonth}
                </span>
              </div>

              {day.events.length === 0 ? (
                <span className="mt-auto pl-1 font-mono text-[0.625rem] text-faint/60">—</span>
              ) : (
                day.events.map((event) => (
                  <Link
                    key={event.id}
                    to={`/events/${event.id}`}
                    className="group rounded-md border border-edge/60 bg-raised/70 px-2 py-1.5 transition hover:border-events/50 hover:bg-events/[0.07]"
                  >
                    <span className="block font-mono text-[0.625rem] text-events">
                      {new Date(event.startsAt).toLocaleTimeString('en-CA', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="mt-0.5 block text-xs font-medium leading-snug text-chalk line-clamp-2">
                      {event.title}
                    </span>
                    {event.myRsvp === 'GOING' && (
                      <span className="mt-1 block font-mono text-[0.5625rem] uppercase tracking-wide text-courses">
                        Going
                      </span>
                    )}
                  </Link>
                ))
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Two columns below the fold. ─────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <section aria-labelledby="announcements-heading">
            <h2 id="announcements-heading" className="eyebrow mb-3">
              New in your spaces
            </h2>
            {data.announcements.length === 0 ? (
              <EmptyState
                title="Quiet in here"
                body="Announcements from your clubs and major spaces land here. Join a couple and this fills up."
                action={
                  <Link to="/explore">
                    <Button size="sm">Find spaces</Button>
                  </Link>
                }
              />
            ) : (
              <div className="space-y-2">
                {data.announcements.map((a) => (
                  <Link
                    key={a.id}
                    to={`/spaces/${a.space.id}/${a.channel.id}`}
                    className="block rounded-xl border border-edge bg-panel p-4 transition hover:border-faint/50"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="font-mono text-[0.625rem] uppercase tracking-wider text-accent-lift">
                        {a.space.name}
                      </span>
                      <span className="font-mono text-[0.625rem] text-faint">
                        #{a.channel.name}
                      </span>
                      <span className="ml-auto font-mono text-[0.625rem] text-faint">
                        {relativeTime(a.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-chalk line-clamp-3">{a.excerpt}</p>
                    {a.author && (
                      <div className="mt-2.5 flex items-center gap-1.5">
                        <Avatar
                          name={a.author.displayName}
                          src={a.author.avatarUrl}
                          seed={a.author.id}
                          size={18}
                        />
                        <span className="text-xs text-dim">{a.author.displayName}</span>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="resources-heading">
            <h2 id="resources-heading" className="eyebrow mb-3">
              Trending in your courses
            </h2>
            {data.resources.length === 0 ? (
              <EmptyState
                title="No notes yet for your courses"
                body="Be the one who uploads first — resources here outlive the term, and downloads earn you karma."
                action={
                  <Link to="/courses">
                    <Button size="sm">Browse courses</Button>
                  </Link>
                }
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {data.resources.map((r) => (
                  <Link
                    key={r.id}
                    to={
                      r.course
                        ? `/courses/${encodeURIComponent(r.course.code)}?tab=resources`
                        : '/courses'
                    }
                    className="rounded-xl border border-edge bg-panel p-3.5 transition hover:border-courses/40"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      {r.course && <Code>{r.course.code}</Code>}
                      {r.term && (
                        <span className="font-mono text-[0.625rem] text-faint">{r.term}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium leading-snug text-chalk line-clamp-2">
                      {r.title}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge tone="courses">{r.type.replace('_', ' ').toLowerCase()}</Badge>
                      <span className="font-mono text-[0.625rem] text-faint">+{r.score}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="buddies-heading">
            <h2 id="buddies-heading" className="eyebrow mb-3">
              People you'd get on with
            </h2>
            {!matches?.length ? (
              <Card className="text-center">
                <IconSparkle className="mx-auto h-5 w-5 text-faint" />
                <p className="mt-2.5 text-sm text-dim">
                  Set your weekly availability and we'll find people whose schedule actually
                  overlaps yours.
                </p>
                <Link to="/study">
                  <Button size="sm" variant="secondary" className="mt-3">
                    Set availability
                  </Button>
                </Link>
              </Card>
            ) : (
              <div className="space-y-2">
                {matches.slice(0, 3).map((match) => (
                  <Card key={match.id} className="p-3.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        name={match.user.displayName}
                        src={match.user.avatarUrl}
                        seed={match.user.id}
                        size={34}
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/u/${match.user.username}`}
                          className="block truncate text-sm font-medium text-chalk hover:underline"
                        >
                          {match.user.displayName}
                        </Link>
                        {match.user.major && (
                          <span className="block truncate text-xs text-dim">
                            {match.user.major.name}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* §5.6 makes the explanation mandatory — a match without a reason is
                        just a stranger's face. */}
                    <p className="mt-2.5 text-xs leading-relaxed text-dim">{match.explanation}</p>
                  </Card>
                ))}
                <Link
                  to="/study"
                  className="block pt-0.5 text-xs font-medium text-accent-lift hover:underline"
                >
                  See all matches
                </Link>
              </div>
            )}
          </section>

          {data.suggestedClub && (
            <section aria-labelledby="club-heading">
              <h2 id="club-heading" className="eyebrow mb-3">
                One club worth a look
              </h2>
              <Card className="border-clubs/25">
                <Badge tone="clubs">{data.suggestedClub.category.toLowerCase()}</Badge>
                <h3 className="mt-2.5 font-display text-[1.0625rem] font-semibold tracking-tight text-chalk">
                  {data.suggestedClub.name}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-dim line-clamp-3">
                  {data.suggestedClub.description}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-mono text-[0.625rem] text-faint">
                    {data.suggestedClub.memberCount} members
                  </span>
                  <Link to={`/clubs/${data.suggestedClub.slug}`}>
                    <Button size="sm" variant="secondary">
                      Have a look
                    </Button>
                  </Link>
                </div>
              </Card>
            </section>
          )}

          {data.courses.length > 0 && (
            <section aria-labelledby="courses-heading">
              <h2 id="courses-heading" className="eyebrow mb-3">
                Your courses
              </h2>
              <div className="space-y-1.5">
                {data.courses.map((course) => (
                  <Link
                    key={course.id}
                    to={`/courses/${encodeURIComponent(course.code)}`}
                    className="flex items-center gap-2.5 rounded-lg border border-edge bg-panel px-3 py-2.5 transition hover:border-courses/40"
                  >
                    <Code className="shrink-0">{course.code}</Code>
                    <span className="min-w-0 flex-1 truncate text-xs text-dim">{course.title}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <Card className="flex items-center gap-3">
            <span className="font-display text-display-md text-accent-lift">
              {user?.karma ?? 0}
            </span>
            <div>
              <p className="text-sm font-medium text-chalk">karma</p>
              <p className="text-xs text-dim">
                From notes people downloaded and answers that got accepted.
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

function HomeSkeleton() {
  return (
    <div className="space-y-9">
      <div className="space-y-2">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-[7.5rem]" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}
