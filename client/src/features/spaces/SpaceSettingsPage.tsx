import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';
import { cn, relativeTime } from '@/lib/utils';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Eyebrow,
  Field,
  Input,
  Skeleton,
  Tabs,
  Textarea,
} from '@/components/ui';
import { ConfirmDialog, Dialog, Select, Switch } from '@/components/ui/overlays';
import { IconChevron, IconPlus, IconTrash } from '@/components/Icons';
import type { SpacePermissions } from '@/features/chat/SpacePage';

/**
 * Space settings (feature 3).
 *
 * Whoever creates a space runs it: they set the channels, manage who is in it, and
 * mint roles. The permission model behind this is in convex/lib/permissions.ts —
 * the short version is that the four-rank ladder decides structural authority and
 * custom roles only ever add capabilities on top.
 *
 * `manageRoles` is deliberately absent from the permission checkboxes. A role that
 * can edit roles can grant itself everything, which would make every other
 * restriction on this page decorative.
 */

type Tab = 'overview' | 'channels' | 'members' | 'roles' | 'danger';

interface SpaceDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  tags: string[];
  visibility: string;
  isPublished: boolean;
  memberCount: number;
  myRole: string | null;
  myPermissions: SpacePermissions;
  isCampusAdmin: boolean;
  channels: {
    id: string;
    name: string;
    topic: string | null;
    type: string;
    position: number;
    isDefault: boolean;
  }[];
}

interface RoleRow {
  id: string;
  name: string;
  color: string;
  position: number;
  permissions: SpacePermissions;
  memberCount: number;
}

interface MemberRow {
  role: string;
  nickname: string | null;
  joinedAt: number;
  roles: { id: string; name: string; color: string; position: number }[];
  user: { id: string; username: string; displayName: string; avatarUrl: string | null };
}

const CHANNEL_TYPES = [
  { value: 'TEXT', label: 'Text — ordinary conversation' },
  { value: 'ANNOUNCEMENT', label: 'Announcement — admins post, members react' },
  { value: 'RESOURCES', label: 'Resources — files and links' },
  { value: 'QA', label: 'Q&A — questions with accepted answers' },
  { value: 'ANONYMOUS', label: 'Anonymous — names replaced with animal aliases' },
  { value: 'VOICE_STUB', label: 'Voice — live audio, no messages' },
];

const PERMISSION_LABELS: { key: keyof SpacePermissions; label: string; hint: string }[] = [
  { key: 'manageChannels', label: 'Manage channels', hint: 'Create, rename and delete channels.' },
  { key: 'manageMembers', label: 'Manage members', hint: 'Remove people and set nicknames.' },
  { key: 'moderateMessages', label: 'Moderate messages', hint: 'Delete anyone’s messages.' },
  { key: 'pinMessages', label: 'Pin messages', hint: 'Pin and unpin in any channel.' },
  {
    key: 'postAnnouncements',
    label: 'Post announcements',
    hint: 'Write in announcement channels.',
  },
  { key: 'inviteMembers', label: 'Invite members', hint: 'Add people by username.' },
  { key: 'useVoice', label: 'Use voice', hint: 'Join voice channels in this space.' },
];

const ROLE_COLORS = ['#5B5FC7', '#0F7A66', '#A86A14', '#C4314B', '#7A4FBF', '#2A6FB0', '#616161'];

