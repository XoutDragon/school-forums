import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SpaceDto } from '@campusconnect/shared';
import { api } from '@/lib/api';
import { Badge, Button, Card, EmptyState, Eyebrow, Skeleton } from '@/components/ui';
import { IconBook, IconCalendar, IconTag, IconUsers } from '@/components/Icons';

interface Major {
  id: string;
  name: string;
  faculty: string;
  description: string;
  studentCount: number;
  courseCount: number;
}

const DESTINATIONS = [
  {
    to: '/clubs',
    label: 'Clubs',
    body: '15 on campus, 5 recruiting',
    icon: IconUsers,
    tone: 'text-clubs',
  },
  {
    to: '/courses',
    label: 'Courses',
    body: 'Reviews, notes and Q&A by code',
    icon: IconBook,
    tone: 'text-courses',
  },
  {
    to: '/calendar',
    label: 'Events',
    body: 'What is on this week and next',
    icon: IconCalendar,
    tone: 'text-events',
  },
  {
    to: '/marketplace',
    label: 'Marketplace',
    body: 'Textbooks and dorm furniture',
    icon: IconTag,
    tone: 'text-dim',
  },
] as const;

export function ExplorePage() {
  const queryClient = useQueryClient();

  const { data: spaces, isLoading } = useQuery({
    queryKey: ['discover-spaces'],
    queryFn: () => api.get<SpaceDto[]>('/spaces/discover'),
  });

  const { data: majors } = useQuery({
    queryKey: ['majors'],
    queryFn: () => api.get<Major[]>('/catalog/majors'),
  });

  const join = async (spaceId: string) => {
    await api.post(`/spaces/${spaceId}/join`);
    void queryClient.invalidateQueries({ queryKey: ['discover-spaces'] });
    void queryClient.invalidateQueries({ queryKey: ['spaces'] });
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-display-lg text-chalk">Explore Lakeshore</h1>
        <p className="mt-1.5 text-[0.9375rem] text-dim">
          Everything on campus, whether or not you've joined it yet.
        </p>
      </header>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {DESTINATIONS.map(({ to, label, body, icon: Icon, tone }) => (
          <Link key={to} to={to}>
            <Card className="h-full transition hover:border-faint/50">
              <Icon className={`h-5 w-5 ${tone}`} />
              <h2 className="mt-2.5 font-display text-[0.9375rem] font-semibold tracking-tight text-chalk">
                {label}
              </h2>
              <p className="mt-1 text-xs text-dim">{body}</p>
            </Card>
          </Link>
        ))}
      </div>

      <section>
        <Eyebrow className="mb-3">Spaces you haven't joined</Eyebrow>
        {isLoading ? (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : !spaces?.length ? (
          <EmptyState
            title="You're in everything already"
            body="Every public space on campus has you in it. That's either impressive or a sign you should start one."
          />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {spaces.map((space) => (
              <Card key={space.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to={`/spaces/${space.id}`}
                    className="min-w-0 font-display text-[0.9375rem] font-semibold tracking-tight text-chalk hover:underline"
                  >
                    {space.name}
                  </Link>
                  <Badge>{space.type.toLowerCase()}</Badge>
                </div>
                <p className="mt-2 flex-1 text-xs leading-relaxed text-dim line-clamp-2">
                  {space.description ?? 'No description yet.'}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="font-mono text-[0.625rem] text-faint">
                    {space.memberCount} members
                  </span>
                  <Button size="sm" className="ml-auto" onClick={() => void join(space.id)}>
                    Join
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <Eyebrow className="mb-3">Majors</Eyebrow>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {majors?.map((major) => (
            <Link key={major.id} to={`/majors/${major.id}`}>
              <Card className="h-full transition hover:border-accent/40">
                <p className="font-mono text-[0.5625rem] uppercase tracking-wider text-faint">
                  {major.faculty}
                </p>
                <h3 className="mt-1.5 font-display text-[0.9375rem] font-semibold tracking-tight text-chalk">
                  {major.name}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-dim line-clamp-2">
                  {major.description}
                </p>
                <p className="mt-2.5 font-mono text-[0.625rem] text-faint">
                  {major.studentCount} students · {major.courseCount} courses
                </p>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
