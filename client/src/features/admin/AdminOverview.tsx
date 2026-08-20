import { Link } from 'react-router-dom';
import { api } from '@/lib/convexApi';
import { useQ } from '@/lib/convexHooks';
import { relativeTime } from '@/lib/utils';
import { Badge, Button, Card, EmptyState, Eyebrow, Skeleton } from '@/components/ui';

interface Stats {
  users: {
    total: number;
    admins: number;
    suspended: number;
    newThisWeek: number;
    onboarded: number;
  };
  spaces: { total: number; unclaimed: number; studentCreated: number };
  clubs: number;
  courses: number;
  majors: number;
  openReports: number;
  upcomingEvents: number;
}

interface LogEntry {
  id: string;
  actorName: string;
  action: string;
  summary: string;
  at: number;
}

export function AdminOverview() {
  const stats = useQ<Stats>(api.admin.stats);
  const logs = useQ<LogEntry[]>(api.admin.logs, { limit: 8 });

  if (!stats) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <header>
        <h1 className="font-display text-display-lg text-chalk">Overview</h1>
        <p className="mt-1.5 text-[0.9375rem] text-dim">
          The state of the campus, and anything waiting on you.
        </p>
      </header>

      {/* ── Attention first. A dashboard that leads with vanity counts buries the
             two rows that actually need a decision. */}
      {(stats.spaces.unclaimed > 0 || stats.openReports > 0 || stats.users.suspended > 0) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stats.spaces.unclaimed > 0 && (
            <AttentionCard
              tone="clubs"
              count={stats.spaces.unclaimed}
              label={stats.spaces.unclaimed === 1 ? 'space needs an owner' : 'spaces need owners'}
              body="Drafted spaces stay invisible to students until somebody owns them."
              to="/admin/spaces"
              cta="Assign owners"
            />
          )}
          {stats.openReports > 0 && (
            <AttentionCard
              tone="events"
              count={stats.openReports}
              label={stats.openReports === 1 ? 'open report' : 'open reports'}
              body="Students have flagged content that nobody has resolved yet."
              to="/admin/logs"
              cta="Review"
            />
          )}
          {stats.users.suspended > 0 && (
            <AttentionCard
              tone="events"
              count={stats.users.suspended}
              label={stats.users.suspended === 1 ? 'suspended account' : 'suspended accounts'}
              body="Suspended accounts cannot sign in until they are reinstated."
              to="/admin/members?filter=SUSPENDED"
              cta="See who"
            />
          )}
        </div>
      )}

      <section>
        <Eyebrow className="mb-3">People</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat value={stats.users.total} label="accounts" />
          <Stat value={stats.users.newThisWeek} label="joined this week" />
          <Stat
            value={stats.users.total - stats.users.onboarded}
            label="have not finished onboarding"
          />
          <Stat value={stats.users.admins} label="administrators" />
        </div>
      </section>

      <section>
        <Eyebrow className="mb-3">Campus</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat value={stats.spaces.total} label="published spaces" />
          <Stat value={stats.majors} label="majors" />
          <Stat value={stats.courses} label="courses" />
          <Stat value={stats.upcomingEvents} label="upcoming events" />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <Eyebrow>Recent activity</Eyebrow>
          <Link to="/admin/logs" className="text-xs text-accent-lift hover:underline">
            Full log
          </Link>
        </div>

        {!logs?.length ? (
          <EmptyState
            title="Nothing logged yet"
            body="Spaces created and deleted, accounts changed, majors added — they all land here."
          />
        ) : (
          <ul className="divide-y divide-edge overflow-hidden rounded-xl border border-edge bg-panel">
            {logs.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                <Badge tone={toneFor(entry.action)} className="mt-0.5 shrink-0">
                  {entry.action.replace(/_/g, ' ').toLowerCase()}
                </Badge>
                <p className="min-w-0 flex-1 text-sm text-chalk">{entry.summary}</p>
                <span className="shrink-0 font-mono text-[0.625rem] text-faint">
                  {relativeTime(entry.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function toneFor(action: string): 'neutral' | 'accent' | 'clubs' | 'courses' | 'events' {
  if (action.includes('DELETED') || action.includes('SUSPENDED') || action.includes('REVOKED')) {
    return 'events';
  }
  if (action.includes('CREATED') || action.includes('PUBLISHED') || action.includes('GRANTED')) {
    return 'courses';
  }
  if (action.includes('INSTANCE')) return 'accent';
  return 'neutral';
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <Card>
      <p className="font-display text-display-lg leading-none text-chalk">{value}</p>
      <p className="mt-1.5 text-xs leading-snug text-dim">{label}</p>
    </Card>
  );
}

function AttentionCard({
  tone,
  count,
  label,
  body,
  to,
  cta,
}: {
  tone: 'clubs' | 'events';
  count: number;
  label: string;
  body: string;
  to: string;
  cta: string;
}) {
  return (
    <Card className={tone === 'events' ? 'border-events/40' : 'border-clubs/40'}>
      <div className="flex items-baseline gap-2">
        <span
          className={`font-display text-display-md leading-none ${
            tone === 'events' ? 'text-events' : 'text-clubs'
          }`}
        >
          {count}
        </span>
        <span className="text-sm font-medium text-chalk">{label}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-dim">{body}</p>
      <Link to={to} className="mt-3 inline-block">
        <Button size="sm" variant="secondary">
          {cta}
        </Button>
      </Link>
    </Card>
  );
}
