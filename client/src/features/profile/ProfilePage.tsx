import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PublicUser } from '@campusconnect/shared';
// MeUser comes from the store, not the shared package: shared/ still describes the
// REST shape, where timestamps were ISO strings. Convex returns epoch milliseconds.
import type { MeUser } from '@/stores/auth';
import { YEAR_LABELS } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Code,
  Eyebrow,
  Field,
  Input,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { IconFlag, IconKey, IconWave } from '@/components/Icons';
import { Dialog, ImagePicker } from '@/components/ui/overlays';
import { ReportDialog } from '@/features/moderation/ReportDialog';
import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';
import { useUpload } from '@/lib/upload';
import { useMe } from '@/hooks/useMe';

interface Profile extends PublicUser {
  bio: string | null;
  joinedAt: number;
  badges: { key: string; name: string; emoji: string; description: string; awardedAt: number }[];
  courses: { status: string; term: string; course: { id: string; code: string; title: string } }[];
  clubs: { id: string; name: string; slug: string; category: string; role: string }[];
  spaces: { id: string; name: string; slug: string; type: string }[];
  canWave: boolean;
  canDm: boolean;
}

export function ProfilePage() {
  const { username } = useParams();
  const me = useMe();
  const signOut = useAuth((s) => s.signOut);
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const profile = useQ<Profile>(api.users.profile, username ? { username } : 'skip');
  const isLoading = profile === undefined;

  const sendWave = useM(api.users.wave);
  const openDm = useM(api.dms.open);

  if (isLoading || !profile) return <Skeleton className="h-96 w-full" />;

  const isSelf = me?.id === profile.id;

  const wave = async () => {
    await sendWave({ toId: profile.id });
  };

  const message = async () => {
    const conversationId = await openDm({ userIds: [profile.id] });
    navigate(`/dms/${conversationId}`);
  };

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-start gap-5">
        <Avatar
          name={profile.displayName}
          src={profile.avatarUrl}
          seed={profile.id}
          size={80}
          online={profile.isOnline}
        />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-display-lg text-chalk">{profile.displayName}</h1>
          <p className="mt-0.5 font-mono text-sm text-dim">@{profile.username}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {profile.pronouns && <Badge>{profile.pronouns}</Badge>}
            {profile.year && <Badge tone="accent">{YEAR_LABELS[profile.year]}</Badge>}
            {profile.major && (
              <Link to={`/majors/${profile.major.id}`}>
                <Badge tone="courses">{profile.major.name}</Badge>
              </Link>
            )}
          </div>
          {profile.bio && (
            <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-chalk/90">
              {profile.bio}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {isSelf ? (
            <>
              <Button variant="secondary" onClick={() => setEditing((e) => !e)}>
                {editing ? 'Cancel' : 'Edit profile'}
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  await signOut();
                  navigate('/welcome', { replace: true });
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              {profile.canWave && (
                <Button variant="secondary" onClick={() => void wave()}>
                  <IconWave className="h-4 w-4" />
                  Wave
                </Button>
              )}
              {profile.canDm && <Button onClick={() => void message()}>Message</Button>}
              <Button
                variant="ghost"
                aria-label={`Report ${profile.displayName}`}
                onClick={() => setReporting(true)}
              >
                <IconFlag className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </header>

      {isSelf && me?.mustChangePassword && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-clubs/40 bg-clubs/[0.07] px-4 py-3">
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-chalk">
            Your campus IT team issued a password reset for this account. Set a new password to
            clear this.
          </p>
          <Button size="sm" onClick={() => setChangingPassword(true)}>
            <IconKey className="h-3.5 w-3.5" />
            Change password
          </Button>
        </div>
      )}

      {editing && isSelf && me && (
        <EditProfile
          me={me}
          onDone={() => setEditing(false)}
          onChangePassword={() => setChangingPassword(true)}
        />
      )}

      {isSelf && (
        <ChangePasswordDialog open={changingPassword} onClose={() => setChangingPassword(false)} />
      )}

      {!isSelf && (
        <ReportDialog
          open={reporting}
          onClose={() => setReporting(false)}
          targetType="USER"
          targetId={profile.id}
          context={`@${profile.username} — ${profile.displayName}`}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-5">
          <Card className="flex items-center gap-4">
            <span className="font-display text-display-lg leading-none text-accent-lift">
              {profile.karma}
            </span>
            <div>
              <p className="text-sm font-medium text-chalk">karma</p>
              <p className="text-xs text-dim">
                Earned from useful notes, accepted answers and reviews.
              </p>
            </div>
          </Card>

          <section>
            <Eyebrow className="mb-2.5">Badges</Eyebrow>
            {!profile.badges.length ? (
              <p className="rounded-xl border border-dashed border-edge px-4 py-6 text-center text-sm text-dim">
                {isSelf
                  ? 'Post something, review a course, or join a few clubs — badges follow real activity.'
                  : 'None yet.'}
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {profile.badges.map((badge) => (
                  <div
                    key={badge.key}
                    className="flex items-center gap-2.5 rounded-lg border border-edge bg-panel px-3 py-2.5"
                    title={badge.description}
                  >
                    <span className="text-lg">{badge.emoji}</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-chalk">{badge.name}</p>
                      <p className="truncate text-[0.625rem] text-faint">{badge.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <section>
            <Eyebrow className="mb-2.5">Courses this term</Eyebrow>
            {!profile.courses.length ? (
              <p className="rounded-xl border border-dashed border-edge px-4 py-6 text-center text-sm text-dim">
                {isSelf ? 'Add courses to meet classmates.' : 'Not shared.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {profile.courses.map((entry) => (
                  <Link
                    key={entry.course.id}
                    to={`/courses/${encodeURIComponent(entry.course.code)}`}
                    title={entry.course.title}
                  >
                    <Code className="hover:border-courses/50 hover:text-courses">
                      {entry.course.code}
                    </Code>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <Eyebrow className="mb-2.5">Clubs</Eyebrow>
            {!profile.clubs.length ? (
              <p className="rounded-xl border border-dashed border-edge px-4 py-6 text-center text-sm text-dim">
                Not in any clubs yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {profile.clubs.map((club) => (
                  <Link
                    key={club.id}
                    to={`/clubs/${club.slug}`}
                    className="flex items-center gap-2.5 rounded-lg border border-edge bg-panel px-3 py-2 transition hover:border-clubs/40"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-chalk">{club.name}</span>
                    <span className="shrink-0 font-mono text-[0.5625rem] uppercase tracking-wide text-clubs">
                      {club.role}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <Eyebrow className="mb-2.5">Spaces</Eyebrow>
            <div className="flex flex-wrap gap-1.5">
              {profile.spaces.map((space) => (
                <Link key={space.id} to={`/spaces/${space.id}`}>
                  <Badge>{space.name}</Badge>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function EditProfile({
  me,
  onDone,
  onChangePassword,
}: {
  me: MeUser;
  onDone: () => void;
  onChangePassword: () => void;
}) {
  const save = useM(api.auth.updateProfile);
  const [busy, setBusy] = useState(false);

  return (
    <Card className="space-y-6">
      <AvatarSection me={me} />

      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const form = new FormData(e.currentTarget);
          await save({
            displayName: String(form.get('displayName')),
            bio: String(form.get('bio') || ''),
            pronouns: String(form.get('pronouns') || ''),
            settings: {
              discoverable: form.get('discoverable') === 'on',
              showCourses: form.get('showCourses') === 'on',
              dmPrivacy: form.get('dmPrivacy') as 'EVERYONE' | 'SHARED_SPACE_ONLY' | 'NOBODY',
            },
          });
          setBusy(false);
          onDone();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name">
            <Input name="displayName" defaultValue={me.displayName} required />
          </Field>
          <Field label="Pronouns" hint="Shown next to your name.">
            <Input name="pronouns" defaultValue={me.pronouns ?? ''} placeholder="they/them" />
          </Field>
        </div>

        <Field label="Bio" hint="A line or two. 280 characters.">
          <Textarea name="bio" rows={3} defaultValue={me.bio ?? ''} maxLength={280} />
        </Field>

        <Field label="Who can message you">
          <select
            name="dmPrivacy"
            defaultValue={me.settings.dmPrivacy}
            className="h-10 w-full rounded-lg border border-edge bg-raised px-3 text-sm text-chalk outline-none focus:border-accent/60"
          >
            <option value="EVERYONE">Anyone at Lakeshore</option>
            <option value="SHARED_SPACE_ONLY">Only people in my spaces</option>
            <option value="NOBODY">Nobody</option>
          </select>
        </Field>

        <div className="space-y-2.5">
          <label className="flex items-center gap-2.5 text-sm text-chalk">
            <input
              type="checkbox"
              name="discoverable"
              defaultChecked={me.settings.discoverable}
              className="accent-[rgb(var(--accent))]"
            />
            Show me in classmate grids and buddy matching
          </label>
          <label className="flex items-center gap-2.5 text-sm text-chalk">
            <input
              type="checkbox"
              name="showCourses"
              defaultChecked={me.settings.showCourses}
              className="accent-[rgb(var(--accent))]"
            />
            Show my courses on my profile
          </label>
        </div>

        <div className="border-t border-edge pt-4">
          <p className="text-sm font-medium text-chalk">Password</p>
          <p className="mt-1 text-xs leading-relaxed text-dim">
            Changing it signs out every other device on this account.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={onChangePassword}
          >
            <IconKey className="h-3.5 w-3.5" />
            Change password
          </Button>
        </div>

        <Button type="submit" loading={busy}>
          Save changes
        </Button>
      </form>
    </Card>
  );
}

/**
 * Profile picture (feature 2).
 *
 * Its own section above the details form rather than a field inside it, because it
 * saves on its own: an image upload is a two-step round trip (blob first, then the
 * record) and burying that inside a form submit means the picture and the bio can
 * fail independently while showing one "Save changes" spinner.
 */
function AvatarSection({ me }: { me: MeUser }) {
  const { upload, busy: uploading, error: uploadError } = useUpload();
  const setAvatar = useM(api.users.setAvatar);
  const clearAvatar = useM(api.users.clearAvatar);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onPick(file: File) {
    setError(null);
    setSaving(true);
    try {
      const storageId = await upload(file);
      if (!storageId) return;
      await setAvatar({ storageId });
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setError(/(?::\s)(.*)/.exec(raw)?.[1] ?? 'Could not save that picture.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <Eyebrow className="mb-3">Profile picture</Eyebrow>
      <ImagePicker
        onPick={(file) => void onPick(file)}
        preview={me.avatarUrl}
        disabled={uploading || saving}
        label={me.avatarUrl ? 'Change picture' : 'Upload a picture'}
      />

      {(error ?? uploadError) && (
        <p role="alert" className="mt-2 text-xs text-events">
          {error ?? uploadError}
        </p>
      )}

      {me.avatarUrl && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          disabled={saving}
          onClick={() => void clearAvatar({})}
        >
          Remove picture
        </Button>
      )}

      <p className="mt-2 text-xs leading-relaxed text-faint">
        Without one you get a coloured tile with your initials, generated from your account — it
        stays the same everywhere, so people still recognise you.
      </p>
    </section>
  );
}

/**
 * Changing your own password.
 *
 * Requires the current one. An active session is proof that somebody signed in at
 * some point, not that the person at the keyboard is the account holder — and the
 * whole point of changing a password is usually that you think someone else knows
 * it. The mutation ends every other session on success, for the same reason.
 */
function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const change = useM(api.auth.changePassword);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
    setDone(false);
    onClose();
  }

  const mismatch = confirm.length > 0 && next !== confirm;
  const valid = current.length > 0 && next.length >= 8 && next === confirm;

  return (
    <Dialog
      open={open}
      onClose={reset}
      width="sm"
      title={done ? 'Password changed' : 'Change your password'}
      description={
        done ? undefined : 'Your other devices will be signed out and have to sign in again.'
      }
      footer={
        done ? (
          <Button onClick={reset}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={reset}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!valid}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await change({ currentPassword: current, newPassword: next });
                  setDone(true);
                } catch (err) {
                  const raw = err instanceof Error ? err.message : '';
                  setError(/(?::\s)(.*)/.exec(raw)?.[1] ?? 'Could not change your password.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Change password
            </Button>
          </>
        )
      }
    >
      {done ? (
        <p className="text-sm leading-relaxed text-dim">
          Done. This device stays signed in; everywhere else will need the new password.
        </p>
      ) : (
        <div className="space-y-4">
          <Field label="Current password">
            <Input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <Input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="Confirm new password" error={mismatch ? 'These do not match.' : undefined}>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>

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
