import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { convex } from '@/lib/convex';
import { api } from '@/lib/convexApi';
import { usePublicQ } from '@/lib/convexHooks';
import { useAuth } from '@/stores/auth';
import { useMe } from '@/hooks/useMe';
import { Button, Field, Input } from '@/components/ui';
import { IconShield } from '@/components/Icons';
import { cn } from '@/lib/utils';

type Mode = 'login' | 'register' | 'admin' | 'reset';

interface InstanceConfig {
  schoolName: string;
  shortName: string;
  allowedEmailDomains: string[];
  tagline: string | null;
  supportEmail: string | null;
  allowSelfRegistration: boolean;
}

/** Convex surfaces thrown errors as "CODE: sentence". Students should see the sentence. */
function readableError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : '';
  const match = /(?:BAD_REQUEST|CONFLICT|UNAUTHORIZED|FORBIDDEN|NOT_FOUND|RATE_LIMITED): (.*)/.exec(
    raw,
  );
  return match?.[1] ?? fallback;
}

export function AuthPage() {
  const me = useMe();
  const config = usePublicQ<InstanceConfig | null>(api.config.get);

  const [mode, setMode] = useState<Mode>('login');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = useAuth((s) => s.signIn);
  const registerUser = useAuth((s) => s.register);

  if (me) return <Navigate to={me.onboardedAt ? '/' : '/onboarding'} replace />;

  const isAdminMode = mode === 'admin';
  const domainHint = config?.allowedEmailDomains.length
    ? `Use your ${config.allowedEmailDomains.map((d) => `@${d}`).join(' or ')} address.`
    : undefined;

  function switchMode(next: Mode) {
    setMode(next);
    setErrors({});
    setFormError(null);
    setNotice(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setNotice(null);

    const form = new FormData(e.currentTarget);
    // FormData values are typed loosely; every field below is `required` in the
    // markup, so an empty string is the only thing a missing one can be.
    const raw = (key: string) => String(form.get(key) ?? '');
    setBusy(true);

    try {
      if (mode === 'reset') {
        if (raw('password') !== raw('confirm')) {
          setErrors({ confirm: 'These do not match.' });
          return;
        }
        await convex.mutation(api.auth.redeemPasswordReset, {
          code: raw('code'),
          newPassword: raw('password'),
        });
        switchMode('login');
        setNotice('Password set. Sign in with it now.');
        return;
      }

      if (mode === 'register') {
        await registerUser({
          email: raw('email'),
          username: raw('username'),
          displayName: raw('displayName'),
          password: raw('password'),
        });
        return;
      }

      // login and admin differ only in whether a non-admin account is refused.
      await signIn(raw('email'), raw('password'), isAdminMode);
    } catch (err) {
      setFormError(
        readableError(err, 'Could not reach the campus server. Is the Convex deployment running?'),
      );
    } finally {
      setBusy(false);
    }
  }

  const heading =
    mode === 'login'
      ? 'Sign in'
      : mode === 'register'
        ? 'Create your account'
        : mode === 'admin'
          ? 'Administrator sign-in'
          : 'Set a new password';

  const subheading =
    mode === 'login'
      ? (domainHint ?? 'Use your school email.')
      : mode === 'register'
        ? 'One account per student. Your email stays private.'
        : mode === 'admin'
          ? 'For campus IT staff. Student accounts are refused here.'
          : 'Paste the reset code your campus IT team gave you.';

  return (
    <div className="flex min-h-dvh flex-col bg-ink lg:flex-row">
      {/* ── Left: the institution. Quieter than the previous version — this is
             software the registrar deployed, not a product being pitched. */}
      <section
        className={cn(
          'relative flex flex-col justify-between border-b border-edge px-7 py-10 lg:w-[44%] lg:border-b-0 lg:border-r lg:px-14 lg:py-14',
          isAdminMode ? 'bg-chalk/[0.03]' : 'bg-panel',
        )}
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent font-display text-sm font-bold text-white">
            {(config?.shortName ?? 'CC').slice(0, 2).toUpperCase()}
          </span>
          <span className="font-display text-[1.0625rem] font-semibold text-chalk">
            {config?.shortName ?? 'CampusConnect'}
          </span>
        </div>

        <div className="my-10 lg:my-0">
          <p className="eyebrow mb-4">{config?.schoolName ?? 'CampusConnect'}</p>
          <h1 className="max-w-md font-display text-display-lg text-chalk lg:text-display-xl">
            {config?.tagline ??
              'Everything your campus knows, in one place that outlives the semester.'}
          </h1>
          <p className="mt-5 max-w-sm text-[0.9375rem] leading-relaxed text-dim">
            Clubs, course notes, study groups and the people in them — organised by major and course
            code instead of buried in a group chat that dies in April.
          </p>
        </div>

        <ul className="flex flex-wrap gap-1.5">
          {['Spaces', 'Course hubs', 'Study groups', 'Events', 'Marketplace'].map((label) => (
            <li key={label} className="code-chip">
              {label}
            </li>
          ))}
        </ul>
      </section>

      {/* ── Right: the form. This screen has one job. */}
      <section className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-7">
            {isAdminMode && (
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-edge bg-raised px-2 py-1 font-mono text-[0.625rem] uppercase tracking-wider text-dim">
                <IconShield className="h-3 w-3" />
                staff access
              </span>
            )}
            <h2 className="font-display text-display-md text-chalk">{heading}</h2>
            <p className="mt-1 text-sm text-dim">{subheading}</p>
          </div>

          {notice && (
            <p className="mb-4 rounded-lg border border-courses/40 bg-courses/[0.08] px-3 py-2.5 text-sm text-courses">
              {notice}
            </p>
          )}

          <form onSubmit={onSubmit} className="space-y-4" noValidate key={mode}>
            {mode === 'reset' ? (
              <>
                <Field label="Reset code" hint="Three groups of four characters.">
                  <Input
                    name="code"
                    required
                    placeholder="A7KD-2M9P-XQ4T"
                    className="font-mono tracking-wider"
                    autoComplete="one-time-code"
                  />
                </Field>
                <Field label="New password" hint="At least 8 characters.">
                  <Input name="password" type="password" autoComplete="new-password" required />
                </Field>
                <Field label="Confirm new password" error={errors.confirm}>
                  <Input name="confirm" type="password" autoComplete="new-password" required />
                </Field>
              </>
            ) : (
              <>
                <Field label="Email" hint={mode === 'register' ? domainHint : undefined}>
                  <Input
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder={
                      config?.allowedEmailDomains[0]
                        ? `you@${config.allowedEmailDomains[0]}`
                        : 'you@school.edu'
                    }
                    required
                  />
                </Field>

                {mode === 'register' && (
                  <>
                    <Field label="Username" hint="Lowercase letters, numbers and underscores.">
                      <Input
                        name="username"
                        autoComplete="username"
                        placeholder="mayaokafor"
                        required
                      />
                    </Field>
                    <Field label="Display name">
                      <Input
                        name="displayName"
                        autoComplete="name"
                        placeholder="Maya Okafor"
                        required
                      />
                    </Field>
                  </>
                )}

                <Field
                  label="Password"
                  hint={mode === 'register' ? 'At least 8 characters.' : undefined}
                >
                  <Input
                    name="password"
                    type="password"
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    required
                  />
                </Field>
              </>
            )}

            {formError && (
              <p
                role="alert"
                className="rounded-lg border border-events/40 bg-events/[0.07] px-3 py-2.5 text-sm text-events"
              >
                {formError}
              </p>
            )}

            <Button type="submit" size="lg" loading={busy} className="w-full">
              {mode === 'register'
                ? 'Create account'
                : mode === 'reset'
                  ? 'Set password'
                  : 'Sign in'}
            </Button>
          </form>

          {mode !== 'reset' && (
            <p className="mt-6 text-center text-sm text-dim">
              {mode === 'register' ? (
                <>
                  Already have an account?{' '}
                  <button
                    onClick={() => switchMode('login')}
                    className="font-medium text-accent-lift hover:underline"
                  >
                    Sign in
                  </button>
                </>
              ) : config?.allowSelfRegistration === false ? (
                <>Accounts are created by campus IT.</>
              ) : (
                <>
                  New here?{' '}
                  <button
                    onClick={() => switchMode('register')}
                    className="font-medium text-accent-lift hover:underline"
                  >
                    Create an account
                  </button>
                </>
              )}
            </p>
          )}

          {/* ── The small print. The administrator door lives here deliberately: it
                 is a staff entrance, so it is findable rather than advertised. */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-t border-edge pt-5 text-xs text-faint">
            {isAdminMode || mode === 'reset' ? (
              <button
                onClick={() => switchMode('login')}
                className="hover:text-dim hover:underline"
              >
                Back to student sign-in
              </button>
            ) : (
              <button
                onClick={() => switchMode('admin')}
                className="hover:text-dim hover:underline"
              >
                Administrator sign-in
              </button>
            )}
            <span aria-hidden className="text-edge">
              ·
            </span>
            <button onClick={() => switchMode('reset')} className="hover:text-dim hover:underline">
              I have a reset code
            </button>
            <span aria-hidden className="text-edge">
              ·
            </span>
            <a href="/privacy" className="hover:text-dim hover:underline">
              Privacy
            </a>
            <span aria-hidden className="text-edge">
              ·
            </span>
            <a href="/terms" className="hover:text-dim hover:underline">
              Terms
            </a>
          </div>

          {config?.supportEmail && (
            <p className="mt-4 text-center text-xs text-faint">
              Locked out?{' '}
              <a href={`mailto:${config.supportEmail}`} className="text-dim hover:underline">
                {config.supportEmail}
              </a>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
