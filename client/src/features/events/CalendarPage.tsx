import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { EventDto } from '@campusconnect/shared';
import { api, qs } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, EmptyState, Eyebrow, Skeleton } from '@/components/ui';
import { IconMapPin } from '@/components/Icons';

export function CalendarPage() {
  const [view, setView] = useState<'list' | 'month'>('list');
  const [mine, setMine] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);

  const anchor = new Date();
  anchor.setMonth(anchor.getMonth() + monthOffset);

  const range =
    view === 'month'
      ? {
          from: new Date(anchor.getFullYear(), anchor.getMonth(), 1).toISOString(),
          to: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59).toISOString(),
        }
      : {};

  const { data: events, isLoading } = useQuery({
    queryKey: ['events', view, mine, monthOffset],
    queryFn: () => api.get<EventDto[]>(`/events${qs({ ...range, mine })}`),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-display-lg text-chalk">Calendar</h1>
          <p className="mt-1.5 text-[0.9375rem] text-dim">
            Everything happening across clubs, spaces and the campus at large.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-dim">
            <input
              type="checkbox"
              checked={mine}
              onChange={(e) => setMine(e.target.checked)}
              className="accent-[rgb(var(--events))]"
            />
            My clubs only
          </label>
          <div className="flex rounded-lg border border-edge p-0.5">
            {(['list', 'month'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setView(option)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium capitalize transition',
                  view === option ? 'bg-raised text-chalk' : 'text-dim hover:text-chalk',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : view === 'month' ? (
        <MonthView
          anchor={anchor}
          events={events ?? []}
          onShift={(delta) => setMonthOffset((m) => m + delta)}
        />
      ) : !events?.length ? (
        <EmptyState
          title="Nothing scheduled"
          body={
            mine
              ? 'None of your clubs have anything coming up. Turn off the filter to see the rest of campus.'
              : 'The calendar is empty. If you run a club, an event here shows up in every member’s week.'
          }
        />
      ) : (
        <ListView events={events} />
      )}
    </div>
  );
}

function ListView({ events }: { events: EventDto[] }) {
  // Group by day so the list reads as a calendar rather than a feed.
  const byDay = events.reduce<Record<string, EventDto[]>>((acc, event) => {
    const key = new Date(event.startsAt).toDateString();
    (acc[key] ??= []).push(event);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(byDay).map(([day, dayEvents]) => (
        <section key={day}>
          <Eyebrow className="mb-2.5">
            {new Date(day).toLocaleDateString('en-CA', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Eyebrow>
          <div className="space-y-2">
            {dayEvents.map((event) => (
              <Link key={event.id} to={`/events/${event.id}`}>
                <Card className="flex flex-wrap items-center gap-4 transition hover:border-events/40">
                  <span className="w-16 shrink-0 font-mono text-sm text-events">
                    {new Date(event.startsAt).toLocaleTimeString('en-CA', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-chalk">{event.title}</h3>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-dim">
                      <IconMapPin className="h-3 w-3 shrink-0" />
                      {event.location}
                      <span className="text-faint">· {event.hostName}</span>
                    </p>
                    {event.socialProof && (
                      <p className="mt-1 text-xs text-accent-lift">{event.socialProof}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {event.myRsvp === 'GOING' && <Badge tone="courses">going</Badge>}
                    {event.myRsvp === 'INTERESTED' && <Badge>interested</Badge>}
                    <span className="font-mono text-[0.625rem] text-faint">
                      {event.goingCount} going
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MonthView({
  anchor,
  events,
  onShift,
}: {
  anchor: Date;
  events: EventDto[];
  onShift: (delta: number) => void;
}) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first, matching the home page's week.
  const leadingBlanks = (firstDay.getDay() + 6) % 7;
  const today = new Date();

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-display-md text-chalk">
          {anchor.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => onShift(-1)}>
            Previous
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onShift(1)}>
            Next
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <div
            key={day}
            className="pb-1 text-center font-mono text-[0.5625rem] uppercase tracking-wider text-faint"
          >
            {day}
          </div>
        ))}

        {Array.from({ length: leadingBlanks }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => {
          const date = new Date(year, month, i + 1);
          const dayEvents = events.filter(
            (e) => new Date(e.startsAt).toDateString() === date.toDateString(),
          );
          const isToday = date.toDateString() === today.toDateString();

          return (
            <div
              key={i}
              className={cn(
                'min-h-20 rounded-lg border border-edge/70 bg-panel/60 p-1.5',
                isToday && 'border-accent/40 bg-accent/[0.06]',
              )}
            >
              <span
                className={cn('font-display text-xs', isToday ? 'text-accent-lift' : 'text-dim')}
              >
                {i + 1}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayEvents.slice(0, 2).map((event) => (
                  <Link
                    key={event.id}
                    to={`/events/${event.id}`}
                    className="block truncate rounded bg-events/15 px-1 py-0.5 text-[0.625rem] text-events hover:bg-events/25"
                  >
                    {event.title}
                  </Link>
                ))}
                {dayEvents.length > 2 && (
                  <span className="block px-1 font-mono text-[0.5625rem] text-faint">
                    +{dayEvents.length - 2}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
