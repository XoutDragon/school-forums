import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';
import { relativeTime } from '@/lib/utils';
import { Badge, Button, EmptyState, Field, Input, Skeleton, Textarea } from '@/components/ui';
import { ConfirmDialog, Dialog, Select } from '@/components/ui/overlays';
import { IconPlus, IconSearch, IconTrash } from '@/components/Icons';

/**
 * Space administration (feature 10).
 *
 * The interesting state here is the draft. An admin can create a Space for a club
 * that has no student running it yet, and it stays invisible — not listed, not
 * joinable, not searchable — until somebody is made owner. The brief asks for
 * exactly that, and it is the right behaviour: an ownerless space that students can
 * wander into is a dead room, and dead rooms make the whole directory feel dead.
 */

interface AdminSpace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  visibility: string;
  tags: string[];
  isPublished: boolean;
  createdAt: number;
  memberCount: number;
  channelCount: number;
  owner: { id: string; displayName: string; username: string } | null;
}

const TYPES = [
  { value: 'CLUB', label: 'Club' },
  { value: 'INTEREST', label: 'Interest group' },
  { value: 'GENERAL', label: 'General' },
  { value: 'RESIDENCE', label: 'Residence' },
];

export function AdminSpaces() {
  const [search, setSearch] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [assigning, setAssigning] = useState<AdminSpace | null>(null);
  const [deleting, setDeleting] = useState<AdminSpace | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spaces = useQ<AdminSpace[]>(api.admin.spaces, { search });
  const removeSpace = useM(api.spaces.remove);

  const drafts = (spaces ?? []).filter((s) => !s.isPublished);
  const published = (spaces ?? []).filter((s) => s.isPublished);

  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    try {
      await removeSpace({ spaceId: deleting.id });
      setDeleting(null);
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setError(/(?::\s)(.*)/.exec(raw)?.[1] ?? 'Could not delete that space.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-display-lg text-chalk">Spaces</h1>
          <p className="mt-1.5 text-[0.9375rem] text-dim">
            Create a space for a club before it has anyone to run it. It stays hidden until you hand
            it to an owner.
          </p>
        </div>
        <Button onClick={() => setDrafting(true)}>
          <IconPlus className="h-4 w-4" />
          New space
        </Button>
      </header>

      <div className="relative max-w-md">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search spaces"
          className="pl-9"
          aria-label="Search spaces"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-events/40 bg-events/[0.07] px-3 py-2.5 text-sm text-events"
        >
          {error}
        </p>
      )}

      {spaces === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : !spaces.length ? (
        <EmptyState
          title="No spaces yet"
          body="Draft one for a club that exists on paper but not in the app. Nobody sees it until it has an owner."
          action={<Button onClick={() => setDrafting(true)}>Create the first space</Button>}
        />
      ) : (
        <>
          {drafts.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-chalk">
                Waiting for an owner{' '}
                <span className="font-mono text-xs font-normal text-faint">({drafts.length})</span>
              </h2>
              <p className="mb-3 text-xs text-dim">
                Invisible to students. Assign an owner to publish.
              </p>
              <SpaceTable spaces={drafts} onAssign={setAssigning} onDelete={setDeleting} />
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold text-chalk">
              Published{' '}
              <span className="font-mono text-xs font-normal text-faint">({published.length})</span>
            </h2>
            <SpaceTable spaces={published} onAssign={setAssigning} onDelete={setDeleting} />
          </section>
        </>
      )}

      {drafting && <DraftDialog onClose={() => setDrafting(false)} />}
      {assigning && <AssignDialog space={assigning} onClose={() => setAssigning(null)} />}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={doDelete}
        busy={busy}
        title={`Delete "${deleting?.name ?? ''}"?`}
        body={`Every channel, message, pin and membership in this space is removed permanently. ${
          deleting?.memberCount ?? 0
        } ${deleting?.memberCount === 1 ? 'person is' : 'people are'} in it. This is written to the activity log and cannot be undone.`}
        confirmLabel="Delete space"
      />
    </div>
  );
}

