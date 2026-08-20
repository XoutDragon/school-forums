import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/convexApi';
import { useM, usePublicQ } from '@/lib/convexHooks';
import { cn } from '@/lib/utils';
import { Button, Field, Input, Textarea } from '@/components/ui';
import { Dialog, Switch } from '@/components/ui/overlays';

/**
 * Creating a space (feature 1).
 *
 * Two kinds are offered and the distinction is not cosmetic. A **club** is a
 * chartered thing with execs and a listing in the directory; an **interest group**
 * is four people who like bouldering. Making students pick tells the directory
 * which is which, and stops the club list filling up with study-buddy pairs.
 *
 * Course and major spaces are absent on purpose — those come from the catalogue,
 * and a second "CS 2210" would split the exact conversation the catalogue exists to
 * gather.
 */

interface InstanceConfig {
  allowStudentSpaces: boolean;
  schoolName: string;
}

const KINDS = [
  {
    value: 'INTEREST',
    label: 'Interest group',
    blurb: 'A few people who share a thing. No paperwork, no execs.',
  },
  {
    value: 'CLUB',
    label: 'Club',
    blurb: 'A recognised society with people running it. Appears in the club directory.',
  },
  {
    value: 'GENERAL',
    label: 'General',
    blurb: 'Anything else — a residence floor, a project, a cohort.',
  },
] as const;

export function CreateSpaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const config = usePublicQ<InstanceConfig | null>(api.config.get);
  const create = useM(api.spaces.create);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<(typeof KINDS)[number]['value']>('INTEREST');
  const [tags, setTags] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = config?.allowStudentSpaces === false;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const spaceId = (await create({
        name: name.trim(),
        description: description.trim() || undefined,
        type: kind,
        visibility: isPrivate ? 'PRIVATE' : 'PUBLIC',
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      })) as string;

      onClose();
      setName('');
      setDescription('');
      setTags('');
      navigate(`/spaces/${spaceId}`);
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setError(/(?::\s)(.*)/.exec(raw)?.[1] ?? 'Could not create that space.');
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Start a space"
      description={
        blocked
          ? undefined
          : 'You will be its owner: you set the channels, decide who is in it, and hand out roles.'
      }
      footer={
        blocked ? (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={busy} disabled={name.trim().length < 3} onClick={submit}>
              Create space
            </Button>
          </>
        )
      }
    >
      {blocked ? (
        <p className="text-sm leading-relaxed text-dim">
          {config?.schoolName ?? 'This campus'} keeps space creation with the IT team. Ask them to
          set one up — they can create it and hand it straight to you as owner.
        </p>
      ) : (
        <div className="space-y-5">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Thursday Climbing"
              autoFocus
            />
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium text-chalk">What kind of space is it?</p>
            <div className="space-y-1.5">
              {KINDS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-xl border p-3 transition',
                    kind === option.value
                      ? 'border-accent bg-accent-wash'
                      : 'border-edge bg-panel hover:bg-raised',
                  )}
                >
                  <input
                    type="radio"
                    name="space-kind"
                    value={option.value}
                    checked={kind === option.value}
                    onChange={() => setKind(option.value)}
                    className="mt-0.5 accent-[rgb(var(--accent))]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-chalk">{option.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-dim">
                      {option.blurb}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <Field
            label="Description"
            hint="One or two lines. This is what people read when deciding to join."
          >
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Bouldering at the campus wall on Thursday evenings. Beginners very welcome — half of us started this term."
            />
          </Field>

          <Field label="Tags" hint="Comma separated. How people find you when browsing.">
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="climbing, outdoors, beginners"
            />
          </Field>

          <div className="rounded-xl border border-edge bg-raised/50 p-3">
            <Switch
              checked={isPrivate}
              onChange={setIsPrivate}
              label="Invite only"
              hint="Private spaces stay out of discovery. You add people by username."
            />
          </div>

          <p className="text-xs leading-relaxed text-faint">
            Four channels are created to start with — general, announcements, resources and a voice
            lounge. Change them any time in space settings.
          </p>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-events/40 bg-events/[0.07] px-3 py-2.5 text-sm text-events"
            >
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
