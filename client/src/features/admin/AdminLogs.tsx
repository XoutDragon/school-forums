import { useState } from 'react';
import { api } from '@/lib/convexApi';
import { useQ } from '@/lib/convexHooks';
import { cn, relativeTime, timeOfDay } from '@/lib/utils';
import { Badge, EmptyState, Eyebrow, Skeleton } from '@/components/ui';
import { Select } from '@/components/ui/overlays';
import { toneFor } from '@/features/admin/AdminOverview';

interface LogEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  at: number;
}

/**
 * The activity log (feature 10).
 *
 * The brief asks specifically for space creation and deletion, and those are the
 * default view — but a log that only covers two actions is not a log, so account
 * changes, majors and instance settings are in here too, filterable.
 *
 * Entries are immutable and carry their own rendered sentence, so a deleted space
 * still reads correctly a month later. See convex/lib/audit.ts.
 */

const FILTERS = [
  { value: 'ALL', label: 'Everything' },
  { value: 'SPACE_CREATED', label: 'Spaces created' },
  { value: 'SPACE_DELETED', label: 'Spaces deleted' },
  { value: 'SPACE_PUBLISHED', label: 'Spaces published' },
  { value: 'SPACE_OWNER_ASSIGNED', label: 'Owners assigned' },
  { value: 'USER_UPDATED', label: 'Accounts edited' },
  { value: 'USER_SUSPENDED', label: 'Accounts suspended' },
  { value: 'USER_PASSWORD_RESET_SENT', label: 'Password resets' },
  { value: 'USER_AVATAR_REMOVED', label: 'Pictures removed' },
  { value: 'MAJOR_CREATED', label: 'Majors added' },
  { value: 'INSTANCE_UPDATED', label: 'Settings changed' },
];

export function AdminLogs() {
  const [action, setAction] = useState('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);

  const logs = useQ<LogEntry[]>(api.admin.logs, { action, limit: 200 });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-display-lg text-chalk">Activity log</h1>
          <p className="mt-1.5 text-[0.9375rem] text-dim">
            Append-only. Entries are never edited or removed, including by you.
          </p>
        </div>
        <div className="w-56">
          <Select
            value={action}
            onChange={setAction}
            options={FILTERS}
            aria-label="Filter by action"
          />
        </div>
      </header>

      {logs === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : !logs.length ? (
        <EmptyState
          title={action === 'ALL' ? 'Nothing logged yet' : 'Nothing of that kind yet'}
          body={
            action === 'ALL'
              ? 'Spaces created and deleted, accounts changed, majors added — they all land here as they happen.'
              : 'Try a wider filter, or check back after the next change of that kind.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-edge bg-panel">
          <div className="hidden items-center gap-3 border-b border-edge px-4 py-2 sm:flex">
            <Eyebrow className="w-40 shrink-0">Action</Eyebrow>
            <Eyebrow className="flex-1">What happened</Eyebrow>
            <Eyebrow className="w-28 shrink-0 text-right">When</Eyebrow>
          </div>

          <ul className="divide-y divide-edge">
            {logs.map((entry) => {
              const open = expanded === entry.id;
              const hasDetail = entry.metadata !== null || entry.targetId !== null;

              return (
                <li key={entry.id}>
                  <button
                    onClick={() => setExpanded(open ? null : entry.id)}
                    disabled={!hasDetail}
                    className={cn(
                      'flex w-full flex-wrap items-start gap-x-3 gap-y-1.5 px-4 py-3 text-left transition sm:flex-nowrap sm:items-center',
                      hasDetail && 'hover:bg-raised',
                    )}
                  >
                    <span className="w-40 shrink-0">
                      <Badge tone={toneFor(entry.action)}>
                        {entry.action.replace(/_/g, ' ').toLowerCase()}
                      </Badge>
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-chalk">{entry.summary}</span>
                    <span
                      className="w-28 shrink-0 text-left font-mono text-[0.625rem] text-faint sm:text-right"
                      title={new Date(entry.at).toLocaleString()}
                    >
                      {relativeTime(entry.at)}
                    </span>
                  </button>

                  {open && (
                    <div className="border-t border-edge bg-raised/60 px-4 py-3">
                      <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-[9rem_1fr]">
                        <dt className="text-faint">Exact time</dt>
                        <dd className="font-mono text-dim">
                          {new Date(entry.at).toLocaleDateString('en-CA')} {timeOfDay(entry.at)}
                        </dd>
                        <dt className="text-faint">Performed by</dt>
                        <dd className="text-dim">{entry.actorName}</dd>
                        <dt className="text-faint">Target</dt>
                        <dd className="font-mono text-dim">
                          {entry.targetType}
                          {entry.targetId ? ` · ${entry.targetId}` : ''}
                        </dd>
                        {entry.metadata && (
                          <>
                            <dt className="text-faint">Details</dt>
                            <dd>
                              <pre className="overflow-x-auto rounded-lg border border-edge bg-panel p-2.5 font-mono text-[0.6875rem] leading-relaxed text-dim">
                                {JSON.stringify(entry.metadata, null, 2)}
                              </pre>
                            </dd>
                          </>
                        )}
                      </dl>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {logs && logs.length >= 200 && (
        <p className="text-center text-xs text-faint">
          Showing the most recent 200 entries. Narrow the filter to reach further back.
        </p>
      )}
    </div>
  );
}
