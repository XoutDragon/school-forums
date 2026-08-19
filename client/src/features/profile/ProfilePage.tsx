import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeUser, PublicUser } from '@campusconnect/shared';
import { api } from '@/lib/api';
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
import { IconWave } from '@/components/Icons';

interface Profile extends PublicUser {
  bio: string | null;
  joinedAt: string;
  badges: { key: string; name: string; emoji: string; description: string; awardedAt: string }[];
  courses: { status: string; term: string; course: { id: string; code: string; title: string } }[];
  clubs: { id: string; name: string; slug: string; category: string; role: string }[];
  spaces: { id: string; name: string; slug: string; type: string }[];
  canWave: boolean;
  canDm: boolean;
}

export function ProfilePage() {
  const { username } = useParams();
  const me = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', username],
    queryFn: () => api.get<Profile>(`/users/${username}`),
    enabled: Boolean(username),
  });

  if (isLoading || !profile) return <Skeleton className="h-96 w-full" />;

  const isSelf = me?.id === profile.id;

  const wave = async () => {
    await api.post(`/users/${profile.id}/wave`, {});
    void queryClient.invalidateQueries({ queryKey: ['profile', username] });
  };

  const message = async () => {
    const conversation = await api.post<{ id: string }>('/dms', { userIds: [profile.id] });
    navigate(`/dms/${conversation.id}`);
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
              <Button variant="ghost" onClick={() => void logout()}>
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
            </>
          )}
        </div>
      </header>

      {editing && isSelf && me && <EditProfile me={me} onDone={() => setEditing(false)} />}

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

function EditProfile({ me, onDone }: { me: MeUser; onDone: () => void }) {
  const setUser = useAuth((s) => s.setUser);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const form = new FormData(e.currentTarget);
          const updated = await api.patch<MeUser>('/auth/me', {
            displayName: form.get('displayName'),
            bio: form.get('bio') || null,
            pronouns: form.get('pronouns') || null,
            settings: {
              discoverable: form.get('discoverable') === 'on',
              showCourses: form.get('showCourses') === 'on',
              dmPrivacy: form.get('dmPrivacy'),
            },
          });
          setUser(updated);
          await queryClient.invalidateQueries({ queryKey: ['profile', me.username] });
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

        <Button type="submit" loading={busy}>
          Save changes
        </Button>
      </form>
    </Card>
  );
}