export function SpaceSettingsPage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');

  const space = useQ<SpaceDetail>(api.spaces.get, spaceId ? { spaceId } : 'skip');
  const roles = useQ<RoleRow[]>(api.spaces.roles, spaceId ? { spaceId } : 'skip');
  const members = useQ<MemberRow[]>(api.spaces.members, spaceId ? { spaceId } : 'skip');

  if (space === undefined) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }

  const isAdmin = space.isCampusAdmin || space.myRole === 'OWNER' || space.myRole === 'ADMIN';
  const permissions = space.myPermissions;

  if (!isAdmin && !permissions.manageChannels && !permissions.manageMembers) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <EmptyState
          title="Not your space to change"
          body="Space settings are for owners, admins and anyone holding a role that grants management rights."
          action={
            <Link to={`/spaces/${space.id}`}>
              <Button variant="secondary">Back to {space.name}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'channels', label: 'Channels', count: space.channels.length },
    { id: 'members', label: 'Members', count: space.memberCount },
    ...(isAdmin ? [{ id: 'roles' as const, label: 'Roles', count: roles?.length }] : []),
    ...(isAdmin ? [{ id: 'danger' as const, label: 'Danger zone' }] : []),
  ];

  return (
    <div className="mx-auto h-full max-w-4xl overflow-y-auto px-4 py-6 md:px-8">
      <header className="mb-5">
        <Link
          to={`/spaces/${space.id}`}
          className="mb-2 inline-flex items-center gap-1 text-xs text-dim hover:text-chalk"
        >
          <IconChevron className="h-3 w-3 rotate-180" />
          Back to {space.name}
        </Link>
        <h1 className="font-display text-display-lg text-chalk">Space settings</h1>
        <p className="mt-1.5 text-[0.9375rem] text-dim">
          You are {space.myRole === 'OWNER' ? 'the owner' : `an ${space.myRole?.toLowerCase()}`} of
          this space.
        </p>
      </header>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      <div className="py-6">
        {tab === 'overview' && <OverviewTab space={space} canEdit={isAdmin} />}
        {tab === 'channels' && (
          <ChannelsTab space={space} canEdit={isAdmin || permissions.manageChannels} />
        )}
        {tab === 'members' && (
          <MembersTab space={space} members={members} roles={roles ?? []} isAdmin={isAdmin} />
        )}
        {tab === 'roles' && isAdmin && <RolesTab spaceId={space.id} roles={roles} />}
        {tab === 'danger' && isAdmin && (
          <DangerTab space={space} members={members ?? []} onDeleted={() => navigate('/')} />
        )}
      </div>
    </div>
  );
}

// ── Overview ───────────────────────────────────────────────────────────────

function OverviewTab({ space, canEdit }: { space: SpaceDetail; canEdit: boolean }) {
  const update = useM(api.spaces.update);
  const [name, setName] = useState(space.name);
  const [description, setDescription] = useState(space.description ?? '');
  const [tags, setTags] = useState(space.tags.join(', '));
  const [isPrivate, setIsPrivate] = useState(space.visibility === 'PRIVATE');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <Card className="space-y-4">
      <Eyebrow>About this space</Eyebrow>

      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
      </Field>
      <Field label="Description" hint="Shown in discovery and on the space card.">
        <Textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!canEdit}
        />
      </Field>
      <Field label="Tags" hint="Comma separated. How people find this space when browsing.">
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="climbing, outdoors, beginners welcome"
          disabled={!canEdit}
        />
      </Field>

      <div className="border-t border-edge pt-2">
        <Switch
          checked={isPrivate}
          onChange={setIsPrivate}
          disabled={!canEdit}
          label="Invite only"
          hint="Private spaces do not appear in discovery, and people have to be added by username."
        />
      </div>

      {notice && <p className="text-sm text-courses">{notice}</p>}

      {canEdit && (
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setNotice(null);
            try {
              await update({
                spaceId: space.id,
                name,
                description,
                tags: tags
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
                visibility: isPrivate ? 'PRIVATE' : 'PUBLIC',
              });
              setNotice('Saved.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Save changes
        </Button>
      )}
    </Card>
  );
}

// ── Channels ───────────────────────────────────────────────────────────────

