import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NotificationDto } from '@campusconnect/shared';
import { cn, relativeTime } from '@/lib/utils';
import { IconBell } from '@/components/Icons';
import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';

interface Feed {
  items: NotificationDto[];
  unread: number;
}

/** Copy is written per type rather than from a generic template — "Maya waved at you"
 *  is a different event from "Maya replied", and a template would flatten both. */
function describe(n: NotificationDto): { text: string; href: string } {
  const p = n.payload as Record<string, string>;
  switch (n.type) {
    case 'MENTION':
      return {
        text: `${p.from} mentioned you: “${p.excerpt}”`,
        href: `/spaces/${p.spaceId}/${p.channelId}`,
      };
    case 'WAVE':
      return {
        text: p.context ? `${p.name} waved at you from ${p.context}` : `${p.name} waved at you`,
        href: `/u/${p.username}`,
      };
    case 'WAVE_MUTUAL':
      return {
        text: `You and ${p.name} both waved. Start a chat?`,
        href: `/u/${p.username ?? ''}`,
      };
    case 'STUDY_GROUP_REQUEST':
      return { text: `${p.name} asked to join ${p.groupName}`, href: '/study' };
    case 'STUDY_GROUP_APPROVED':
      return { text: `You're in — ${p.groupName} accepted you`, href: '/study' };
    case 'EVENT_REMINDER':
      return {
        text: `${p.title} starts in an hour at ${p.location}`,
        href: `/events/${p.eventId}`,
      };
    case 'MENTOR_REQUEST':
      return { text: `${p.name} asked you to mentor them`, href: '/mentors' };
    case 'MENTOR_ACCEPTED':
      return { text: 'Your mentor request was accepted', href: `/dms/${p.conversationId}` };
    case 'BADGE_EARNED':
      return { text: `${p.emoji} You earned ${p.name}`, href: '/' };
    case 'BUDDY_CONNECTED':
      return { text: 'You have a new study buddy — say hello', href: `/dms/${p.conversationId}` };
    case 'ANNOUNCEMENT':
      return { text: `${p.clubName}: ${p.excerpt}`, href: '/clubs' };
    default:
      return { text: 'Something happened', href: '/' };
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const data = useQ<Feed>(api.notifications.list);
  const markOneRead = useM(api.notifications.markRead);
  const markAll = useM(api.notifications.markAllRead);

  // No socket listener: api.notifications.list is a subscription, so an insert on
  // the server re-runs it here and the badge updates itself.

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const unread = data?.unread ?? 0;

  const markAllRead = async () => {
    await markAll({});
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-dim transition hover:bg-raised hover:text-chalk"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <IconBell />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-events px-1 font-mono text-[0.5625rem] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute bottom-0 left-full z-50 ml-3 w-80 overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl animate-rise-in"
        >
          <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
            <h2 className="text-sm font-semibold text-chalk">Notifications</h2>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-accent-lift hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {!data?.items.length ? (
              <p className="px-4 py-10 text-center text-sm text-faint">
                Nothing yet. Waves, mentions and replies land here.
              </p>
            ) : (
              data.items.map((n) => {
                const { text, href } = describe(n);
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      void markOneRead({ notificationId: n.id });
                      setOpen(false);
                      navigate(href);
                    }}
                    className={cn(
                      'block w-full border-b border-edge/60 px-4 py-3 text-left transition last:border-0 hover:bg-raised',
                      !n.readAt && 'bg-accent/[0.05]',
                    )}
                  >
                    <p className="text-[0.8125rem] leading-snug text-chalk">{text}</p>
                    <p className="mt-1 font-mono text-[0.625rem] text-faint">
                      {relativeTime(n.createdAt)}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
