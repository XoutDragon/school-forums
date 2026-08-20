import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { PublicUser } from '@campusconnect/shared';
import { cn, relativeTime } from '@/lib/utils';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Code,
  EmptyState,
  Eyebrow,
  Skeleton,
  Tabs,
} from '@/components/ui';
import { IconCheck, IconWave } from '@/components/Icons';
import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';

interface Course {
  id: string;
  code: string;
  title: string;
  description: string | null;
  level: number;
  major: { id: string; name: string } | null;
  avgDifficulty: number | null;
  avgWorkload: number | null;
  avgRating: number | null;
  reviewCount: number;
  takingThisTerm: number;
  space: { id: string; name: string } | null;
  textbookListings: number;
}

interface Review {
  id: string;
  term: string;
  profName: string;
  difficulty: number;
  workload: number;
  rating: number;
  tips: string;
  wouldRecommend: boolean;
  helpfulCount: number;
  createdAt: number;
  author: PublicUser | null;
}

interface Resource {
  id: string;
  title: string;
  description: string | null;
  type: string;
  fileUrl: string | null;
  linkUrl: string | null;
  term: string | null;
  score: number;
  downloadCount: number;
  createdAt: string;
  uploader: PublicUser;
  myVote: number;
}

interface QaPost {
  id: string;
  title: string;
  body: string;
  score: number;
  answerCount: number;
  isResolved: boolean;
  createdAt: string;
  author: PublicUser;
}

type Classmate = PublicUser & { alreadyWaved: boolean };

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'resources', label: 'Resources' },
  { id: 'qa', label: 'Q&A' },
  { id: 'classmates', label: 'Classmates' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function CoursePage() {
  const { code } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) ?? 'overview';

  const course = useQ<Course>(api.courses.getByCode, code ? { code } : 'skip');
  const isLoading = course === undefined;

  if (isLoading || !course) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-5 w-96" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          {/* The course code is the page's identity, so it gets the utility face at
              display size rather than being demoted to a subtitle. */}
          <h1 className="font-mono text-display-md tracking-tight text-courses">{course.code}</h1>
          <Badge tone="courses">{course.level}-level</Badge>
          {course.major && (
            <Link
              to={`/majors/${course.major.id}`}
              className="text-xs text-dim underline-offset-2 hover:text-chalk hover:underline"
            >
              {course.major.name}
            </Link>
          )}
        </div>
        <p className="mt-1 font-display text-display-md text-chalk">{course.title}</p>
        {course.description && (
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-dim">{course.description}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {course.space && (
            <Link to={`/spaces/${course.space.id}`}>
              <Button size="sm">Open the course space</Button>
            </Link>
          )}
          <span className="font-mono text-xs text-faint">
            {course.takingThisTerm} taking this term
          </span>
        </div>
      </header>

      <Tabs
        tabs={TABS.map((t) => ({
          ...t,
          count: t.id === 'reviews' ? course.reviewCount : undefined,
        }))}
        value={tab}
        onChange={(id) => setParams({ tab: id })}
      />

      {tab === 'overview' && <Overview course={course} />}
      {tab === 'reviews' && <Reviews course={course} />}
      {tab === 'resources' && <Resources course={course} />}
      {tab === 'qa' && <Qa course={course} />}
      {tab === 'classmates' && <Classmates course={course} />}
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────

function Overview({ course }: { course: Course }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Gauge label="Difficulty" value={course.avgDifficulty} caption={['Gentle', 'Brutal']} />
        <Gauge label="Workload" value={course.avgWorkload} caption={['Light', 'Relentless']} />
        <Gauge label="Rating" value={course.avgRating} caption={['Avoid', 'Excellent']} accent />
      </div>

      {course.reviewCount === 0 && (
        <EmptyState
          title="Nobody has reviewed this yet"
          body="Reviews are structured, so even one makes the gauges above mean something for whoever registers next term."
        />
      )}

      {course.textbookListings > 0 && (
        <Card className="flex items-center justify-between border-clubs/25">
          <div>
            <p className="text-sm font-medium text-chalk">
              {course.textbookListings} used {course.textbookListings === 1 ? 'copy' : 'copies'} for
              sale on campus
            </p>
            <p className="mt-0.5 text-xs text-dim">Sold student to student. No payments here.</p>
          </div>
          <Link to="/marketplace">
            <Button size="sm" variant="secondary">
              See listings
            </Button>
          </Link>
        </Card>
      )}
    </div>
  );
}

