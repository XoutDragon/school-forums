import { Link, useParams } from 'react-router-dom';
import type { EventDto, PublicUser } from '@campusconnect/shared';
import { Avatar, Badge, Button, Card, Eyebrow, Skeleton } from '@/components/ui';
import { IconMapPin } from '@/components/Icons';
import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';

type EventDetail = EventDto & { attendees: PublicUser[] };

export function EventPage() {
  const { id } = useParams();

  const event = useQ<EventDetail>(api.events.get, id ? { eventId: id } : 'skip');
  const isLoading = event === undefined;

  const sendRsvp = useM(api.events.rsvp);
  const rsvp = async (status: 'GOING' | 'INTERESTED' | 'DECLINED') => {
    if (id) await sendRsvp({ eventId: id, status });
  };

  if (isLoading || !event) return <Skeleton className="h-96 w-full" />;

  const starts = new Date(event.startsAt);
  const ends = new Date(event.endsAt);
  const isPast = ends < new Date();

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="events">{event.hostType.toLowerCase()}</Badge>
          <span className="text-xs text-dim">hosted by {event.hostName}</span>
          {isPast && <Badge>finished</Badge>}
        </div>
        <h1 className="mt-2.5 font-display text-display-lg text-chalk">{event.title}</h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card className="flex flex-wrap gap-6">
            <div>
              <Eyebrow>When</Eyebrow>
              <p className="mt-1.5 text-sm text-chalk">
                {starts.toLocaleDateString('en-CA', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              <p className="font-mono text-sm text-events">
                {starts.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })} –{' '}
                {ends.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
            <div className="min-w-0">
              <Eyebrow>Where</Eyebrow>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-chalk">
                <IconMapPin className="h-3.5 w-3.5 shrink-0 text-faint" />
                {event.location}
              </p>
              {event.locationDetail && (
                <p className="mt-0.5 text-xs text-dim">{event.locationDetail}</p>
              )}
            </div>
            {event.capacity && (
              <div>
                <Eyebrow>Capacity</Eyebrow>
                <p className="mt-1.5 font-mono text-sm text-chalk">
                  {event.goingCount}
                  <span className="text-faint"> / {event.capacity}</span>
                </p>
              </div>
            )}
          </Card>

          {event.description && (
            <section>
              <Eyebrow>About</Eyebrow>
              <p className="mt-2 whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-chalk/95">
                {event.description}
              </p>
            </section>
          )}

          {event.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {event.tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-5">
          <Card>
            {event.socialProof && (
              <p className="mb-3 text-sm text-accent-lift">{event.socialProof}</p>
            )}
            <div className="flex gap-2">
              <Button
                className="flex-1"
                variant={event.myRsvp === 'GOING' ? 'secondary' : 'primary'}
                onClick={() => void rsvp(event.myRsvp === 'GOING' ? 'DECLINED' : 'GOING')}
              >
                {event.myRsvp === 'GOING' ? "You're going" : 'Going'}
              </Button>
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => void rsvp(event.myRsvp === 'INTERESTED' ? 'DECLINED' : 'INTERESTED')}
              >
                {event.myRsvp === 'INTERESTED' ? 'Interested' : 'Maybe'}
              </Button>
            </div>
            <p className="mt-2.5 font-mono text-[0.625rem] text-faint">
              {event.goingCount} going · {event.interestedCount} interested
            </p>
          </Card>

          {event.attendees.length > 0 && (
            <section>
              <Eyebrow>Who's going</Eyebrow>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {event.attendees.map((person) => (
                  <Link key={person.id} to={`/u/${person.username}`} title={person.displayName}>
                    <Avatar
                      name={person.displayName}
                      src={person.avatarUrl}
                      seed={person.id}
                      size={34}
                    />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
