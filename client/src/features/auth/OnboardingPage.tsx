import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CourseDto, MeUser } from '@campusconnect/shared';
import { YearEnum } from '@campusconnect/shared';
import { api, qs } from '@/lib/api';
import { cn, YEAR_LABELS } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import { Button, Code, Input, Skeleton } from '@/components/ui';
import { IconCheck } from '@/components/Icons';

interface Major {
  id: string;
  name: string;
  faculty: string;
  description: string;
  studentCount: number;
}
interface Interest {
  id: string;
  name: string;
  category: string;
}
interface Suggestions {
  majorSpace: { id: string; name: string; description: string | null } | null;
  courseSpaces: { id: string; name: string }[];
  clubs: { id: string; name: string; description: string; reason: string; memberCount: number }[];
}

const STEPS = ['Major', 'Year', 'Interests', 'Courses', 'Join'] as const;

export function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [majorId, setMajorId] = useState('');
  const [year, setYear] = useState('');
  const [interestIds, setInterestIds] = useState<string[]>([]);
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [courseSearch, setCourseSearch] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setUser = useAuth((s) => s.setUser);

  const { data: majors } = useQuery({
    queryKey: ['majors'],
    queryFn: () => api.get<Major[]>('/catalog/majors'),
  });
  const { data: interests } = useQuery({
    queryKey: ['interests'],
    queryFn: () => api.get<Interest[]>('/catalog/interests'),
  });
  const { data: courses } = useQuery({
    queryKey: ['courses', courseSearch, majorId],
    queryFn: () => api.get<CourseDto[]>(`/courses${qs({ q: courseSearch, majorId })}`),
    enabled: step === 3,
  });

  const submit = useMutation({
    mutationFn: () =>
      api.post<Suggestions>('/users/onboarding', {
        majorId,
        year,
        interestIds,
        // The wizard is term-agnostic; the server stamps the current term itself.
        courses: courseIds.map((courseId) => ({ courseId, term: currentTerm() })),
      }),
    onSuccess: async (data) => {
      setSuggestions(data);
      setStep(4);
      const me = await api.get<MeUser>('/auth/me');
      setUser(me);
    },
  });

  const finish = async () => {
    await queryClient.invalidateQueries();
    navigate('/');
  };

  const skip = async () => {
    // "Skippable but nagged once" (§5.1) — skipping still marks them onboarded so the
    // nag doesn't become a wall.
    await api
      .post('/users/onboarding', {
        majorId: majorId || majors?.[0]?.id,
        year: year || 'FRESHMAN',
        interestIds: interests?.slice(0, 3).map((i) => i.id) ?? [],
        courses: [],
      })
      .catch(() => undefined);
    const me = await api.get<MeUser>('/auth/me').catch(() => null);
    if (me) setUser(me);
    await queryClient.invalidateQueries();
    navigate('/');
  };

  const canAdvance =
    (step === 0 && majorId) ||
    (step === 1 && year) ||
    (step === 2 && interestIds.length >= 3) ||
    step === 3;

  const byCategory = groupBy(interests ?? [], (i) => i.category);

  return (
    <div className="min-h-dvh bg-ink px-5 py-10 md:py-16">
      <div className="mx-auto max-w-2xl">
        {/* Progress is a real sequence, so numbering it is honest here. */}
        <ol className="mb-9 flex items-center gap-1.5">
          {STEPS.map((label, i) => (
            <li key={label} className="flex flex-1 flex-col gap-1.5">
              <span
                className={cn(
                  'h-[3px] rounded-full transition-colors',
                  i < step ? 'bg-accent' : i === step ? 'bg-accent/60' : 'bg-edge',
                )}
              />
              <span
                className={cn(
                  'font-mono text-[0.625rem] uppercase tracking-wider',
                  i <= step ? 'text-dim' : 'text-faint',
                )}
              >
                {label}
              </span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <Step
            title="What are you studying?"
            body="This sets up your major community and the people you'll see first."
          >
            {!majors ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="space-y-5">
                {Object.entries(groupBy(majors, (m) => m.faculty)).map(([faculty, list]) => (
                  <div key={faculty}>
                    <p className="eyebrow mb-2">{faculty}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {list.map((major) => (
                        <button
                          key={major.id}
                          onClick={() => setMajorId(major.id)}
                          className={cn(
                            'rounded-lg border p-3 text-left transition',
                            majorId === major.id
                              ? 'border-accent bg-accent/10'
                              : 'border-edge bg-panel hover:border-faint/60',
                          )}
                        >
                          <span className="block text-sm font-medium text-chalk">{major.name}</span>
                          <span className="mt-0.5 block font-mono text-[0.625rem] text-faint">
                            {major.studentCount} students
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Step>
        )}

        {step === 1 && (
          <Step title="What year are you in?" body="Used for classmate suggestions and mentorship.">
            <div className="grid gap-2 sm:grid-cols-3">
              {YearEnum.options.map((option) => (
                <button
                  key={option}
                  onClick={() => setYear(option)}
                  className={cn(
                    'rounded-lg border px-4 py-3 text-sm font-medium transition',
                    year === option
                      ? 'border-accent bg-accent/10 text-chalk'
                      : 'border-edge bg-panel text-dim hover:border-faint/60 hover:text-chalk',
                  )}
                >
                  {YEAR_LABELS[option]}
                </button>
              ))}
            </div>
          </Step>
        )}

        {step === 2 && (
          <Step
            title="Pick a few things you're into."
            body={`Three or more. This is how clubs and study buddies find you. ${interestIds.length} picked.`}
          >
            <div className="space-y-5">
              {Object.entries(byCategory).map(([category, list]) => (
                <div key={category}>
                  <p className="eyebrow mb-2">{category.toLowerCase()}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((interest) => {
                      const on = interestIds.includes(interest.id);
                      return (
                        <button
                          key={interest.id}
                          onClick={() =>
                            setInterestIds((ids) =>
                              on ? ids.filter((id) => id !== interest.id) : [...ids, interest.id],
                            )
                          }
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-sm transition',
                            on
                              ? 'border-accent bg-accent/15 text-chalk'
                              : 'border-edge bg-panel text-dim hover:border-faint/60 hover:text-chalk',
                          )}
                        >
                          {interest.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Step>
        )}

        {step === 3 && (
          <Step
            title="What are you taking this term?"
            body="Optional, but it's what puts you in course spaces and finds you classmates."
          >
            <Input
              value={courseSearch}
              onChange={(e) => setCourseSearch(e.target.value)}
              placeholder="Search by code or title — try CS 22"
              className="mb-3"
            />
            <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {(courses ?? []).map((course) => {
                const on = courseIds.includes(course.id);
                return (
                  <button
                    key={course.id}
                    onClick={() =>
                      setCourseIds((ids) =>
                        on ? ids.filter((id) => id !== course.id) : [...ids, course.id],
                      )
                    }
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition',
                      on
                        ? 'border-accent bg-accent/10'
                        : 'border-edge bg-panel hover:border-faint/60',
                    )}
                  >
                    <Code className="shrink-0">{course.code}</Code>
                    <span className="min-w-0 flex-1 truncate text-sm text-chalk">
                      {course.title}
                    </span>
                    {on && <IconCheck className="h-4 w-4 shrink-0 text-accent" />}
                  </button>
                );
              })}
            </div>
          </Step>
        )}

        {step === 4 && suggestions && (
          <Step
            title="Here's where you'd fit."
            body="One click each. You can leave any of them later."
          >
            <div className="space-y-2.5">
              {suggestions.majorSpace && (
                <JoinRow
                  label={suggestions.majorSpace.name}
                  reason="Your major's community"
                  joined={joined.has(suggestions.majorSpace.id)}
                  onJoin={async () => {
                    await api.post(`/spaces/${suggestions.majorSpace!.id}/join`);
                    setJoined((s) => new Set(s).add(suggestions.majorSpace!.id));
                  }}
                />
              )}
              {suggestions.courseSpaces.map((space) => (
                <JoinRow
                  key={space.id}
                  label={space.name}
                  reason="You're taking this course"
                  joined={joined.has(space.id)}
                  onJoin={async () => {
                    await api.post(`/spaces/${space.id}/join`);
                    setJoined((s) => new Set(s).add(space.id));
                  }}
                />
              ))}
              {suggestions.clubs.map((club) => (
                <JoinRow
                  key={club.id}
                  label={club.name}
                  reason={club.reason}
                  joined={joined.has(club.id)}
                  onJoin={async () => {
                    await api.post(`/clubs/${club.id}/membership`, { role: 'MEMBER' });
                    setJoined((s) => new Set(s).add(club.id));
                  }}
                />
              ))}
              {!suggestions.majorSpace &&
                !suggestions.courseSpaces.length &&
                !suggestions.clubs.length && (
                  <p className="rounded-lg border border-dashed border-edge px-4 py-8 text-center text-sm text-dim">
                    Nothing to suggest yet — you've already joined everything that matches. Explore
                    has the rest.
                  </p>
                )}
            </div>
          </Step>
        )}

        <div className="mt-8 flex items-center gap-3">
          {step > 0 && step < 4 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}

          {step < 3 && (
            <Button
              className="ml-auto"
              disabled={!canAdvance}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </Button>
          )}
          {step === 3 && (
            <Button className="ml-auto" loading={submit.isPending} onClick={() => submit.mutate()}>
              {courseIds.length ? 'Find my spaces' : 'Skip courses for now'}
            </Button>
          )}
          {step === 4 && (
            <Button className="ml-auto" onClick={finish}>
              Go to CampusConnect
            </Button>
          )}

          {step < 4 && (
            <button onClick={skip} className="text-sm text-faint hover:text-dim">
              Skip setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="animate-rise-in">
      <h1 className="font-display text-display-md text-chalk">{title}</h1>
      <p className="mb-6 mt-1.5 text-sm text-dim">{body}</p>
      {children}
    </div>
  );
}

function JoinRow({
  label,
  reason,
  joined,
  onJoin,
}: {
  label: string;
  reason: string;
  joined: boolean;
  onJoin: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-edge bg-panel p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-chalk">{label}</p>
        <p className="truncate text-xs text-dim">{reason}</p>
      </div>
      <Button
        size="sm"
        variant={joined ? 'secondary' : 'primary'}
        disabled={joined}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          await onJoin().catch(() => undefined);
          setBusy(false);
        }}
      >
        {joined ? 'Joined' : 'Join'}
      </Button>
    </div>
  );
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    (acc[k] ??= []).push(item);
    return acc;
  }, {});
}

function currentTerm(now = new Date()): string {
  const m = now.getMonth();
  const y = now.getFullYear();
  if (m <= 3) return `${y}WI`;
  if (m <= 5) return `${y}SP`;
  if (m <= 7) return `${y}SU`;
  return `${y}FA`;
}
