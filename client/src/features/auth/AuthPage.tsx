import { useState } from 'react';
import { loginSchema, registerSchema, type MeUser } from '@campusconnect/shared';
import { api, ApiRequestError } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { Button, Field, Input } from '@/components/ui';

type Mode = 'login' | 'register';

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setUser = useAuth((s) => s.setUser);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setFormError(null);

    const raw = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const schema = mode === 'login' ? loginSchema : registerSchema;
    const parsed = schema.safeParse(raw);

    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }

    setBusy(true);
    try {
      const user = await api.post<MeUser>(`/auth/${mode}`, parsed.data);
      setUser(user);
    } catch (err) {
      setFormError(
        err instanceof ApiRequestError ? err.message : "Couldn't reach the server. Is it running?",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ink lg:flex-row">
      {/* ── Left: the pitch. Set in the display face, tight, with the utility face
             carrying the institutional detail. */}
      <section className="relative flex flex-col justify-between overflow-hidden border-b border-edge bg-panel px-7 py-10 lg:w-[46%] lg:border-b-0 lg:border-r lg:px-14 lg:py-14">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-display text-sm font-bold text-white">
            CC
          </span>
          <span className="font-display text-[1.0625rem] font-semibold tracking-tight text-chalk">
            CampusConnect
          </span>
        </div>

        <div className="my-10 lg:my-0">
          <p className="eyebrow mb-4">Lakeshore University</p>
          <h1 className="max-w-md font-display text-display-lg text-chalk lg:text-display-xl">
            Everything your campus knows, in one place that outlives the semester.
          </h1>
          <p className="mt-5 max-w-sm text-[0.9375rem] leading-relaxed text-dim">
            Clubs, course notes, study groups and the people in them — organised by major and course
            code instead of buried in a group chat that dies in April.
          </p>
        </div>

        {/* Course codes in the utility face: the app's connective tissue, introduced
            here before it appears everywhere else. */}
        <ul className="flex flex-wrap gap-1.5">
          {['CS 2210', 'BIO 2581', 'MATH 1600', 'PSY 2820', 'MME 2273'].map((code) => (
            <li key={code} className="code-chip">
              {code}
            </li>
          ))}
        </ul>
      </section>

      {/* ── Right: the form. Nothing decorative — this screen has one job. */}
      <section className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-7">
            <h2 className="font-display text-display-md text-chalk">
              {mode === 'login' ? 'Sign in' : 'Make an account'}
            </h2>
            <p className="mt-1 text-sm text-dim">
              {mode === 'login'
                ? 'Use your Lakeshore email.'
                : 'One account per student. Your email stays private.'}
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field label="Email" error={errors.email}>
              <Input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@lakeshore.edu"
                required
              />
            </Field>

            {mode === 'register' && (
              <>
                <Field
                  label="Username"
                  hint="Lowercase letters, numbers and underscores."
                  error={errors.username}
                >
                  <Input
                    name="username"
                    autoComplete="username"
                    placeholder="mayaokafor"
                    required
                  />
                </Field>
                <Field label="Display name" error={errors.displayName}>
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
              error={errors.password}
            >
              <Input
                name="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </Field>

            {formError && (
              <p
                role="alert"
                className="rounded-lg border border-events/30 bg-events/10 px-3 py-2 text-sm text-events"
              >
                {formError}
              </p>
            )}

            <Button type="submit" size="lg" loading={busy} className="w-full">
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-dim">
            {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setErrors({});
                setFormError(null);
              }}
              className="font-medium text-accent-lift hover:underline"
            >
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>

          <p className="mt-8 rounded-lg border border-edge bg-raised/50 px-3 py-2.5 text-center font-mono text-[0.6875rem] leading-relaxed text-faint">
            Seeded demo · admin@lakeshore.edu · password123
          </p>
        </div>
      </section>
    </div>
  );
}
