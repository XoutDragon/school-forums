import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';
import { useUi } from '@/stores/ui';
import { Avatar, Badge, Skeleton } from '@/components/ui';
import { MessageList, type ChannelDto, type MessageDto } from '@/features/chat/MessageList';
import { Composer } from '@/features/chat/Composer';
import { ThreadPanel } from '@/features/chat/ThreadPanel';
import { PinnedPanel } from '@/features/chat/PinnedPanel';
import { VoicePanel } from '@/features/voice/VoicePanel';
import {
  IconFolder,
  IconHash,
  IconHelp,
  IconIncognito,
  IconMegaphone,
  IconPin,
  IconSettings,
  IconSpeaker,
  IconUsers,
} from '@/components/Icons';

const CHANNEL_ICON: Record<string, (p: { className?: string }) => JSX.Element> = {
  TEXT: IconHash,
  ANNOUNCEMENT: IconMegaphone,
  RESOURCES: IconFolder,
  QA: IconHelp,
  ANONYMOUS: IconIncognito,
  VOICE_STUB: IconSpeaker,
};

interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isOnline?: boolean;
}

interface MemberRole {
  id: string;
  name: string;
  color: string;
  position: number;
}

interface Member {
  role: string;
  nickname: string | null;
  roles: MemberRole[];
  user: PublicUser;
}

export interface SpacePermissions {
  manageChannels: boolean;
  manageRoles: boolean;
  manageMembers: boolean;
  moderateMessages: boolean;
  pinMessages: boolean;
  postAnnouncements: boolean;
  inviteMembers: boolean;
  useVoice: boolean;
}

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
  channels: ChannelDto[];
}

/** Right-hand rail: members, thread and pins are mutually exclusive so the chat
 *  pane never drops below a readable width. */
type SidePanel = 'members' | 'thread' | 'pins';

