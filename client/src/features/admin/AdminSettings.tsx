import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/convexApi';
import { useM, usePublicQ } from '@/lib/convexHooks';
import { Button, Card, Eyebrow, Field, Input, Skeleton, Textarea } from '@/components/ui';
import { Switch } from '@/components/ui/overlays';

/**
 * Instance settings (feature 6, after the fact).
 *
 * Everything the first-run wizard asked, editable. The email-domain list is the one
 * with teeth — emptying it opens registration to any address on the internet, so it
 * says so rather than quietly accepting the change.
 */

interface InstanceConfig {
  schoolName: string;
  shortName: string;
  allowedEmailDomains: string[];
  tagline: string | null;
  supportEmail: string | null;
  currentTerm: string;
  allowStudentSpaces: boolean;
  allowSelfRegistration: boolean;
  setupCompletedAt: number;
}

export function AdminSettings() {
  const config = usePublicQ<InstanceConfig | null>(api.config.get);
  const update = useM(api.config.update);

  const [form, setForm] = useState<{
    schoolName: string;
    shortName: string;
    tagline: string;
    supportEmail: string;
    currentTerm: string;
    domainText: string;
    allowStudentSpaces: boolean;
    allowSelfRegistration: boolean;
  } | null>(null);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config || form) return;
    setForm({
      schoolName: config.schoolName,
      shortName: config.shortName,
      tagline: config.tagline ?? '',
      supportEmail: config.supportEmail ?? '',
      currentTerm: config.currentTerm,
      domainText: config.allowedEmailDomains.join('\n'),
      allowStudentSpaces: config.allowStudentSpaces,
      allowSelfRegistration: config.allowSelfRegistration,
    });
  }, [config, form]);

  if (!form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }

  const domains = form.domainText
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@+/, ''))
    .filter(Boolean);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  async function save() {
    if (!form) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await update({
        schoolName: form.schoolName,
        shortName: form.shortName,
        tagline: form.tagline,
        supportEmail: form.supportEmail,
        currentTerm: form.currentTerm.toUpperCase(),
        allowedEmailDomains: domains,
        allowStudentSpaces: form.allowStudentSpaces,
        allowSelfRegistration: form.allowSelfRegistration,
      });
      setNotice('Saved. Changes are live for everyone immediately.');
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setError(/(?::\s)(.*)/.exec(raw)?.[1] ?? 'Could not save those settings.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-display-lg text-chalk">Settings</h1>
        <p className="mt-1.5 text-[0.9375rem] text-dim">
          Instance-wide. Everything here applies to every account on this deployment.
        </p>
      </header>

      {notice && (
        <p className="rounded-lg border border-courses/40 bg-courses/[0.08] px-3 py-2.5 text-sm text-courses">
          {notice}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-events/40 bg-events/[0.07] px-3 py-2.5 text-sm text-events"
        >
          {error}
        </p>
      )}

      <Card className="space-y-4">
        <Eyebrow>Identity</Eyebrow>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="School name">
            <Input value={form.schoolName} onChange={(e) => set('schoolName', e.target.value)} />
          </Field>
          <Field label="Short name" hint="Used in the rail and on the sign-in card.">
            <Input value={form.shortName} onChange={(e) => set('shortName', e.target.value)} />
          </Field>
        </div>
        <Field label="Tagline" hint="One line on the sign-in screen.">
          <Textarea
            rows={2}
            value={form.tagline}
            onChange={(e) => set('tagline', e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Current term" hint="Course pages and resources group by this.">
            <Input
              value={form.currentTerm}
              onChange={(e) => set('currentTerm', e.target.value.toUpperCase())}
              className="font-mono"
            />
          </Field>
          <Field label="Support email" hint="Shown to students who cannot sign in.">
            <Input
              type="email"
              value={form.supportEmail}
              onChange={(e) => set('supportEmail', e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <Eyebrow>Access</Eyebrow>
        <Field
          label="Allowed email domains"
          hint="One per line. Registration rejects anything else."
        >
          <Textarea
            rows={3}
            value={form.domainText}
            onChange={(e) => set('domainText', e.target.value)}
            className="font-mono text-[0.8125rem]"
          />
        </Field>

        {domains.length ? (
          <div className="flex flex-wrap gap-1.5">
            {domains.map((domain) => (
              <span key={domain} className="code-chip">
                @{domain}
              </span>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-events/40 bg-events/[0.07] px-3 py-2.5 text-xs leading-relaxed text-events">
            With no domains listed, anyone with any email address can register on this campus.
          </p>
        )}

        <div className="border-t border-edge pt-2">
          <Switch
            checked={form.allowSelfRegistration}
            onChange={(v) => set('allowSelfRegistration', v)}
            label="Students can create their own accounts"
            hint="Off closes registration. Existing accounts keep working."
          />
          <Switch
            checked={form.allowStudentSpaces}
            onChange={(v) => set('allowStudentSpaces', v)}
            label="Students can create spaces"
            hint="Off means clubs and interest groups come from this dashboard and get handed to an owner."
          />
        </div>
      </Card>

      <Card className="space-y-3">
        <Eyebrow>Policies</Eyebrow>
        <p className="text-sm leading-relaxed text-dim">
          The terms of service and privacy policy are served from this deployment and describe the
          data it actually stores. Read them before you point students at this app — they name what
          is collected and what your administrators can see.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to="/terms">
            <Button size="sm" variant="secondary">
              Terms of service
            </Button>
          </Link>
          <Link to="/privacy">
            <Button size="sm" variant="secondary">
              Privacy policy
            </Button>
          </Link>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button loading={busy} onClick={save}>
          Save settings
        </Button>
        <span className="text-xs text-faint">
          Campus set up{' '}
          {config ? new Date(config.setupCompletedAt).toLocaleDateString('en-CA') : ''}
        </span>
      </div>
    </div>
  );
}
