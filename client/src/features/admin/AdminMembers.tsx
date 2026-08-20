import { useEffect, useState } from 'react';
import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';
import { cn, relativeTime, YEAR_LABELS } from '@/lib/utils';
import { Avatar, Badge, Button, Field, Input, Skeleton, Textarea } from '@/components/ui';
import { ConfirmDialog, Dialog, Select } from '@/components/ui/overlays';
import { EmptyState } from '@/components/ui';
import { IconImage, IconKey, IconSearch, IconShield } from '@/components/Icons';

/**
 * Member administration (feature 10).
 *
 * The two things this screen deliberately cannot do are the point of it:
 *
 *  - **No password field.** An admin issues a single-use reset code and hands it
 *    over; the student sets their own. An admin who can type a password into
 *    someone else's account can be that person, and nothing in the log would say so.
 *
 *  - **No avatar replacement.** Only removal. Taking down a picture is moderation.
 *    Putting one up on somebody's behalf is impersonation, and the difference
 *    matters more than the one line of code it saves.
 *
 * Everything else about an account is editable here, including admin status, which
 * is guarded server-side against removing the last administrator.
 */

interface Member {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  hasStoredAvatar: boolean;
  bio: string | null;
  pronouns: string | null;
  year: string | null;
  major: { id: string; name: string } | null;
  karma: number;
  isAdmin: boolean;
  suspendedAt: number | null;
  suspendedReason: string | null;
  mustChangePassword: boolean;
  deletedAt: number | null;
  onboardedAt: number | null;
  lastSeenAt: number;
  createdAt: number;
}

interface MajorRow {
  id: string;
  name: string;
  faculty: string;
}

const FILTERS = [
  { value: 'ALL', label: 'All accounts' },
  { value: 'ADMINS', label: 'Administrators' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'PENDING_ONBOARDING', label: 'Not onboarded' },
];

const YEARS = [
  { value: '', label: 'No year set' },
  ...Object.entries(YEAR_LABELS).map(([value, label]) => ({ value, label })),
];