function Gauge({
  label,
  value,
  caption,
  accent,
}: {
  label: string;
  value: number | null;
  caption: [string, string];
  accent?: boolean;
}) {
  const pct = value ? ((value - 1) / 4) * 100 : 0;
  return (
    <Card>
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-1.5 font-display text-display-md text-chalk">
        {value ? value.toFixed(1) : '—'}
        {value && <span className="ml-1 font-mono text-sm text-faint">/5</span>}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised">
        <div
          className={cn('h-full rounded-full transition-all', accent ? 'bg-courses' : 'bg-accent')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[0.5625rem] uppercase tracking-wide text-faint">
        <span>{caption[0]}</span>
        <span>{caption[1]}</span>
      </div>
    </Card>
  );
}

// ── Reviews ─────────────────────────────────────────────────────────────────

function Reviews({ course }: { course: Course }) {
  const [writing, setWriting] = useState(false);

  const reviews = useQ<Review[]>(api.courses.reviews, { courseId: course.id });
  const isLoading = reviews === undefined;

  if (isLoading) return <SkeletonRows />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-dim">
          Structured on purpose — sliders keep the averages meaningful, the tips box is where the
          real advice goes.
        </p>
        <Button size="sm" onClick={() => setWriting((w) => !w)}>
          {writing ? 'Cancel' : 'Write a review'}
        </Button>
      </div>

      {writing && (
        <ReviewForm
          courseId={course.id}
          onDone={() => {
            setWriting(false);
          }}
        />
      )}

      {!reviews?.length ? (
        <EmptyState
          title="No reviews yet"
          body="You'd be the first. One review changes what every student sees before they register."
          action={
            <Button size="sm" onClick={() => setWriting(true)}>
              Write the first one
            </Button>
          }
        />
      ) : (
        reviews.map((review) => (
          <Card key={review.id}>
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <Code>{review.term}</Code>
              <span className="text-xs font-medium text-chalk">{review.profName}</span>
              {review.wouldRecommend && (
                <Badge tone="courses">
                  <IconCheck className="h-3 w-3" /> recommends
                </Badge>
              )}
              <span className="ml-auto font-mono text-[0.625rem] text-faint">
                {relativeTime(review.createdAt)}
              </span>
            </div>

            <div className="mb-3 flex flex-wrap gap-4">
              <Stat label="difficulty" value={review.difficulty} />
              <Stat label="workload" value={review.workload} />
              <Stat label="rating" value={review.rating} />
            </div>

            <p className="text-sm leading-relaxed text-chalk/95">{review.tips}</p>

            <div className="mt-3 flex items-center gap-2 border-t border-edge pt-2.5">
              {review.author ? (
                <>
                  <Avatar
                    name={review.author.displayName}
                    src={review.author.avatarUrl}
                    seed={review.author.id}
                    size={20}
                  />
                  <Link
                    to={`/u/${review.author.username}`}
                    className="text-xs text-dim hover:text-chalk hover:underline"
                  >
                    {review.author.displayName}
                  </Link>
                </>
              ) : (
                <span className="text-xs text-faint">Posted anonymously</span>
              )}
              <span className="ml-auto font-mono text-[0.625rem] text-faint">
                {review.helpfulCount} found this helpful
              </span>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-faint">
        {label}
      </span>
      <div className="mt-1 flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={cn('h-1.5 w-4 rounded-full', n <= value ? 'bg-accent' : 'bg-raised')}
          />
        ))}
      </div>
    </div>
  );
}

function ReviewForm({ courseId, onDone }: { courseId: string; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const submit = useM(api.courses.writeReview);
  const [busy, setBusy] = useState(false);

  const mutate = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await submit({ courseId, ...body });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          void mutate({
            term: String(form.get('term')),
            profName: String(form.get('profName')),
            difficulty: Number(form.get('difficulty')),
            workload: Number(form.get('workload')),
            rating: Number(form.get('rating')),
            tips: String(form.get('tips')),
            wouldRecommend: form.get('wouldRecommend') === 'on',
            showName: form.get('showName') === 'on',
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-chalk">Term</span>
            <input
              name="term"
              defaultValue={currentTerm()}
              placeholder="2026FA"
              required
              className="h-10 w-full rounded-lg border border-edge bg-raised px-3 font-mono text-sm text-chalk outline-none focus:border-accent/60"
            />
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-chalk">Instructor</span>
            <input
              name="profName"
              placeholder="Dr. Almeida"
              required
              className="h-10 w-full rounded-lg border border-edge bg-raised px-3 text-sm text-chalk outline-none focus:border-accent/60"
            />
          </label>
        </div>

        {(['difficulty', 'workload', 'rating'] as const).map((field) => (
          <label key={field} className="block">
            <span className="mb-1 block text-sm font-medium capitalize text-chalk">{field}</span>
            <input
              type="range"
              name={field}
              min={1}
              max={5}
              defaultValue={3}
              className="w-full accent-[rgb(var(--accent))]"
            />
          </label>
        ))}

        <label className="block space-y-1.5">
          <span className="block text-sm font-medium text-chalk">
            What should the next student know?
          </span>
          <textarea
            name="tips"
            rows={4}
            required
            minLength={20}
            placeholder="What actually worked, what you'd do differently, and whether the tutorials mattered."
            className="w-full resize-none rounded-lg border border-edge bg-raised px-3 py-2 text-sm text-chalk outline-none focus:border-accent/60"
          />
        </label>

        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm text-chalk">
            <input
              type="checkbox"
              name="wouldRecommend"
              defaultChecked
              className="accent-[rgb(var(--accent))]"
            />
            I'd recommend it
          </label>
          <label className="flex items-center gap-2 text-sm text-chalk">
            <input type="checkbox" name="showName" className="accent-[rgb(var(--accent))]" />
            Show my name
          </label>
        </div>

        {error && <p className="text-sm text-events">{error}</p>}

        <Button type="submit" loading={busy}>
          Post review
        </Button>
      </form>
    </Card>
  );
}

// ── Resources ───────────────────────────────────────────────────────────────

function Resources({ course }: { course: Course }) {
  const [sort, setSort] = useState<'top' | 'new'>('top');
  const [preview, setPreview] = useState<Resource | null>(null);

  const resources = useQ<Resource[]>(api.resources.list, { courseId: course.id, sort });
  const isLoading = resources === undefined;

  const castVote = useM(api.resources.vote);
  const registerDownload = useM(api.resources.registerDownload);

  const vote = async (resource: Resource, value: number) => {
    await castVote({
      resourceId: resource.id,
      value: resource.myVote === value ? 0 : value,
    });
  };

  const download = async (resource: Resource) => {
    const { url } = await registerDownload({ resourceId: resource.id });
    if (url) window.open(url, '_blank', 'noopener');
  };

  if (isLoading) return <SkeletonRows />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(['top', 'new'] as const).map((option) => (
          <button
            key={option}
            onClick={() => setSort(option)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition',
              sort === option ? 'bg-accent/15 text-accent-lift' : 'text-dim hover:bg-raised',
            )}
          >
            {option === 'top' ? 'Top' : 'Newest'}
          </button>
        ))}
        <span className="ml-auto font-mono text-[0.625rem] text-faint">
          downloads earn the uploader +2 karma
        </span>
      </div>

      {!resources?.length ? (
        <EmptyState
          title="No notes for this course yet"
          body="Whatever got you through the midterm will get someone else through it next year. Upload it and it stays here across terms."
        />
      ) : (
        resources.map((resource) => (
          <Card key={resource.id} className="flex gap-4">
            <div className="flex w-10 shrink-0 flex-col items-center gap-0.5">
              <button
                onClick={() => vote(resource, 1)}
                aria-label="Upvote"
                className={cn(
                  'text-sm transition',
                  resource.myVote === 1 ? 'text-courses' : 'text-faint hover:text-dim',
                )}
              >
                ▲
              </button>
              <span className="font-mono text-sm font-semibold text-chalk">{resource.score}</span>
              <button
                onClick={() => vote(resource, -1)}
                aria-label="Downvote"
                className={cn(
                  'text-sm transition',
                  resource.myVote === -1 ? 'text-events' : 'text-faint hover:text-dim',
                )}
              >
                ▼
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <Badge tone="courses">{resource.type.replace('_', ' ').toLowerCase()}</Badge>
                {resource.term && <Code>{resource.term}</Code>}
              </div>
              <h3 className="text-sm font-semibold text-chalk">{resource.title}</h3>
              {resource.description && (
                <p className="mt-1 text-xs text-dim">{resource.description}</p>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                <Button size="sm" variant="secondary" onClick={() => void download(resource)}>
                  {resource.linkUrl ? 'Open link' : 'Download'}
                </Button>
                {resource.fileUrl?.endsWith('.pdf') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPreview(preview?.id === resource.id ? null : resource)}
                  >
                    {preview?.id === resource.id ? 'Hide preview' : 'Preview'}
                  </Button>
                )}
                <span className="font-mono text-[0.625rem] text-faint">
                  {resource.downloadCount} downloads
                </span>
                <Link
                  to={`/u/${resource.uploader.username}`}
                  className="ml-auto flex items-center gap-1.5 text-xs text-dim hover:text-chalk"
                >
                  <Avatar
                    name={resource.uploader.displayName}
                    src={resource.uploader.avatarUrl}
                    seed={resource.uploader.id}
                    size={18}
                  />
                  {resource.uploader.displayName}
                </Link>
              </div>

              {preview?.id === resource.id && resource.fileUrl && (
                <iframe
                  src={resource.fileUrl}
                  title={resource.title}
                  className="mt-3 h-96 w-full rounded-lg border border-edge bg-white"
                />
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

// ── Q&A ─────────────────────────────────────────────────────────────────────

function Qa({ course }: { course: Course }) {
  const posts = useQ<QaPost[]>(api.qa.list, { courseId: course.id });
  const isLoading = posts === undefined;

  if (isLoading) return <SkeletonRows />;

  if (!posts?.length) {
    return (
      <EmptyState
        title="No questions yet"
        body="Ask the thing you're slightly embarrassed not to know. Someone else is wondering it too, and accepted answers earn +10 karma."
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {posts.map((post) => (
        <Card key={post.id}>
          <div className="flex items-start gap-3">
            <div className="w-10 shrink-0 text-center">
              <span className="block font-mono text-sm font-semibold text-chalk">{post.score}</span>
              <span className="font-mono text-[0.5625rem] uppercase text-faint">votes</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <h3 className="flex-1 text-sm font-semibold text-chalk">{post.title}</h3>
                {post.isResolved && <Badge tone="courses">answered</Badge>}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-dim line-clamp-2">{post.body}</p>
              <div className="mt-2 flex items-center gap-2 text-xs text-faint">
                <Avatar
                  name={post.author.displayName}
                  src={post.author.avatarUrl}
                  seed={post.author.id}
                  size={16}
                />
                <span>{post.author.displayName}</span>
                <span>·</span>
                <span className="font-mono text-[0.625rem]">
                  {post.answerCount} {post.answerCount === 1 ? 'answer' : 'answers'}
                </span>
                <span className="ml-auto font-mono text-[0.625rem]">
                  {relativeTime(post.createdAt)}
                </span>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Classmates ──────────────────────────────────────────────────────────────

function Classmates({ course }: { course: Course }) {
  const classmates = useQ<Classmate[]>(api.courses.classmates, { courseId: course.id });
  const isLoading = classmates === undefined;

  const sendWave = useM(api.users.wave);
  const wave = async (userId: string) => {
    await sendWave({ toId: userId, context: course.code });
  };

  if (isLoading) return <SkeletonRows />;

  if (!classmates?.length) {
    return (
      <EmptyState
        title="Nobody discoverable in this course yet"
        body="Students choose whether to appear here. Add the course to your profile and you'll show up for them too."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-dim">
          A wave is a small hello — lower stakes than a DM. If they wave back, we'll suggest a chat.
        </p>
        <Link to="/study">
          <Button size="sm" variant="secondary">
            Find a study group
          </Button>
        </Link>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {classmates.map((person) => (
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
              {person.major && (
                <span className="block truncate text-xs text-dim">{person.major.name}</span>
              )}
            </div>
            <Button
              size="sm"
              variant={person.alreadyWaved ? 'ghost' : 'secondary'}
              disabled={person.alreadyWaved}
              onClick={() => void wave(person.id)}
              aria-label={person.alreadyWaved ? 'Already waved' : `Wave at ${person.displayName}`}
            >
              <IconWave className="h-4 w-4" />
              {person.alreadyWaved ? 'Waved' : 'Wave'}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-28" />
      ))}
    </div>
  );
}

function currentTerm(now = new Date()): string {
  const m = now.getMonth();
  const y = now.getFullYear();
  if (m <= 3) return `${y}WI`;
  if (m <= 5) return `${y}SP`;
  if (m <= 7) return `${y}SU`;
  return `${y}FA`;
}
