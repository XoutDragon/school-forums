import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { api } from '@/lib/convexApi';
import { usePublicQ } from '@/lib/convexHooks';
import { useMe } from '@/hooks/useMe';
import { useUi } from '@/stores/ui';
import { Avatar } from '@/components/ui';
import {
  IconBuilding,
  IconGauge,
  IconHome,
  IconList,
  IconMenu,
  IconMoon,
  IconSettings,
  IconShield,
  IconSun,
  IconUsers,
} from '@/components/Icons';

/**
 * Administration shell.
 *
 * Modelled on the shadcn sidebar block: a collapsible rail with labelled groups, a
 * header that identifies the tenant, a footer with the signed-in account, and a
 * sticky content header carrying the breadcrumb. What that pattern gets right, and
 * why it is worth copying here, is that it separates *where you are* (rail) from
 * *what you are looking at* (header) — a dashboard with six sections and no such
 * split turns into a wall of tabs by the third one.
 *
 * Collapsed, the rail keeps icons and drops labels rather than disappearing. An
 * admin who collapsed it to see a wide table still needs to move between sections.
 */

interface InstanceConfig {
  schoolName: string;
  shortName: string;
}

const NAV: {
  group: string;
  items: { to: string; label: string; icon: typeof IconGauge; end?: boolean }[];
}[] = [
  {
    group: 'Campus',
    items: [
      { to: '/admin', label: 'Overview', icon: IconGauge, end: true },
      { to: '/admin/logs', label: 'Activity log', icon: IconList },
    ],
  },
  {
    group: 'Manage',
    items: [
      { to: '/admin/members', label: 'Members', icon: IconUsers },
      { to: '/admin/spaces', label: 'Spaces', icon: IconShield },
      { to: '/admin/majors', label: 'Majors', icon: IconBuilding },
    ],
  },
  {
    group: 'Instance',
    items: [{ to: '/admin/settings', label: 'Settings', icon: IconSettings }],
  },
];

const CRUMBS: Record<string, string> = {
  '/admin': 'Overview',
  '/admin/logs': 'Activity log',
  '/admin/members': 'Members',
  '/admin/spaces': 'Spaces',
  '/admin/majors': 'Majors',
  '/admin/settings': 'Settings',
};

export function AdminLayout() {
  const me = useMe();
  const location = useLocation();
  const config = usePublicQ<InstanceConfig | null>(api.config.get);
  const { adminSidebarOpen, toggleAdminSidebar, theme, toggleTheme } = useUi();

  const crumb =
    CRUMBS[location.pathname] ??
    (location.pathname.startsWith('/admin/members/') ? 'Member' : 'Administration');

  return (
    <div className="flex h-dvh overflow-hidden bg-ink">
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-edge bg-panel transition-[width] md:flex',
          adminSidebarOpen ? 'w-64' : 'w-[4.25rem]',
        )}
      >
        {/* ── Tenant header. Names the campus, because an admin with two deployments
               open needs to know which one they are about to change. */}
        <div className="flex items-center gap-2.5 border-b border-edge px-3 py-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent font-display text-sm font-bold text-white">
            {(config?.shortName ?? 'CC').slice(0, 2).toUpperCase()}
          </span>
          {adminSidebarOpen && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-chalk">
                {config?.schoolName ?? 'CampusConnect'}
              </span>
              <span className="block font-mono text-[0.625rem] uppercase tracking-wider text-faint">
                administration
              </span>
            </span>
          )}
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
          {NAV.map((section) => (
            <div key={section.group}>
              {adminSidebarOpen && (
                <p className="px-2 pb-1.5 font-mono text-[0.625rem] uppercase tracking-wider text-faint">
                  {section.group}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map(({ to, label, icon: Icon, end }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={end}
                      title={adminSidebarOpen ? undefined : label}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition',
                          !adminSidebarOpen && 'justify-center',
                          isActive ? 'nav-active' : 'text-dim hover:bg-raised hover:text-chalk',
                        )
                      }
                    >
                      <Icon className="h-[1.05rem] w-[1.05rem] shrink-0" />
                      {adminSidebarOpen && <span className="truncate">{label}</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-edge p-2">
          <NavLink
            to="/"
            title="Back to the student app"
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-dim transition hover:bg-raised hover:text-chalk',
              !adminSidebarOpen && 'justify-center',
            )}
          >
            <IconHome className="h-[1.05rem] w-[1.05rem] shrink-0" />
            {adminSidebarOpen && <span>Student view</span>}
          </NavLink>

          {me && (
            <div
              className={cn(
                'mt-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2',
                !adminSidebarOpen && 'justify-center',
              )}
            >
              <Avatar name={me.displayName} src={me.avatarUrl} seed={me.id} size={26} />
              {adminSidebarOpen && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-medium text-chalk">
                    {me.displayName}
                  </span>
                  <span className="block truncate text-[0.6875rem] text-faint">{me.email}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Sticky content header with the breadcrumb, exactly where the block
               pattern puts it. */}
        <header className="flex shrink-0 items-center gap-3 border-b border-edge bg-panel/80 px-4 py-3 backdrop-blur">
          <button
            onClick={toggleAdminSidebar}
            aria-label={adminSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-expanded={adminSidebarOpen}
            className="hidden rounded-lg p-1.5 text-dim transition hover:bg-raised hover:text-chalk md:block"
          >
            <IconMenu />
          </button>

          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden text-dim sm:inline">Administration</span>
            <span aria-hidden className="hidden text-faint sm:inline">
              /
            </span>
            <span className="truncate font-medium text-chalk">{crumb}</span>
          </nav>

          <button
            onClick={toggleTheme}
            className="ml-auto rounded-lg p-1.5 text-dim transition hover:bg-raised hover:text-chalk"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
        </header>

        {/* ── Mobile section switcher. The rail is desktop-only; on a phone the
               sections become a scrolling strip rather than vanishing. */}
        <div className="flex gap-1 overflow-x-auto border-b border-edge bg-panel px-3 py-2 no-scrollbar md:hidden">
          {NAV.flatMap((section) => section.items).map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
                  isActive ? 'nav-active' : 'text-dim',
                )
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </NavLink>
          ))}
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
