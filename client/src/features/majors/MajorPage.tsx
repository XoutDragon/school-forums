import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicUser } from '@campusconnect/shared';
import { api } from '@/lib/api';
import { YEAR_LABELS } from '@/lib/utils';
import { Avatar, Button, Card, Code, EmptyState, Eyebrow, Skeleton } from '@/components/ui';
import { IconWave } from '@/components/Icons';

interface MajorDetail {
  id: string;
  name: string;
  faculty: string;
  description: string;
  space: { id: string; name: string; slug: string } | null;
  byYear: { year: string | null; count: number }[];
  peers: PublicUser[];
  events: { id: string; title: string; startsAt: string; location: string }[];
  topResources: {
    id: string;
    title: string;
    type: string;
    score: number;
    term: string | null;
    course: { code: string } | null;
  }[];
}

const YEAR_ORDER = ['FRESHMAN', 'SOPHOMORE', 'JUNIOR', 'SENIOR', 'GRAD', 'ALUM'];

export function MajorPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const { data: major, isLoading } = useQuery({
    queryKey: ['major', id],
    queryFn: () => api.get<MajorDetail>(`/catalog/majors/${id}`),
    enabled: Boolean(id),
  });

  if (isLoading || !major) return <Skeleton className="h-96 w-full" />;

  const total = major.byYear.reduce((sum, y) => sum + y.count, 0);
  const ordered = [...major.byYear]
    .filter((y) => y.year)
    .sort((a, b) => YEAR_ORDER.indexOf(a.year!) - YEAR_ORDER.indexOf(b.year!));
  const peak = Math.max(1, ...ordered.map((y) => y.count));

  const wave = async (userId: string) => {
    await api.post(`/users/${userId}/wave`, { context: major.name });
    void queryClient.invalidateQueries({ queryKey: ['major', id] });
  };

  return (
    <div className="space-y-7">
      <header>
        <Eyebrow>{major.faculty}</Eyebrow>
        <h1 className="mt-2 font-display text-display-lg text-chalk">{major.name}</h1>
        <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-dim">
          {major.description}
        </p>
        {major.space && (
          <Link to={`/spaces/${major.space.id}`} className="mt-4 inline-block">
            <Button>Open the {major.name} space</Button>
          </Link>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <Eyebrow>{total} students by year</Eyebrow>
          <div className="mt-4 space-y-2.5">
            {ordered.map((row) => (
              <div key={row.year} className="flex items-center gap-3">
                <span className="w-24 shrink-0 font-mono text-[0.625rem] uppercase tracking-wider text-faint">
                  {YEAR_LABELS[row.year!] ?? row.year}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${(row.count / peak) * 100}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right font-mono text-xs text-dim">
                  {row.count}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <section>
          <Eyebrow className="mb-3">Top resources this term</Eyebrow>
          {!major.topResources.length ? (
            <EmptyState
              title="No notes yet in this major"
              body="Course pages are where notes live. Upload one and it shows up here for everyone below you."
            />
          ) : (
            <div className="space-y-2">
              {major.topResources.map((resource) => (
                <Link
                  key={resource.id}
                  to={
                    resource.course
                      ? `/courses/${encodeURIComponent(resource.course.code)}?tab=resources`
                      : '/courses'
                  }
                  className="flex items-center gap-3 rounded-xl border border-edge bg-panel p-3 transition hover:border-courses/40"
                >
                  {resource.course && <Code className="shrink-0">{resource.course.code}</Code>}
                  <span className="min-w-0 flex-1 truncate text-sm text-chalk">
                    {resource.title}
                  </span>
                  <span className="shrink-0 font-mono text-[0.625rem] text-faint">
                    +{resource.score}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <Eyebrow>People in your year</Eyebrow>
          <span className="text-xs text-faint">
            Discoverable students only — you can turn this off in your profile.
          </span>
        </div>

        {!major.peers.length ? (
          <EmptyState
            title="Nobody in your year is discoverable yet"
            body="Set your year on your profile and turn on discoverability, and you'll appear here for them too."
          />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {major.peers.map((person) => (
              <Card key={person.id} className="flex items-center gap-3">
                <Avatar
                  name={person.displayName}
                  src={person.avatarUrl}
                  seed={person.id}
                  size={38}
                  online={person.isOnline}
                />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/u/${person.username}`}
                    className="block truncate text-sm font-medium text-chalk hover:underline"
                  >
                    {person.displayName}
                  </Link>
                  {person.pronouns && (
                    <span className="block truncate text-xs text-dim">{person.pronouns}</span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void wave(person.id)}
                  aria-label={`Wave at ${person.displayName}`}
                >
                  <IconWave className="h-4 w-4" />
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      {major.events.length > 0 && (
        <section>
          <Eyebrow className="mb-3">Tagged to this major</Eyebrow>
          <div className="space-y-2">
            {major.events.map((event) => (
              <Link
                key={event.id}
                to={`/events/${event.id}`}
                className="flex items-center gap-4 rounded-xl border border-edge bg-panel p-3.5 transition hover:border-events/40"
              >
                <span className="w-20 shrink-0 font-mono text-xs text-events">
                  {new Date(event.startsAt).toLocaleDateString('en-CA', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-chalk">{event.title}</span>
                <span className="shrink-0 text-xs text-dim">{event.location}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
