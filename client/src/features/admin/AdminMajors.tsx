import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';
import { Badge, Button, EmptyState, Field, Input, Skeleton, Textarea } from '@/components/ui';
import { Dialog, Switch } from '@/components/ui/overlays';
import { IconPlus } from '@/components/Icons';

/**
 * Majors (feature 10).
 *
 * Adding a major creates its community Space at the same time, with the six
 * channels section 5.3 specifies. The two are not separable in practice: a major
 * without its Space is a dropdown entry, and students who pick it during onboarding
 * land nowhere.
 */

interface MajorRow {
  id: string;
  name: string;
  faculty: string;
  description: string;
  studentCount: number;
  spaceId: string | null;
}

export function AdminMajors() {
  const majors = useQ<MajorRow[]>(api.admin.majors);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MajorRow | null>(null);

  const byFaculty = new Map<string, MajorRow[]>();
  for (const major of majors ?? []) {
    const list = byFaculty.get(major.faculty) ?? [];
    list.push(major);
    byFaculty.set(major.faculty, list);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-display-lg text-chalk">Majors</h1>
          <p className="mt-1.5 text-[0.9375rem] text-dim">
            Each major gets a community space with the standard channel set. Students pick one
            during onboarding.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <IconPlus className="h-4 w-4" />
          Add a major
        </Button>
      </header>

      {majors === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : !majors.length ? (
        <EmptyState
          title="No majors yet"
          body="Onboarding asks every student for their major. Until one exists, that step has nothing to offer."
          action={<Button onClick={() => setCreating(true)}>Add the first major</Button>}
        />
      ) : (
        <div className="space-y-6">
          {[...byFaculty.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([faculty, rows]) => (
              <section key={faculty}>
                <h2 className="mb-2 text-sm font-semibold text-chalk">{faculty || 'Unassigned'}</h2>
                <div className="overflow-hidden rounded-xl border border-edge bg-panel">
                  <ul className="divide-y divide-edge">
                    {rows.map((major) => (
                      <li key={major.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <div className="min-w-[12rem] flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium text-chalk">{major.name}</span>
                            {major.spaceId ? (
                              <Link to={`/spaces/${major.spaceId}`}>
                                <Badge tone="courses">has a space</Badge>
                              </Link>
                            ) : (
                              <Badge tone="events">no space</Badge>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-xs text-faint">
                            {major.description || 'No description.'}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-xs text-faint">
                          {major.studentCount} {major.studentCount === 1 ? 'student' : 'students'}
                        </span>
                        <Button size="sm" variant="secondary" onClick={() => setEditing(major)}>
                          Edit
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            ))}
        </div>
      )}

      {creating && (
        <MajorDialog faculties={[...byFaculty.keys()]} onClose={() => setCreating(false)} />
      )}
      {editing && (
        <MajorDialog
          existing={editing}
          faculties={[...byFaculty.keys()]}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function MajorDialog({
  existing,
  faculties,
  onClose,
}: {
  existing?: MajorRow;
  faculties: string[];
  onClose: () => void;
}) {
  const createMajor = useM(api.admin.createMajor);
  const updateMajor = useM(api.admin.updateMajor);

  const [name, setName] = useState(existing?.name ?? '');
  const [faculty, setFaculty] = useState(existing?.faculty ?? faculties[0] ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [createSpace, setCreateSpace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (existing) await updateMajor({ majorId: existing.id, name, faculty, description });
      else await createMajor({ name, faculty, description, createSpace });
      onClose();
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setError(/(?::\s)(.*)/.exec(raw)?.[1] ?? 'Could not save that major.');
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={existing ? `Edit ${existing.name}` : 'Add a major'}
      description={
        existing
          ? 'Renaming a major does not rename its space.'
          : 'Students pick this during onboarding and it groups course pages.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={name.trim().length < 2} onClick={submit}>
            {existing ? 'Save changes' : 'Add major'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Computer Science"
            autoFocus
          />
        </Field>
        <Field label="Faculty" hint="Groups majors on the explore page.">
          <Input
            value={faculty}
            onChange={(e) => setFaculty(e.target.value)}
            placeholder="Faculty of Science"
            list="faculty-suggestions"
          />
          <datalist id="faculty-suggestions">
            {faculties.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </Field>
        <Field label="Description" hint="One or two sentences. Shown on the major's page.">
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Algorithms, systems and the theory underneath both."
          />
        </Field>

        {!existing && (
          <div className="rounded-xl border border-edge bg-raised/50 p-3">
            <Switch
              checked={createSpace}
              onChange={setCreateSpace}
              label="Create the community space too"
              hint="Six channels: general, course-help, internships-careers, memes, anonymous, resources."
            />
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-events/40 bg-events/[0.07] px-3 py-2.5 text-sm text-events"
          >
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
