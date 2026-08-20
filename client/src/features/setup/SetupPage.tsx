import { useState } from 'react';
import { convex, setSessionToken } from '@/lib/convex';
import { api } from '@/lib/convexApi';
import { Button, Field, Input, Textarea } from '@/components/ui';
import { Switch } from '@/components/ui/overlays';
import { cn } from '@/lib/utils';
import { IconBuilding, IconCheck, IconKey, IconShield } from '@/components/Icons';

/**
 * First-run setup (feature 6).
 *
 * Shown to whoever reaches a deployment that has no `instanceConfig` row. This is
 * the IT administrator, and this screen is the only thing the app will render until
 * they finish — there is no student experience to fall back to, because there is no
 * campus yet.
 *
 * Three steps rather than one long form, because the three groups answer to
 * different people: what the institution is called, who is allowed in, and who
 * holds the keys. Splitting them makes the middle one — the email-domain gate —
 * impossible to scroll past, which is the one that matters most and the one a
 * single form would bury.
 */

type Step = 0 | 1 | 2;

const STEPS = [
  { title: 'The institution', icon: IconBuilding, blurb: 'What this campus is called.' },
  { title: 'Who gets in', icon: IconShield, blurb: 'Email domains and registration.' },
  { title: 'Administrator', icon: IconKey, blurb: 'Your account.' },
];

function defaultTerm(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (m <= 3) return `${y}WI`;
  if (m <= 5) return `${y}SP`;
  if (m <= 7) return `${y}SU`;
  return `${y}FA`;
}