export function AdminMembers() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(
    () => new URLSearchParams(window.location.search).get('filter') ?? 'ALL',
  );
  const [editing, setEditing] = useState<string | null>(null);

  const members = useQ<Member[]>(api.admin.members, { search, filter, limit: 120 });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-display-lg text-chalk">Members</h1>
        <p className="mt-1.5 text-[0.9375rem] text-dim">
          Everything about an account except its password and its picture. Those two stay with the
          student.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, username or email"
            className="pl-9"
            aria-label="Search members"
          />
        </div>
        <div className="w-48">
          <Select value={filter} onChange={setFilter} options={FILTERS} aria-label="Filter" />
        </div>
      </div>

      {members === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : !members.length ? (
        <EmptyState
          title="Nobody matches"
          body="Try a shorter search, or widen the filter. Accounts appear here the moment they register."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-edge bg-panel">
          <ul className="divide-y divide-edge">
            {members.map((member) => (
              <li key={member.id}>
                <button
                  onClick={() => setEditing(member.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-raised"
                >
                  <Avatar
                    name={member.displayName}
                    src={member.avatarUrl}
                    seed={member.id}
                    size={36}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          'truncate text-sm font-medium',
                          member.suspendedAt ? 'text-dim line-through' : 'text-chalk',
                        )}
                      >
                        {member.displayName}
                      </span>
                      {member.isAdmin && (
                        <Badge tone="accent">
                          <IconShield className="h-2.5 w-2.5" />
                          admin
                        </Badge>
                      )}
                      {member.suspendedAt && <Badge tone="events">suspended</Badge>}
                      {!member.onboardedAt && <Badge>not onboarded</Badge>}
                      {member.mustChangePassword && <Badge tone="clubs">reset pending</Badge>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-faint">
                      @{member.username} · {member.email}
                      {member.major ? ` · ${member.major.name}` : ''}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-right sm:block">
                    <span className="block font-mono text-[0.625rem] text-faint">
                      seen {relativeTime(member.lastSeenAt)}
                    </span>
                    <span className="block font-mono text-[0.625rem] text-faint">
                      {member.karma} karma
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && <MemberEditor userId={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MemberEditor({ userId, onClose }: { userId: string; onClose: () => void }) {
  const member = useQ<
    Member & { spaceCount: number; openResets: { code: string; expiresAt: number }[] }
  >(api.admin.member, { userId });
  const majors = useQ<MajorRow[]>(api.admin.majors);

  const update = useM(api.admin.updateMember);
  const removeAvatar = useM(api.admin.removeAvatar);
  const issueReset = useM(api.admin.issuePasswordReset);
  const setSuspended = useM(api.admin.setSuspended);

  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmAvatar, setConfirmAvatar] = useState(false);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);

  // Seed the form once the record arrives. Keyed on id so switching members resets.
  useEffect(() => {
    if (!member) return;
    setForm({
      displayName: member.displayName,
      username: member.username,
      email: member.email,
      pronouns: member.pronouns ?? '',
      bio: member.bio ?? '',
      year: member.year ?? '',
      majorId: member.major?.id ?? '',
      karma: String(member.karma),
      isAdmin: member.isAdmin ? 'yes' : 'no',
    });
    // Keyed on the member id, not on `member`: reseeding on every field update
    // would fight the user's typing.
  }, [member?.id]);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function run(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (success) setNotice(success);
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      const match = /(?:BAD_REQUEST|CONFLICT|FORBIDDEN|NOT_FOUND): (.*)/.exec(raw);
      setError(match?.[1] ?? 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      width="lg"
      title={member ? member.displayName : 'Loading account'}
      description={
        member ? `@${member.username} · joined ${relativeTime(member.createdAt)}` : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            loading={busy}
            onClick={() =>
              run(
                () =>
                  update({
                    userId,
                    displayName: form.displayName,
                    username: form.username,
                    email: form.email,
                    pronouns: form.pronouns,
                    bio: form.bio,
                    ...(form.year ? { year: form.year } : {}),
                    majorId: form.majorId || null,
                    karma: Number(form.karma) || 0,
                    isAdmin: form.isAdmin === 'yes',
                  }),
                'Saved.',
              )
            }
          >
            Save changes
          </Button>
        </>
      }
    >
      {!member ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {notice && (
            <p className="rounded-lg border border-courses/40 bg-courses/[0.08] px-3 py-2.5 text-sm text-courses">
              {notice}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-events/40 bg-events/[0.07] px-3 py-2.5 text-sm text-events"
            >
              {error}
            </p>
          )}

          {/* ── Identity ─────────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name">
              <Input
                value={form.displayName ?? ''}
                onChange={(e) => set('displayName', e.target.value)}
              />
            </Field>
            <Field label="Username" hint="Lowercase letters, numbers and underscores.">
              <Input
                value={form.username ?? ''}
                onChange={(e) => set('username', e.target.value.toLowerCase())}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email ?? ''}
                onChange={(e) => set('email', e.target.value)}
              />
            </Field>
            <Field label="Pronouns">
              <Input
                value={form.pronouns ?? ''}
                onChange={(e) => set('pronouns', e.target.value)}
                placeholder="they/them"
              />
            </Field>
            <Field label="Year">
              <Select value={form.year ?? ''} onChange={(v) => set('year', v)} options={YEARS} />
            </Field>
            <Field label="Major">
              <Select
                value={form.majorId ?? ''}
                onChange={(v) => set('majorId', v)}
                options={[
                  { value: '', label: 'No major set' },
                  ...(majors ?? []).map((m) => ({ value: m.id, label: m.name })),
                ]}
              />
            </Field>
          </div>

          <Field label="Bio">
            <Textarea
              rows={3}
              value={form.bio ?? ''}
              onChange={(e) => set('bio', e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Karma" hint="Earned through resources, reviews and answers.">
              <Input
                type="number"
                min={0}
                value={form.karma ?? '0'}
                onChange={(e) => set('karma', e.target.value)}
              />
            </Field>
            <Field
              label="Administrator access"
              hint="Grants the dashboard, the log and every account."
            >
              <Select
                value={form.isAdmin ?? 'no'}
                onChange={(v) => set('isAdmin', v)}
                options={[
                  { value: 'no', label: 'Student' },
                  { value: 'yes', label: 'Administrator' },
                ]}
              />
            </Field>
          </div>

          {/* ── The two restricted actions ───────────────────────────────── */}
          <section className="rounded-xl border border-edge bg-raised/50 p-4">
            <h3 className="text-sm font-semibold text-chalk">Account actions</h3>
            <p className="mt-1 text-xs leading-relaxed text-dim">
              You cannot set a password or upload a picture for someone. You can remove a picture,
              and you can issue a reset code for them to use themselves.
            </p>

            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar
                  name={member.displayName}
                  src={member.avatarUrl}
                  seed={member.id}
                  size={40}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!member.avatarUrl}
                  onClick={() => setConfirmAvatar(true)}
                >
                  <IconImage className="h-3.5 w-3.5" />
                  {member.avatarUrl ? 'Remove picture' : 'No picture set'}
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy}
                  onClick={() =>
                    run(async () => {
                      const result = (await issueReset({ userId })) as { code: string };
                      setIssuedCode(result.code);
                    })
                  }
                >
                  <IconKey className="h-3.5 w-3.5" />
                  Issue a password reset
                </Button>
                {member.openResets.length > 0 && !issuedCode && (
                  <span className="font-mono text-xs text-dim">
                    Outstanding: {member.openResets[0]!.code}
                  </span>
                )}
              </div>

              {issuedCode && (
                <div className="rounded-lg border border-clubs/40 bg-clubs/[0.08] px-3 py-2.5">
                  <p className="text-xs text-dim">
                    Give this to {member.displayName} yourself — no email is sent from this
                    deployment. It works once, and expires in three days.
                  </p>
                  <p className="mt-1.5 select-all font-mono text-base tracking-wider text-chalk">
                    {issuedCode}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-3">
                {member.suspendedAt ? (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy}
                      onClick={() =>
                        run(() => setSuspended({ userId, suspended: false }), 'Reinstated.')
                      }
                    >
                      Reinstate account
                    </Button>
                    <span className="text-xs text-events">
                      Suspended {relativeTime(member.suspendedAt)}
                      {member.suspendedReason ? ` — ${member.suspendedReason}` : ''}
                    </span>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={busy}
                    onClick={() =>
                      run(
                        () =>
                          setSuspended({
                            userId,
                            suspended: true,
                            reason: 'Suspended by a campus administrator.',
                          }),
                        'Suspended. Their sessions have been ended.',
                      )
                    }
                  >
                    Suspend account
                  </Button>
                )}
              </div>
            </div>
          </section>

          <p className="text-xs text-faint">
            In {member.spaceCount} {member.spaceCount === 1 ? 'space' : 'spaces'} · last seen{' '}
            {relativeTime(member.lastSeenAt)}
          </p>
        </div>
      )}

      <ConfirmDialog
        open={confirmAvatar}
        onClose={() => setConfirmAvatar(false)}
        onConfirm={() =>
          run(async () => {
            await removeAvatar({ userId, reason: 'Removed by a campus administrator.' });
            setConfirmAvatar(false);
          }, 'Picture removed.')
        }
        title="Remove this picture?"
        body="The image is deleted and the account falls back to its generated initials tile. This is written to the activity log."
        confirmLabel="Remove picture"
        busy={busy}
      />
    </Dialog>
  );
}