function ChannelsTab({ space, canEdit }: { space: SpaceDetail; canEdit: boolean }) {
  const createChannel = useM(api.spaces.createChannel);
  const deleteChannel = useM(api.spaces.deleteChannel);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [type, setType] = useState('TEXT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SpaceDetail['channels'][number] | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Eyebrow>Channels</Eyebrow>
          <p className="mt-1 text-xs text-dim">
            Order follows the list. A space always keeps at least one channel.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <IconPlus className="h-3.5 w-3.5" />
            Add channel
          </Button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-events/40 bg-events/[0.07] px-3 py-2.5 text-sm text-events"
        >
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-edge bg-panel">
        <ul className="divide-y divide-edge">
          {space.channels.map((channel) => (
            <li key={channel.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium text-chalk">#{channel.name}</span>
                  <Badge>{channel.type.toLowerCase().replace('_stub', '')}</Badge>
                  {channel.isDefault && <Badge tone="accent">default</Badge>}
                </div>
                <p className="mt-0.5 truncate text-xs text-faint">
                  {channel.topic || 'No topic set.'}
                </p>
              </div>
              {canEdit && space.channels.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete #${channel.name}`}
                  onClick={() => setDeleting(channel)}
                >
                  <IconTrash className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a channel"
        description="Names are lowercased and hyphenated, the way channel names always are."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={name.trim().length < 2}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await createChannel({ spaceId: space.id, name, topic, type });
                  setAdding(false);
                  setName('');
                  setTopic('');
                } catch (err) {
                  const raw = err instanceof Error ? err.message : '';
                  setError(/(?::\s)(.*)/.exec(raw)?.[1] ?? 'Could not create that channel.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Create channel
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="trip-planning"
              autoFocus
            />
          </Field>
          <Field label="Topic" hint="One line, shown in the channel header.">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Where we are going and who is driving."
            />
          </Field>
          <Field label="Kind">
            <Select value={type} onChange={setType} options={CHANNEL_TYPES} />
          </Field>
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete #${deleting?.name ?? ''}?`}
        body="Every message in this channel is removed permanently, along with its pins. There is no undo."
        confirmLabel="Delete channel"
        busy={busy}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          setError(null);
          try {
            await deleteChannel({ channelId: deleting.id });
            setDeleting(null);
          } catch (err) {
            const raw = err instanceof Error ? err.message : '';
            setError(/(?::\s)(.*)/.exec(raw)?.[1] ?? 'Could not delete that channel.');
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

// ── Members ────────────────────────────────────────────────────────────────

function MembersTab({
  space,
  members,
  roles,
  isAdmin,
}: {
  space: SpaceDetail;
  members: MemberRow[] | undefined;
  roles: RoleRow[];
  isAdmin: boolean;
}) {
  const addMember = useM(api.spaces.addMember);
  const setMemberRole = useM(api.spaces.setMemberRole);
  const setMemberRoles = useM(api.spaces.setMemberRoles);
  const removeMember = useM(api.spaces.removeMember);
  const transferOwnership = useM(api.spaces.transferOwnership);

  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [removing, setRemoving] = useState<MemberRow | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setError(/(?::\s)(.*)/.exec(raw)?.[1] ?? 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <Eyebrow>Add someone</Eyebrow>
        <div className="flex flex-wrap gap-2">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="username"
            className="min-w-[12rem] flex-1"
            aria-label="Username to add"
          />
          <Button
            loading={busy}
            disabled={username.trim().length < 3}
            onClick={() =>
              run(async () => {
                await addMember({ spaceId: space.id, username: username.trim() });
                setUsername('');
              })
            }
          >
            Add to space
          </Button>
        </div>
        <p className="text-xs text-faint">
          They get a notification. For public spaces people can also just join on their own.
        </p>
      </Card>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-events/40 bg-events/[0.07] px-3 py-2.5 text-sm text-events"
        >
          {error}
        </p>
      )}

      {members === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-edge bg-panel">
          <ul className="divide-y divide-edge">
            {[...members]
              .sort((a, b) => RANK[b.role]! - RANK[a.role]! || a.joinedAt - b.joinedAt)
              .map((member) => (
                <li key={member.user.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Avatar
                    name={member.user.displayName}
                    src={member.user.avatarUrl}
                    seed={member.user.id}
                    size={32}
                  />
                  <div className="min-w-[10rem] flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        to={`/u/${member.user.username}`}
                        className="text-sm font-medium text-chalk hover:underline"
                      >
                        {member.nickname ?? member.user.displayName}
                      </Link>
                      {member.roles.map((role) => (
                        <span
                          key={role.id}
                          className="rounded-md border px-1.5 py-0.5 text-[0.625rem] font-medium"
                          style={{ color: role.color, borderColor: `${role.color}55` }}
                        >
                          {role.name}
                        </span>
                      ))}
                    </div>
                    <p className="mt-0.5 text-xs text-faint">
                      @{member.user.username} · joined {relativeTime(member.joinedAt)}
                    </p>
                  </div>

                  <span className="shrink-0 font-mono text-[0.625rem] uppercase tracking-wide text-faint">
                    {member.role}
                  </span>

                  {isAdmin && member.role !== 'OWNER' && (
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(member)}>
                        Manage
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${member.user.displayName}`}
                        onClick={() => setRemoving(member)}
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}

      {editing && (
        <ManageMemberDialog
          member={editing}
          roles={roles}
          isOwner={space.myRole === 'OWNER' || space.isCampusAdmin}
          onClose={() => setEditing(null)}
          onSetRank={(rank) =>
            run(() => setMemberRole({ spaceId: space.id, userId: editing.user.id, role: rank }))
          }
          onSetRoles={(roleIds) =>
            run(() => setMemberRoles({ spaceId: space.id, userId: editing.user.id, roleIds }))
          }
          onTransfer={() =>
            run(async () => {
              await transferOwnership({ spaceId: space.id, userId: editing.user.id });
              setEditing(null);
            })
          }
          busy={busy}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.user.displayName ?? ''}?`}
        body="They lose access to every channel in this space. Their messages stay. They can rejoin if the space is public."
        confirmLabel="Remove from space"
        busy={busy}
        onConfirm={() =>
          run(async () => {
            if (!removing) return;
            await removeMember({ spaceId: space.id, userId: removing.user.id });
            setRemoving(null);
          })
        }
      />
    </div>
  );
}

const RANK: Record<string, number> = { OWNER: 3, ADMIN: 2, MOD: 1, MEMBER: 0 };

function ManageMemberDialog({
  member,
  roles,
  isOwner,
  onClose,
  onSetRank,
  onSetRoles,
  onTransfer,
  busy,
}: {
  member: MemberRow;
  roles: RoleRow[];
  isOwner: boolean;
  onClose: () => void;
  onSetRank: (rank: string) => void;
  onSetRoles: (roleIds: string[]) => void;
  onTransfer: () => void;
  busy: boolean;
}) {
  const [rank, setRank] = useState(member.role);
  const [selected, setSelected] = useState<string[]>(member.roles.map((r) => r.id));
  const [confirmTransfer, setConfirmTransfer] = useState(false);

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Manage ${member.user.displayName}`}
      description={`@${member.user.username}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            loading={busy}
            onClick={() => {
              if (rank !== member.role) onSetRank(rank);
              onSetRoles(selected);
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field
          label="Rank"
          hint="The built-in ladder. Moderators can delete messages and pin; admins can do everything except hand the space on."
        >
          <Select
            value={rank}
            onChange={setRank}
            options={[
              { value: 'MEMBER', label: 'Member' },
              { value: 'MOD', label: 'Moderator' },
              { value: 'ADMIN', label: 'Admin' },
            ]}
          />
        </Field>

        <div>
          <p className="mb-1.5 text-sm font-medium text-chalk">Roles</p>
          {!roles.length ? (
            <p className="rounded-lg border border-dashed border-edge px-3 py-3 text-xs text-faint">
              No roles yet. Create one on the Roles tab and it will appear here.
            </p>
          ) : (
            <div className="space-y-0.5">
              {roles.map((role) => (
                <label
                  key={role.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-raised"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(role.id)}
                    onChange={(e) =>
                      setSelected((previous) =>
                        e.target.checked
                          ? [...previous, role.id]
                          : previous.filter((id) => id !== role.id),
                      )
                    }
                    className="accent-[rgb(var(--accent))]"
                  />
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: role.color }}
                  />
                  <span className="text-sm text-chalk">{role.name}</span>
                  <span className="ml-auto font-mono text-[0.625rem] text-faint">
                    {role.memberCount}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {isOwner && (
          <div className="border-t border-edge pt-4">
            <p className="text-sm font-medium text-chalk">Hand the space over</p>
            <p className="mt-1 text-xs leading-relaxed text-dim">
              {member.user.displayName} becomes the owner and you drop to admin. There is no taking
              it back without them handing it to you.
            </p>
            <Button
              variant="danger"
              size="sm"
              className="mt-2.5"
              onClick={() => setConfirmTransfer(true)}
            >
              Make {member.user.displayName} the owner
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmTransfer}
        onClose={() => setConfirmTransfer(false)}
        title="Hand over this space?"
        body={`${member.user.displayName} becomes the owner. You keep admin rights, but you can no longer delete the space or transfer it again.`}
        confirmLabel="Hand it over"
        busy={busy}
        onConfirm={() => {
          setConfirmTransfer(false);
          onTransfer();
        }}
      />
    </Dialog>
  );
}

// ── Roles ──────────────────────────────────────────────────────────────────

function RolesTab({ spaceId, roles }: { spaceId: string; roles: RoleRow[] | undefined }) {
  const createRole = useM(api.spaces.createRole);
  const updateRole = useM(api.spaces.updateRole);
  const deleteRole = useM(api.spaces.deleteRole);

  const [editing, setEditing] = useState<RoleRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RoleRow | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Eyebrow>Roles</Eyebrow>
          <p className="mt-1 max-w-lg text-xs leading-relaxed text-dim">
            Roles colour names in the member list and grant capabilities. They only ever add —
            nobody loses an ability by being given a role.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <IconPlus className="h-3.5 w-3.5" />
          New role
        </Button>
      </div>

      {roles === undefined ? (
        <Skeleton className="h-24" />
      ) : !roles.length ? (
        <EmptyState
          title="No roles yet"
          body="Roles are how you hand out one job without handing over the whole space — an events lead who can post announcements, a librarian who can pin."
          action={<Button onClick={() => setEditing('new')}>Create the first role</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-edge bg-panel">
          <ul className="divide-y divide-edge">
            {roles.map((role) => {
              const granted = PERMISSION_LABELS.filter((p) => role.permissions[p.key]);
              return (
                <li key={role.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span
                    aria-hidden
                    className="h-4 w-4 shrink-0 rounded-full"
                    style={{ background: role.color }}
                  />
                  <div className="min-w-[10rem] flex-1">
                    <span className="text-sm font-medium" style={{ color: role.color }}>
                      {role.name}
                    </span>
                    <p className="mt-0.5 text-xs text-faint">
                      {granted.length
                        ? granted.map((p) => p.label.toLowerCase()).join(' · ')
                        : 'No extra permissions — colour only.'}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[0.625rem] text-faint">
                    {role.memberCount} {role.memberCount === 1 ? 'member' : 'members'}
                  </span>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(role)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${role.name}`}
                      onClick={() => setDeleting(role)}
                    >
                      <IconTrash className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {editing && (
        <RoleDialog
          role={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (draft) => {
            setBusy(true);
            try {
              if (editing === 'new') await createRole({ spaceId, ...draft });
              else await updateRole({ roleId: editing.id, ...draft });
              setEditing(null);
            } finally {
              setBusy(false);
            }
          }}
          busy={busy}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete the ${deleting?.name ?? ''} role?`}
        body={`It is removed from ${deleting?.memberCount ?? 0} ${
          deleting?.memberCount === 1 ? 'person' : 'people'
        }. They keep their rank and every other role.`}
        confirmLabel="Delete role"
        busy={busy}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try {
            await deleteRole({ roleId: deleting.id });
            setDeleting(null);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function RoleDialog({
  role,
  onClose,
  onSave,
  busy,
}: {
  role: RoleRow | null;
  onClose: () => void;
  onSave: (draft: { name: string; color: string; permissions: SpacePermissions }) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(role?.name ?? '');
  const [color, setColor] = useState(role?.color ?? ROLE_COLORS[0]!);
  const [permissions, setPermissions] = useState<SpacePermissions>(
    role?.permissions ?? {
      manageChannels: false,
      manageRoles: false,
      manageMembers: false,
      moderateMessages: false,
      pinMessages: false,
      postAnnouncements: false,
      inviteMembers: false,
      useVoice: true,
    },
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={role ? `Edit ${role.name}` : 'New role'}
      description="The colour shows beside names in the member list. Permissions add to whatever the person already has."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={name.trim().length < 2}
            onClick={() => onSave({ name: name.trim(), color, permissions })}
          >
            {role ? 'Save role' : 'Create role'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Events lead"
            autoFocus
          />
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium text-chalk">Colour</p>
          <div className="flex flex-wrap gap-2">
            {ROLE_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setColor(option)}
                aria-label={`Colour ${option}`}
                aria-pressed={color === option}
                className={cn(
                  'h-8 w-8 rounded-full border-2 transition',
                  color === option ? 'border-chalk' : 'border-transparent',
                )}
                style={{ background: option }}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium text-chalk">Permissions</p>
          <p className="mb-2 text-xs leading-relaxed text-dim">
            Managing roles is not on this list on purpose — a role that can edit roles can grant
            itself everything else. Only owners and admins do that.
          </p>
          <div className="rounded-xl border border-edge bg-raised/50 p-3">
            {PERMISSION_LABELS.map((entry) => (
              <Switch
                key={entry.key}
                checked={permissions[entry.key]}
                onChange={(value) =>
                  setPermissions((previous) => ({ ...previous, [entry.key]: value }))
                }
                label={entry.label}
                hint={entry.hint}
              />
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// ── Danger zone ────────────────────────────────────────────────────────────

function DangerTab({
  space,
  members,
  onDeleted,
}: {
  space: SpaceDetail;
  members: MemberRow[];
  onDeleted: () => void;
}) {
  const remove = useM(api.spaces.remove);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = space.myRole === 'OWNER' || space.isCampusAdmin;

  return (
    <Card className="border-events/40">
      <Eyebrow className="text-events">Danger zone</Eyebrow>
      <h3 className="mt-2 text-sm font-semibold text-chalk">Delete this space</h3>
      <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-dim">
        Every channel, message, pin, role and membership goes with it. {members.length}{' '}
        {members.length === 1 ? 'person is' : 'people are'} in this space right now. This is written
        to the campus activity log and there is no undo.
      </p>

      {!canDelete && (
        <p className="mt-3 text-xs text-faint">
          Only the owner or a campus administrator can delete a space.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-events/40 bg-events/[0.07] px-3 py-2.5 text-sm text-events"
        >
          {error}
        </p>
      )}

      <Button
        variant="danger"
        className="mt-4"
        disabled={!canDelete}
        onClick={() => setConfirming(true)}
      >
        Delete {space.name}
      </Button>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete "${space.name}"?`}
        body="This removes every channel and every message in them, permanently. If the space just needs a new leader, hand it over from the Members tab instead."
        confirmLabel="Delete permanently"
        busy={busy}
        onConfirm={async () => {
          setBusy(true);
          setError(null);
          try {
            await remove({ spaceId: space.id });
            onDeleted();
          } catch (err) {
            const raw = err instanceof Error ? err.message : '';
            setError(/(?::\s)(.*)/.exec(raw)?.[1] ?? 'Could not delete that space.');
            setBusy(false);
          }
        }}
      />
    </Card>
  );
}