export function SetupPage() {
  const [step, setStep] = useState<Step>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [schoolName, setSchoolName] = useState('');
  const [shortName, setShortName] = useState('');
  const [tagline, setTagline] = useState('');
  const [currentTerm, setCurrentTerm] = useState(defaultTerm());

  const [domainText, setDomainText] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [allowSelfRegistration, setAllowSelfRegistration] = useState(true);
  const [allowStudentSpaces, setAllowStudentSpaces] = useState(true);

  const [adminDisplayName, setAdminDisplayName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPassword2, setAdminPassword2] = useState('');

  const domains = domainText
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@+/, ''))
    .filter(Boolean);

  const stepValid =
    step === 0
      ? schoolName.trim().length >= 2 && /^\d{4}(FA|WI|SP|SU)$/.test(currentTerm.toUpperCase())
      : step === 1
        ? true
        : adminDisplayName.trim().length >= 2 &&
          /^[a-z0-9_]{3,24}$/.test(adminUsername) &&
          /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail) &&
          adminPassword.length >= 8 &&
          adminPassword === adminPassword2;

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const result = await convex.mutation(api.config.initialize, {
        schoolName: schoolName.trim(),
        shortName: shortName.trim() || schoolName.trim().split(/\s+/)[0]!,
        allowedEmailDomains: domains,
        tagline: tagline.trim() || undefined,
        supportEmail: supportEmail.trim() || undefined,
        currentTerm: currentTerm.toUpperCase(),
        allowStudentSpaces,
        allowSelfRegistration,
        adminEmail: adminEmail.trim().toLowerCase(),
        adminDisplayName: adminDisplayName.trim(),
        adminUsername: adminUsername.trim().toLowerCase(),
        adminPassword,
      });
      // Signed in as the administrator immediately — asking them to log in to the
      // account they just made, on the machine they just made it on, is friction
      // that buys nothing.
      setSessionToken(result.token);
      window.location.href = '/admin';
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      const match = /(?:BAD_REQUEST|CONFLICT|FORBIDDEN|NOT_FOUND): (.*)/.exec(raw);
      setError(match?.[1] ?? 'Could not reach Convex. Is the deployment running?');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ink lg:flex-row">
      {/* ── Left: where you are in the process. ─────────────────────────────── */}
      <aside className="border-b border-edge bg-panel px-7 py-8 lg:w-[24rem] lg:shrink-0 lg:border-b-0 lg:border-r lg:px-10 lg:py-12">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent font-display text-sm font-bold text-white">
            CC
          </span>
          <span className="font-display text-[1.0625rem] font-semibold text-chalk">
            CampusConnect
          </span>
        </div>

        <h1 className="mt-8 font-display text-display-lg text-chalk">Set up your campus</h1>
        <p className="mt-2 text-sm leading-relaxed text-dim">
          This deployment has not been claimed yet. Three steps and it belongs to your institution.
        </p>

        <ol className="mt-8 space-y-1">
          {STEPS.map((entry, index) => {
            const Icon = entry.icon;
            const done = index < step;
            const active = index === step;
            return (
              <li key={entry.title}>
                <div
                  className={cn(
                    'flex items-start gap-3 rounded-lg px-3 py-2.5 transition',
                    active && 'nav-active',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[0.6875rem]',
                      done
                        ? 'border-courses bg-courses text-white'
                        : active
                          ? 'border-accent text-accent-lift'
                          : 'border-edge text-faint',
                    )}
                  >
                    {done ? <IconCheck className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        'flex items-center gap-1.5 text-sm font-medium',
                        active ? 'text-chalk' : done ? 'text-dim' : 'text-faint',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {entry.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-faint">{entry.blurb}</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>

        <p className="mt-10 rounded-lg border border-edge bg-raised px-3 py-2.5 text-xs leading-relaxed text-dim">
          Anyone who reaches this deployment before you finish can claim it. If this instance is
          already on a public address, complete setup now.
        </p>
      </aside>

      {/* ── Right: the current step. ────────────────────────────────────────── */}
      <main className="flex flex-1 items-start justify-center px-6 py-10 lg:items-center lg:py-14">
        <div className="w-full max-w-md">
          {step === 0 && (
            <div className="space-y-5">
              <header>
                <h2 className="font-display text-display-md text-chalk">The institution</h2>
                <p className="mt-1 text-sm text-dim">
                  This appears on the sign-in screen and throughout the app.
                </p>
              </header>

              <Field label="School name">
                <Input
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="Lakeshore University"
                  autoFocus
                />
              </Field>
              <Field
                label="Short name"
                hint="Used where space is tight. Defaults to the first word."
              >
                <Input
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  placeholder="Lakeshore"
                />
              </Field>
              <Field
                label="Current term"
                hint="Four-digit year plus FA, WI, SP or SU. Course pages group by this."
              >
                <Input
                  value={currentTerm}
                  onChange={(e) => setCurrentTerm(e.target.value.toUpperCase())}
                  placeholder="2026FA"
                  className="font-mono"
                />
              </Field>
              <Field label="Tagline" hint="Optional. One line on the sign-in screen.">
                <Textarea
                  rows={2}
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="Everything your campus knows, in one place."
                />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <header>
                <h2 className="font-display text-display-md text-chalk">Who gets in</h2>
                <p className="mt-1 text-sm text-dim">
                  The domain list is the only thing standing between your campus community and the
                  open internet.
                </p>
              </header>

              <Field
                label="Allowed email domains"
                hint="One per line, or comma separated. Leave empty to accept any email."
              >
                <Textarea
                  rows={3}
                  value={domainText}
                  onChange={(e) => setDomainText(e.target.value)}
                  placeholder={'lakeshore.edu\nstudent.lakeshore.edu'}
                  className="font-mono text-[0.8125rem]"
                />
              </Field>

              {domains.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {domains.map((domain) => (
                    <span key={domain} className="code-chip">
                      @{domain}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-events/40 bg-events/[0.07] px-3 py-2.5 text-xs leading-relaxed text-events">
                  With no domains listed, anyone with any email address can register. That is fine
                  for a demo and wrong for a live campus.
                </p>
              )}

              <Field label="Support email" hint="Optional. Shown to students who get stuck.">
                <Input
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="help@lakeshore.edu"
                  type="email"
                />
              </Field>

              <div className="space-y-1 rounded-xl border border-edge bg-panel p-4">
                <Switch
                  checked={allowSelfRegistration}
                  onChange={setAllowSelfRegistration}
                  label="Students can create their own accounts"
                  hint="Off means only you can add people, from the admin dashboard."
                />
                <Switch
                  checked={allowStudentSpaces}
                  onChange={setAllowStudentSpaces}
                  label="Students can create spaces"
                  hint="Off means clubs and interest groups are created by admins and handed to an owner."
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <header>
                <h2 className="font-display text-display-md text-chalk">
                  Your administrator account
                </h2>
                <p className="mt-1 text-sm text-dim">
                  This account can see the dashboard, the audit log and every account. Keep the
                  password somewhere real.
                </p>
              </header>

              <Field label="Your name">
                <Input
                  value={adminDisplayName}
                  onChange={(e) => setAdminDisplayName(e.target.value)}
                  placeholder="Dana Whitfield"
                  autoFocus
                />
              </Field>
              <Field label="Username" hint="Lowercase letters, numbers and underscores.">
                <Input
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value.toLowerCase())}
                  placeholder="dwhitfield"
                />
              </Field>
              <Field
                label="Email"
                hint={
                  domains.length
                    ? `Must be on ${domains.map((d) => `@${d}`).join(' or ')}.`
                    : 'Any email, since no domains are restricted.'
                }
              >
                <Input
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  type="email"
                  placeholder="it@lakeshore.edu"
                />
              </Field>
              <Field label="Password" hint="At least 8 characters.">
                <Input
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                />
              </Field>
              <Field
                label="Confirm password"
                error={
                  adminPassword2 && adminPassword !== adminPassword2
                    ? 'These do not match.'
                    : undefined
                }
              >
                <Input
                  value={adminPassword2}
                  onChange={(e) => setAdminPassword2(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                />
              </Field>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mt-5 rounded-lg border border-events/40 bg-events/[0.07] px-3 py-2.5 text-sm text-events"
            >
              {error}
            </p>
          )}

          <div className="mt-7 flex items-center gap-2">
            {step > 0 && (
              <Button variant="secondary" onClick={() => setStep((s) => (s - 1) as Step)}>
                Back
              </Button>
            )}
            {step < 2 ? (
              <Button
                className="flex-1"
                disabled={!stepValid}
                onClick={() => setStep((s) => (s + 1) as Step)}
              >
                Continue
              </Button>
            ) : (
              <Button className="flex-1" disabled={!stepValid} loading={busy} onClick={finish}>
                Finish setup
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
