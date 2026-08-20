import { Link, useParams } from 'react-router-dom';
import type { PublicUser } from '@campusconnect/shared';
import { Avatar, Badge, Button, Card, EmptyState, Eyebrow, Skeleton } from '@/components/ui';
import { IconMapPin } from '@/components/Icons';
import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';

interface ClubDetail {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  logoUrl: string | null;
  meetingInfo: string | null;
  isRecruiting: boolean;
  socialLinks: Record<string, string>;
  memberCount: number;
  spaceId: string | null;
  myRole: string | null;
  execs: { role: string; user: PublicUser }[];
  events: { id: string; title: string; startsAt: number; location: string }[];
  photos: { url: string; name: string }[];
}

export function ClubPage() {
  const { slug } = useParams();

  const club = useQ<ClubDetail>(api.clubs.getBySlug, slug ? { slug } : 'skip');
  const isLoading = club === undefined;

  const join = useM(api.clubs.setMembership);
  const leaveClub = useM(api.clubs.leave);

  const setMembership = async (role: 'MEMBER' | 'FOLLOWER' | null) => {
    if (!club) return;
    if (role) await join({ clubId: club.id, role });
    else await leaveClub({ clubId: club.id });
  };

  if (isLoading || !club) return <Skeleton className="h-96 w-full" />;

  const isExec = club.myRole === 'PRESIDENT' || club.myRole === 'EXEC';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start gap-5">
        <Avatar name={club.name} src={club.logoUrl} seed={club.id} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="clubs">{club.category.toLowerCase()}</Badge>
            {club.isRecruiting && <Badge tone="courses">recruiting now</Badge>}
          </div>
          <h1 className="mt-2 font-display text-display-lg text-chalk">{club.name}</h1>
          <p className="mt-1 font-mono text-xs text-faint">{club.memberCount} members</p>
        </div>

        <div className="flex gap-2">
          {club.myRole ? (
            <>
              {club.spaceId && (
                <Link to={`/spaces/${club.spaceId}`}>
                  <Button>Open space</Button>
                </Link>
              )}
              <Button variant="secondary" onClick={() => void setMembership(null)}>
                Leave
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => void setMembership('FOLLOWER')}>
                Follow
              </Button>
              <Button onClick={() => void setMembership('MEMBER')}>Join club</Button>
            </>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <section>
            <Eyebrow>About</Eyebrow>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-chalk/95">
              {club.description}
            </p>
          </section>

          {club.photos.length > 0 && (
            <section>
              <Eyebrow>Recently in the space</Eyebrow>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {club.photos.map((photo) => (
                  <img
                    key={photo.url}
                    src={photo.url}
                    alt=""
                    className="h-28 w-40 shrink-0 rounded-lg border border-edge object-cover"
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <Eyebrow>Upcoming</Eyebrow>
            {club.events.length === 0 ? (
              <div className="mt-2">
                <EmptyState
                  title="Nothing on the calendar"
                  body={
                    isExec
                      ? "Post an event and it lands in every member's week view."
                      : 'This club has not scheduled anything yet. Following means you hear when they do.'
                  }
                />
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {club.events.map((event) => (
                  <Link
                    key={event.id}
                    to={`/events/${event.id}`}
                    className="flex items-center gap-4 rounded-xl border border-edge bg-panel p-3.5 transition hover:border-events/40"
                  >
                    <div className="w-14 shrink-0 text-center">
                      <span className="block font-mono text-[0.5625rem] uppercase tracking-wider text-events">
                        {new Date(event.startsAt).toLocaleDateString('en-CA', { month: 'short' })}
                      </span>
                      <span className="block font-display text-xl leading-tight text-chalk">
                        {new Date(event.startsAt).getDate()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-chalk">{event.title}</p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-dim">
                        <IconMapPin className="h-3 w-3 shrink-0" />
                        {event.location}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          {club.meetingInfo && (
            <Card>
              <Eyebrow>When they meet</Eyebrow>
              <p className="mt-2 text-sm text-chalk">{club.meetingInfo}</p>
            </Card>
          )}

          <section>
            <Eyebrow>Who runs it</Eyebrow>
            <div className="mt-2 space-y-1.5">
              {club.execs.map(({ role, user }) => (
                <Link
                  key={user.id}
                  to={`/u/${user.username}`}
                  className="flex items-center gap-2.5 rounded-lg border border-edge bg-panel px-3 py-2 transition hover:border-faint/50"
                >
                  <Avatar name={user.displayName} src={user.avatarUrl} seed={user.id} size={30} />
                  <span className="min-w-0 flex-1 truncate text-sm text-chalk">
                    {user.displayName}
                  </span>
                  <span className="shrink-0 font-mono text-[0.5625rem] uppercase tracking-wide text-clubs">
                    {role}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {Object.keys(club.socialLinks).length > 0 && (
            <Card>
              <Eyebrow>Elsewhere</Eyebrow>
              <ul className="mt-2 space-y-1">
                {Object.entries(club.socialLinks).map(([platform, handle]) => (
                  <li key={platform} className="text-sm text-dim">
                    <span className="font-mono text-[0.625rem] uppercase text-faint">
                      {platform}
                    </span>{' '}
                    {handle}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {isExec && <ExecPanel clubId={club.id} />}
        </aside>
      </div>
    </div>
  );
}

/** §5.4 exec mini-dashboard. Announcing cross-posts to the space and pings followers. */
function ExecPanel({ clubId }: { clubId: string }) {
  const announce = useM(api.clubs.announce);

  return (
    <Card className="border-clubs/30">
      <Eyebrow className="text-clubs">Exec tools</Eyebrow>
      <form
        className="mt-2.5 space-y-2.5"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const content = new FormData(form).get('content') as string;
          await announce({ clubId, content });
          form.reset();
        }}
      >
        <textarea
          name="content"
          rows={3}
          required
          minLength={5}
          placeholder="Announce something to members and followers…"
          className="w-full resize-none rounded-lg border border-edge bg-raised px-3 py-2 text-sm text-chalk outline-none focus:border-clubs/60"
        />
        <Button type="submit" size="sm" className="w-full">
          Post announcement
        </Button>
      </form>
      <p className="mt-2 text-xs text-dim">
        Goes to the announcements channel and notifies everyone who follows the club.
      </p>
    </Card>
  );
}
