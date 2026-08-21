import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';
import { relativeTime } from '@/lib/utils';
import { Avatar, Badge, Button, EmptyState, Skeleton } from '@/components/ui';
import { Dialog } from '@/components/ui/overlays';
import { IconIncognito, IconShield } from '@/components/Icons';

/**
 * Open reports (section 5.10).
 *
 * The queue an administrator actually works from. Two things it does that a plain
 * list would not:
 *
 *  - **Unmasking is here and nowhere else.** A report on an anonymous message is
 *    the one situation the brief allows authorship to be revealed, so the control
 *    lives next to the report rather than on the message. It is a mutation, not a
 *    query, because looking is itself recorded as a moderation action.
 *  - **Resolving says which way it went.** Actioned and dismissed are different
 *    outcomes and a single "done" button loses that.
 */

interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface ReportRow {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  createdAt: number;
  reporter: PublicUser | null;
}

const TARGET_TONE: Record<string, 'neutral' | 'accent' | 'clubs' | 'courses' | 'events'> = {
  MESSAGE: 'accent',
  USER: 'events',
  RESOURCE: 'courses',
  LISTING: 'clubs',
  REVIEW: 'courses',
  EVENT: 'clubs',
};

export function AdminReports() {
  const reports = useQ<ReportRow[]>(api.campus.openReports);
  const resolve = useM(api.campus.resolveReport);
  const reveal = useM(api.campus.revealAnonymousAuthor);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealing, setRevealing] = useState<ReportRow | null>(null);
  const [revealed, setRevealed] = useState<PublicUser | null>(null);

  async function act(report: ReportRow, status: 'ACTIONED' | 'DISMISSED') {
    setBusy(report.id);
    setError(null);
    try {
      await resolve({ reportId: report.id, status });
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setError(/(?::\s)(.*)/.exec(raw)?.[1] ?? 'Could not resolve that report.');
    } finally {
      setBusy(null);
    }
  }

  async function doReveal(report: ReportRow) {
    setBusy(report.id);
    setError(null);
    try {
      const result = (await reveal({ messageId: report.targetId })) as {
        author: PublicUser | null;
      };
      setRevealed(result.author);
      setRevealing(report);
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setError(/(?::\s)(.*)/.exec(raw)?.[1] ?? 'Could not look that up.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-display-lg text-chalk">Reports</h1>
        <p className="mt-1.5 text-[0.9375rem] text-dim">
          Everything students have flagged and nobody has closed yet. Resolving one records who did
          it and which way it went.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-events/40 bg-events/[0.07] px-3 py-2.5 text-sm text-events"
        >
          {error}
        </p>
      )}

      {reports === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : !reports.length ? (
        <EmptyState
          icon={<IconShield />}
          title="Nothing open"
          body="An empty queue is the good outcome. Reports land here the moment a student files one, and this page updates live."
        />
      ) : (
        <div className="space-y-2.5">
          {reports.map((report) => (
            <article key={report.id} className="card space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TARGET_TONE[report.targetType] ?? 'neutral'}>
                  {report.targetType.toLowerCase()}
                </Badge>
                <span className="font-mono text-[0.625rem] text-faint">{report.targetId}</span>
                <span className="ml-auto font-mono text-[0.625rem] text-faint">
                  {relativeTime(report.createdAt)}
                </span>
              </div>

              <p className="text-sm leading-relaxed text-chalk">{report.reason}</p>

              <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-3">
                {report.reporter ? (
                  <Link
                    to={`/u/${report.reporter.username}`}
                    className="flex items-center gap-1.5 text-xs text-dim hover:text-chalk"
                  >
                    <Avatar
                      name={report.reporter.displayName}
                      src={report.reporter.avatarUrl}
                      seed={report.reporter.id}
                      size={18}
                    />
                    reported by {report.reporter.displayName}
                  </Link>
                ) : (
                  <span className="text-xs text-faint">reporter account is gone</span>
                )}

                <div className="ml-auto flex flex-wrap gap-1.5">
                  {report.targetType === 'MESSAGE' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === report.id}
                      onClick={() => void doReveal(report)}
                    >
                      <IconIncognito className="h-3.5 w-3.5" />
                      Who wrote it
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busy === report.id}
                    onClick={() => void act(report, 'DISMISSED')}
                  >
                    Dismiss
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={busy === report.id}
                    onClick={() => void act(report, 'ACTIONED')}
                  >
                    Mark actioned
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={revealing !== null}
        onClose={() => {
          setRevealing(null);
          setRevealed(null);
        }}
        width="sm"
        title="Message authorship"
        description="This lookup has been written to the moderation record."
        footer={
          <Button
            onClick={() => {
              setRevealing(null);
              setRevealed(null);
            }}
          >
            Close
          </Button>
        }
      >
        {revealed ? (
          <div className="flex items-center gap-3">
            <Avatar
              name={revealed.displayName}
              src={revealed.avatarUrl}
              seed={revealed.id}
              size={40}
            />
            <div className="min-w-0">
              <Link
                to={`/u/${revealed.username}`}
                className="block truncate text-sm font-medium text-chalk hover:underline"
              >
                {revealed.displayName}
              </Link>
              <span className="block truncate font-mono text-xs text-faint">
                @{revealed.username}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-dim">
            No author is recorded against that message — the account may have been deleted.
          </p>
        )}
      </Dialog>
    </div>
  );
}