export function SpacePage() {
  const { spaceId, channelId } = useParams();
  const navigate = useNavigate();
  const { memberListOpen, toggleMemberList } = useUi();
  const [threadRoot, setThreadRoot] = useState<MessageDto | null>(null);
  const [pinsOpen, setPinsOpen] = useState(false);

  const space = useQ<SpaceDetail>(api.spaces.get, spaceId ? { spaceId } : 'skip');
  const members = useQ<Member[]>(api.spaces.members, spaceId ? { spaceId } : 'skip');
  const voiceCounts = useQ<Record<string, number>>(
    api.voice.counts,
    spaceId ? { spaceId } : 'skip',
  );
  const markRead = useM(api.messages.markChannelRead);

  const channels = space?.channels ?? [];
  const active = useMemo(
    () =>
      channels.find((c) => c.id === channelId) ?? channels.find((c) => c.isDefault) ?? channels[0],
    [channels, channelId],
  );

  // Keep the URL honest — landing on /spaces/:id should resolve to a real channel.
  useEffect(() => {
    if (space && active && active.id !== channelId) {
      navigate(`/spaces/${space.id}/${active.id}`, { replace: true });
    }
  }, [space, active, channelId, navigate]);

  // Opening a channel clears its unread badge. There is no socket room to join —
  // the message query subscribes on its own.
  useEffect(() => {
    if (!active) return;
    setThreadRoot(null);
    setPinsOpen(false);
    void markRead({ channelId: active.id });
  }, [active, markRead]);

  if (space === undefined) return <ChatSkeleton />;

  const permissions = space.myPermissions;
  const canManage =
    space.isCampusAdmin ||
    space.myRole === 'OWNER' ||
    permissions.manageChannels ||
    permissions.manageMembers ||
    permissions.manageRoles;

  const panel: SidePanel | null = threadRoot
    ? 'thread'
    : pinsOpen
      ? 'pins'
      : memberListOpen
        ? 'members'
        : null;

  return (
    <div className="flex h-full">
      {/* ── Channel list ──────────────────────────────────────────────────── */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-edge bg-panel md:flex">
        <div className="border-b border-edge px-4 py-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-[0.9375rem] font-semibold text-chalk">
                {space.name}
              </h1>
              <p className="mt-0.5 font-mono text-[0.625rem] uppercase tracking-wider text-faint">
                {space.type.toLowerCase().replace('_', ' ')} · {space.memberCount} members
              </p>
            </div>
            {canManage && (
              <Link
                to={`/spaces/${space.id}/settings`}
                aria-label="Space settings"
                title="Space settings"
                className="mt-0.5 shrink-0 rounded-md p-1 text-dim transition hover:bg-raised hover:text-chalk"
              >
                <IconSettings className="h-4 w-4" />
              </Link>
            )}
          </div>

          {!space.isPublished && (
            <p className="mt-2 rounded-md border border-events/40 bg-events/[0.07] px-2 py-1.5 text-[0.6875rem] leading-snug text-events">
              Not published. Students cannot see this space until it has an owner.
            </p>
          )}
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {channels.map((channel) => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              active={channel.id === active?.id}
              inVoice={voiceCounts?.[channel.id] ?? 0}
              onClick={() => navigate(`/spaces/${space.id}/${channel.id}`)}
            />
          ))}
        </nav>
      </aside>

      {/* ── Chat pane ─────────────────────────────────────────────────────── */}
      <section className="flex min-w-0 flex-1 flex-col">
        {active && (
          <>
            <header className="flex items-center gap-2.5 border-b border-edge bg-panel/70 px-4 py-3 backdrop-blur">
              <ChannelGlyph type={active.type} className="h-4 w-4 shrink-0 text-faint" />
              <h2 className="shrink-0 text-sm font-semibold text-chalk">{active.name}</h2>
              {active.topic && (
                <>
                  <span className="hidden h-4 w-px bg-edge sm:block" />
                  <p className="hidden min-w-0 truncate text-xs text-dim sm:block">
                    {active.topic}
                  </p>
                </>
              )}
              {active.type === 'ANONYMOUS' && (
                <Badge tone="accent" className="shrink-0">
                  names hidden
                </Badge>
              )}

              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                {active.type !== 'VOICE_STUB' && (
                  <HeaderToggle
                    active={pinsOpen}
                    label="Pinned messages"
                    onClick={() => {
                      setThreadRoot(null);
                      setPinsOpen((open) => !open);
                    }}
                  >
                    <IconPin />
                  </HeaderToggle>
                )}
                <HeaderToggle
                  active={memberListOpen && !pinsOpen && !threadRoot}
                  label={memberListOpen ? 'Hide member list' : 'Show member list'}
                  className="hidden lg:block"
                  onClick={() => {
                    setPinsOpen(false);
                    setThreadRoot(null);
                    toggleMemberList();
                  }}
                >
                  <IconUsers />
                </HeaderToggle>
              </div>
            </header>

            {active.type === 'VOICE_STUB' ? (
              <VoicePanel room={active.id} scope="CHANNEL" title={`#${active.name}`} />
            ) : (
              <>
                <MessageList
                  channel={active}
                  spaceRole={space.myRole}
                  canPin={permissions.pinMessages}
                  onOpenThread={(message) => {
                    setPinsOpen(false);
                    setThreadRoot(message);
                  }}
                />
                <Composer channel={active} spaceRole={space.myRole} />
              </>
            )}
          </>
        )}
      </section>

      {/* ── One right-hand panel at a time. ───────────────────────────────── */}
      {panel === 'thread' && threadRoot && (
        <ThreadPanel root={threadRoot} channel={active!} onClose={() => setThreadRoot(null)} />
      )}
      {panel === 'pins' && active && (
        <PinnedPanel
          channelId={active.id}
          channelName={active.name}
          canPin={permissions.pinMessages}
          onClose={() => setPinsOpen(false)}
        />
      )}
      {panel === 'members' && <MemberList members={members} />}
    </div>
  );
}

