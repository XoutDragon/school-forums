import { useState } from 'react';
import { api } from '@/lib/convexApi';
import { useM } from '@/lib/convexHooks';
import { cn } from '@/lib/utils';
import { Button, Textarea } from '@/components/ui';
import { Dialog } from '@/components/ui/overlays';

/**
 * Reporting (section 5.10).
 *
 * One dialog for all six target types, because the thing being reported changes
 * almost nothing about the interaction — you pick a reason, you add context, it
 * goes to moderators.
 *
 * The reason list is a starting point rather than a taxonomy. Free text is kept
 * and is the field moderators actually read; the preset exists so that reporting
 * something at 2am does not require composing a sentence.
 */

export type ReportTarget = 'MESSAGE' | 'USER' | 'RESOURCE' | 'LISTING' | 'REVIEW' | 'EVENT';

const REASONS = [
  { value: 'Harassment or bullying', hint: 'Targeted at someone, repeated, or threatening.' },
  { value: 'Hateful content', hint: 'Attacks people for who they are.' },
  { value: 'Sexual or explicit content', hint: 'Including anything involving a minor.' },
  { value: 'Spam or scam', hint: 'Bulk posting, phishing, or a listing that is not real.' },
  { value: 'Academic integrity', hint: 'Live assessment material, or asking for answers.' },
  { value: 'Someone may be at risk', hint: 'Self-harm, or a threat to their safety.' },
  { value: 'Something else', hint: 'Tell us below.' },
];

const TARGET_LABEL: Record<ReportTarget, string> = {
  MESSAGE: 'message',
  USER: 'account',
  RESOURCE: 'resource',
  LISTING: 'listing',
  REVIEW: 'review',
  EVENT: 'event',
};

export function ReportDialog({
  open,
  onClose,
  targetType,
  targetId,
  context,
}: {
  open: boolean;
  onClose: () => void;
  targetType: ReportTarget;
  targetId: string;
  /** A short excerpt, so the reporter can see what they are about to send. */
  context?: string;
}) {
  const report = useM(api.campus.report);

  const [reason, setReason] = useState(REASONS[0]!.value);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function reset() {
    setReason(REASONS[0]!.value);
    setDetail('');
    setError(null);
    setSent(false);
    onClose();
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await report({
        targetType,
        targetId,
        reason: detail.trim() ? `${reason} — ${detail.trim()}` : reason,
      });
      setSent(true);
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setError(/(?::\s)(.*)/.exec(raw)?.[1] ?? 'Could not send that report.');
    } finally {
      setBusy(false);
    }
  }

  const label = TARGET_LABEL[targetType];

  return (
    <Dialog
      open={open}
      onClose={reset}
      width="sm"
      title={sent ? 'Report sent' : `Report this ${label}`}
      description={
        sent
          ? undefined
          : 'This goes to space moderators and campus administrators. Your name is included so they can follow up.'
      }
      footer={
        sent ? (
          <Button onClick={reset}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={reset}>
              Cancel
            </Button>
            <Button loading={busy} onClick={submit}>
              Send report
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <p className="text-sm leading-relaxed text-dim">
          Thanks. A moderator will look at it. If someone is in immediate danger, contact campus
          security rather than waiting on this.
        </p>
      ) : (
        <div className="space-y-4">
          {context && (
            <blockquote className="rounded-lg border-l-2 border-edge bg-raised/60 py-2 pl-3 pr-2 text-xs italic leading-relaxed text-dim">
              {context.length > 200 ? `${context.slice(0, 200)}…` : context}
            </blockquote>
          )}

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-chalk">What is wrong with it?</legend>
            <div className="space-y-1">
              {REASONS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'flex cursor-pointer gap-2.5 rounded-lg border p-2.5 transition',
                    reason === option.value
                      ? 'border-accent bg-accent-wash'
                      : 'border-transparent hover:bg-raised',
                  )}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={option.value}
                    checked={reason === option.value}
                    onChange={() => setReason(option.value)}
                    className="mt-0.5 accent-[rgb(var(--accent))]"
                  />
                  <span className="min-w-0">
                    <span className="block text-[0.8125rem] font-medium text-chalk">
                      {option.value}
                    </span>
                    <span className="mt-0.5 block text-xs text-dim">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block space-y-1.5">
            <span className="block text-sm font-medium text-chalk">
              Anything else? <span className="font-normal text-faint">Optional, but it helps.</span>
            </span>
            <Textarea
              rows={3}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={500}
              placeholder="What happened, and whether it has happened before."
            />
          </label>

          <p className="text-xs leading-relaxed text-faint">
            Reports are limited to three an hour. Filing them in bad faith is itself a conduct
            issue.
          </p>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-events/40 bg-events/[0.07] px-3 py-2.5 text-sm text-events"
            >
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