function SpaceTable({
  spaces,
  onAssign,
  onDelete,
}: {
  spaces: AdminSpace[];
  onAssign: (space: AdminSpace) => void;
  onDelete: (space: AdminSpace) => void;
}) {
  if (!spaces.length) {
    return (
      <p className="rounded-xl border border-dashed border-edge px-4 py-6 text-center text-sm text-faint">
        Nothing here.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-panel">
      <ul className="divide-y divide-edge">
        {spaces.map((space) => (
          <li key={space.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-[12rem] flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {space.isPublished ? (
                  <Link
                    to={`/spaces/${space.id}`}
                    className="text-sm font-medium text-chalk hover:underline"
                  >
                    {space.name}
                  </Link>
                ) : (
                  <span className="text-sm font-medium text-chalk">{space.name}</span>
                )}
                <Badge>{space.type.replace('_', ' ').toLowerCase()}</Badge>
                {space.visibility === 'PRIVATE' && <Badge tone="clubs">private</Badge>}
                {!space.isPublished && <Badge tone="events">unclaimed</Badge>}
              </div>
              <p className="mt-0.5 truncate text-xs text-faint">
                /{space.slug} · {space.memberCount} {space.memberCount === 1 ? 'member' : 'members'}{' '}
                · {space.channelCount} channels · created {relativeTime(space.createdAt)}
              </p>
            </div>

            <div className="hidden w-40 shrink-0 text-xs sm:block">
              {space.owner ? (
                <>
                  <span className="block text-faint">owner</span>
                  <span className="block truncate text-dim">@{space.owner.username}</span>
                </>
              ) : (
                <span className="text-faint">no owner</span>
              )}
            </div>

            <div className="flex shrink-0 gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => onAssign(space)}>
                {space.isPublished ? 'Change owner' : 'Assign owner'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete ${space.name}`}
                onClick={() => onDelete(space)}
              >
                <IconTrash className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DraftDialog({ onClose }: { onClose: () => void }) {
  const draft = useM(api.admin.draftSpace);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('CLUB');
  const [visibility, setVisibility] = useState('PUBLIC');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await draft({
        name,
        description: description || undefined,
        type,
        visibility,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onClose();
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setError(/(?::\s)(.*)/.exec(raw)?.[1] ?? 'Could not create that space.');
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Draft a space"
      description="Created hidden. It appears to students the moment you assign an owner."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={name.trim().length < 3} onClick={submit}>
            Create draft
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Chess Club"
            autoFocus
          />
        </Field>
        <Field label="Description" hint="Shown in the directory once it is published.">
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Casual games on Wednesdays, ladder play on Saturdays."
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind">
            <Select value={type} onChange={setType} options={TYPES} />
          </Field>
          <Field label="Visibility">
            <Select
              value={visibility}
              onChange={setVisibility}
              options={[
                { value: 'PUBLIC', label: 'Public — anyone can join' },
                { value: 'PRIVATE', label: 'Private — invite only' },
              ]}
            />
          </Field>
        </div>
        <Field label="Tags" hint="Comma separated. Used by discovery and the club quiz.">
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="games, strategy, social"
          />
        </Field>

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

function AssignDialog({ space, onClose }: { space: AdminSpace; onClose: () => void }) {
  const assign = useM(api.admin.assignSpaceOwner);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = useQ<{ id: string; username: string; displayName: string }[]>(
    api.users.searchByName,
    username.trim().length >= 2 ? { term: username, limit: 6 } : 'skip',
  );

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await assign({ spaceId: space.id, username: username.trim().toLowerCase() });
      onClose();
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setError(/(?::\s)(.*)/.exec(raw)?.[1] ?? 'Could not assign that owner.');
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      width="sm"
      title={space.isPublished ? 'Change the owner' : 'Assign an owner'}
      description={
        space.isPublished
          ? `The current owner of "${space.name}" keeps admin rights.`
          : `"${space.name}" becomes visible to students as soon as it has an owner.`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={username.trim().length < 3} onClick={submit}>
            {space.isPublished ? 'Change owner' : 'Assign and publish'}
          </Button>
        </>
      }
    >
      <Field label="Student username" hint="They are notified, and land in the space as its owner.">
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          placeholder="mayaokafor"
          autoFocus
        />
      </Field>

      {matches && matches.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {matches.map((match) => (
            <li key={match.id}>
              <button
                onClick={() => setUsername(match.username)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-raised"
              >
                <span className="text-chalk">{match.displayName}</span>
                <span className="font-mono text-xs text-faint">@{match.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-events/40 bg-events/[0.07] px-3 py-2.5 text-sm text-events"
        >
          {error}
        </p>
      )}
    </Dialog>
  );
}
