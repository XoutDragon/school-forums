import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { api } from '@/lib/convexApi';
import { usePublicQ } from '@/lib/convexHooks';

interface InstanceConfig {
  schoolName: string;
  shortName: string;
  supportEmail: string | null;
}

/**
 * Shell for the two policy documents.
 *
 * Reachable signed out, because someone deciding whether to make an account is
 * exactly the person who should be able to read them. The institution's name is
 * substituted from the instance config rather than hardcoded — one deployment is
 * one campus, and the policy has to name that campus.
 */
export function LegalLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const config = usePublicQ<InstanceConfig | null>(api.config.get);
  const location = useLocation();

  return (
    <div className="min-h-dvh bg-ink">
      <header className="border-b border-edge bg-panel">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-5 py-3.5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent font-display text-xs font-bold text-white">
              {(config?.shortName ?? 'CC').slice(0, 2).toUpperCase()}
            </span>
            <span className="text-sm font-semibold text-chalk">
              {config?.schoolName ?? 'CampusConnect'}
            </span>
          </Link>

          <nav className="ml-auto flex gap-1 text-sm">
            {[
              { to: '/terms', label: 'Terms' },
              { to: '/privacy', label: 'Privacy' },
            ].map((entry) => (
              <Link
                key={entry.to}
                to={entry.to}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 transition',
                  location.pathname === entry.to
                    ? 'nav-active'
                    : 'text-dim hover:bg-raised hover:text-chalk',
                )}
              >
                {entry.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 md:py-14">
        <p className="eyebrow">{config?.schoolName ?? 'CampusConnect'}</p>
        <h1 className="mt-2 font-display text-display-lg text-chalk">{title}</h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-dim">{subtitle}</p>

        <div className="mt-6 rounded-xl border border-clubs/40 bg-clubs/[0.07] px-4 py-3.5">
          <p className="text-sm leading-relaxed text-chalk">
            <strong className="font-semibold">This is a template, not legal advice.</strong> It was
            written to match what this deployment actually stores and does, so it is a truthful
            starting point — but it has not been reviewed by a lawyer, and it does not yet reference
            your institution&rsquo;s own student conduct code, records policy, or the privacy law
            you operate under. Have counsel and your registrar review it before students rely on it.
          </p>
        </div>

        <article className="legal mt-9">{children}</article>

        <footer className="mt-14 border-t border-edge pt-6 text-sm text-dim">
          <p>
            Questions about this document go to{' '}
            {config?.supportEmail ? (
              <a
                href={`mailto:${config.supportEmail}`}
                className="text-accent-lift hover:underline"
              >
                {config.supportEmail}
              </a>
            ) : (
              'your campus IT team'
            )}
            .
          </p>
          <Link to="/" className="mt-2 inline-block text-accent-lift hover:underline">
            Back to {config?.shortName ?? 'CampusConnect'}
          </Link>
        </footer>
      </main>
    </div>
  );
}

/** Section heading plus body, so the two documents read identically. */
export function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-9">
      <h2 className="flex items-baseline gap-2.5 font-display text-display-md text-chalk">
        <span className="font-mono text-sm text-faint">{n}</span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[0.9375rem] leading-relaxed text-dim">{children}</div>
    </section>
  );
}

/** The recurring "here is the actual table" callout. Naming the storage is the
 *  difference between a policy and a description. */
export function DataNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-edge bg-panel px-3.5 py-2.5 font-mono text-[0.75rem] leading-relaxed text-dim">
      {children}
    </p>
  );
}