function HeaderToggle({
  active,
  label,
  onClick,
  className,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'rounded-md p-1.5 transition',
        active ? 'nav-active' : 'text-dim hover:bg-raised hover:text-chalk',
        className,
      )}
    >
      {children}
    </button>
  );
}

function ChannelGlyph({ type, className }: { type: string; className?: string }) {
  const Glyph = CHANNEL_ICON[type] ?? IconHash;
  return <Glyph className={className} />;
}

function ChannelRow({
  channel,
  active,
  inVoice,
  onClick,
}: {
  channel: ChannelDto;
  active: boolean;
  inVoice: number;
  onClick: () => void;
}) {
  const unread = channel.unreadCount ?? 0;
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition',
        active ? 'nav-active' : 'text-dim hover:bg-raised hover:text-chalk',
      )}
    >
      <ChannelGlyph type={channel.type} className="h-3.5 w-3.5 shrink-0 opacity-70" />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm',
          unread > 0 && !active && 'font-semibold text-chalk',
        )}
      >
        {channel.name}
      </span>

      {/* A voice channel with people in it says so, or nobody ever joins one. */}
      {channel.type === 'VOICE_STUB' && inVoice > 0 && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-courses/15 px-1.5 font-mono text-[0.5625rem] font-bold text-courses">
          <span className="h-1.5 w-1.5 rounded-full bg-courses" />
          {inVoice}
        </span>
      )}

      {unread > 0 && !active && (
        <span className="shrink-0 rounded-full bg-accent px-1.5 font-mono text-[0.5625rem] font-bold text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}

function MemberList({ members }: { members?: Member[] }) {
  if (!members) {
    return (
      <aside className="hidden w-60 shrink-0 space-y-2 border-l border-edge bg-panel p-3 lg:block">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </aside>
    );
  }

  // Online first — the list answers "who could reply right now", not "who exists".
  const sorted = [...members].sort((a, b) => {
    const aOn = a.user.isOnline ? 0 : 1;
    const bOn = b.user.isOnline ? 0 : 1;
    return aOn - bOn || a.user.displayName.localeCompare(b.user.displayName);
  });
  const onlineCount = sorted.filter((m) => m.user.isOnline).length;

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-l border-edge bg-panel lg:flex">
      <p className="eyebrow border-b border-edge px-4 py-3.5">
        {onlineCount} online · {members.length} members
      </p>
      <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {sorted.map((member) => {
          // The highest-positioned custom role colours the name, the way it does in
          // every chat app people already use.
          const topRole = member.roles[0];
          return (
            <Link
              key={member.user.id}
              to={`/u/${member.user.username}`}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition hover:bg-raised"
            >
              <Avatar
                name={member.user.displayName}
                src={member.user.avatarUrl}
                seed={member.user.id}
                size={26}
                online={member.user.isOnline}
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block truncate text-[0.8125rem]',
                    !topRole && (member.user.isOnline ? 'text-chalk' : 'text-dim'),
                  )}
                  style={topRole ? { color: topRole.color } : undefined}
                >
                  {member.nickname ?? member.user.displayName}
                </span>
                {topRole && (
                  <span className="block truncate text-[0.625rem] text-faint">{topRole.name}</span>
                )}
              </span>
              {member.role !== 'MEMBER' && (
                <span className="shrink-0 font-mono text-[0.5625rem] uppercase tracking-wide text-faint">
                  {member.role}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

function ChatSkeleton() {
  return (
    <div className="flex h-full">
      <div className="hidden w-60 shrink-0 space-y-2 border-r border-edge bg-panel p-3 md:block">
        <Skeleton className="h-8 w-40" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-7" />
        ))}
      </div>
      <div className="flex-1 space-y-4 p-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Kept for the settings page, which links back here. */
export type { Member as SpaceMemberRow };
