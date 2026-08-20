import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { api } from '@/lib/convexApi';
import { useQ } from '@/lib/convexHooks';
import { useMe } from '@/hooks/useMe';
import { useUi } from '@/stores/ui';
import { Avatar } from '@/components/ui';
import { CommandPalette } from '@/components/CommandPalette';
import { NotificationBell } from '@/components/NotificationBell';
import {
  IconBook,
  IconCalendar,
  IconCompass,
  IconHome,
  IconMessage,
  IconMoon,
  IconSearch,
  IconSun,
  IconTag,
  IconUsers,
} from '@/components/Icons';

interface SpaceSummary {
  id: string;
  name: string;
  type: string;
}

const PRIMARY = [
  { to: '/', label: 'Home', icon: IconHome, end: true },
  { to: '/explore', label: 'Explore', icon: IconCompass },
  { to: '/courses', label: 'Courses', icon: IconBook },
  { to: '/clubs', label: 'Clubs', icon: IconUsers },
  { to: '/calendar', label: 'Calendar', icon: IconCalendar },
  { to: '/marketplace', label: 'Market', icon: IconTag },
  { to: '/dms', label: 'Messages', icon: IconMessage },
];

/** Mobile gets the five that matter; the rest live behind Explore. */
const MOBILE = PRIMARY.filter((item) =>
  ['/', '/explore', '/courses', '/calendar', '/dms'].includes(item.to),
);

export function AppShell() {
  const me = useMe();
  const { theme, toggleTheme, setPaletteOpen } = useUi();
  const location = useLocation();

  // Live subscription: joining a space anywhere updates the rail immediately.
  const spaces = useQ<SpaceSummary[]>(api.spaces.mine);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPaletteOpen]);

  const isChat = location.pathname.startsWith('/spaces/') || location.pathname.startsWith('/dms');

  return (
    <div className="flex h-dvh overflow-hidden bg-ink">
      {/* ── Icon rail. Persistent, and the only navigation that never changes shape. */}
      <nav
        aria-label="Primary"
        className="hidden w-[4.5rem] shrink-0 flex-col items-center gap-1 border-r border-edge bg-panel py-3 md:flex"
      >
        <NavLink
          to="/"
          className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-accent font-display text-[0.9rem] font-bold text-white"
          aria-label="CampusConnect home"
        >
          CC
        </NavLink>

        <div className="my-1 h-px w-8 bg-edge" />

        {PRIMARY.map(({ to, label, icon: Icon, end }) => (
          <RailLink key={to} to={to} label={label} end={end}>
            <Icon />
          </RailLink>
        ))}

        {spaces && spaces.length > 0 && (
          <>
            <div className="my-1.5 h-px w-8 bg-edge" />
            <div className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto no-scrollbar">
              {spaces.slice(0, 14).map((space) => (
                <SpaceRailIcon key={space.id} space={space} />
              ))}
            </div>
          </>
        )}

        <div className="mt-auto flex flex-col items-center gap-1 pt-2">
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-dim transition hover:bg-raised hover:text-chalk"
            aria-label="Search (Ctrl K)"
          >
            <IconSearch />
          </button>
          <NotificationBell />
          <button
            onClick={toggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-dim transition hover:bg-raised hover:text-chalk"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          {me && (
            <NavLink
              to={`/u/${me.username}`}
              className="mt-0.5 rounded-full ring-offset-2 ring-offset-panel transition hover:ring-2 hover:ring-accent"
              aria-label="Your profile"
            >
              <Avatar name={me.displayName} src={me.avatarUrl} seed={me.id} size={32} />
            </NavLink>
          )}
        </div>
      </nav>

      {/* ── Content. Chat manages its own scrolling; everything else gets one column. */}
      <main className={cn('flex-1 overflow-hidden', !isChat && 'overflow-y-auto')}>
        {isChat ? (
          <Outlet />
        ) : (
          <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-8 md:pb-12">
            <Outlet />
          </div>
        )}
      </main>

      {/* ── Mobile bottom bar. */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-edge bg-panel/95 backdrop-blur md:hidden"
      >
        {MOBILE.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[0.625rem] font-medium transition',
                isActive ? 'text-accent' : 'text-dim',
              )
            }
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>

      <CommandPalette />
    </div>
  );
}

function RailLink({
  to,
  label,
  end,
  children,
}: {
  to: string;
  label: string;
  end?: boolean;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'group relative flex h-10 w-10 items-center justify-center rounded-lg transition',
          isActive ? 'bg-accent/15 text-accent-lift' : 'text-dim hover:bg-raised hover:text-chalk',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Active marker is a spine on the rail edge, not a pill — it reads as
              "you are here on this axis" rather than as a second button. */}
          {isActive && (
            <span className="absolute -left-3 h-5 w-[3px] rounded-r-full bg-accent" aria-hidden />
          )}
          {children}
          <span className="pointer-events-none absolute left-full z-40 ml-2 hidden whitespace-nowrap rounded-md border border-edge bg-raised px-2 py-1 text-xs text-chalk shadow-lg group-hover:block">
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

function SpaceRailIcon({ space }: { space: SpaceSummary }) {
  const TYPE_TONE: Record<string, string> = {
    CLUB: 'text-clubs',
    COURSE: 'text-courses',
    MAJOR: 'text-accent-lift',
  };
  // Course spaces show their code, everything else its initials — the code is more
  // recognisable at 40px than "CS 2210 — Data Structures…" ever could be.
  const label =
    space.type === 'COURSE'
      ? (space.name.split('—')[0] ?? space.name).trim().replace(/\s+/g, '')
      : space.name
          .split(/\s+/)
          .slice(0, 2)
          .map((w) => w[0])
          .join('');

  return (
    <NavLink
      to={`/spaces/${space.id}`}
      title={space.name}
      className={({ isActive }) =>
        cn(
          'group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[0.6rem] font-semibold transition',
          isActive
            ? 'border-accent/50 bg-accent/15 text-chalk'
            : cn(
                'border-edge bg-raised hover:border-faint/60',
                TYPE_TONE[space.type] ?? 'text-dim',
              ),
        )
      }
    >
      <span className="font-mono leading-none tracking-tight">{label.slice(0, 6)}</span>
      <span className="pointer-events-none absolute left-full z-40 ml-2 hidden max-w-[14rem] truncate whitespace-nowrap rounded-md border border-edge bg-raised px-2 py-1 text-xs text-chalk shadow-lg group-hover:block">
        {space.name}
      </span>
    </NavLink>
  );
}
