import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChannelDto,
  MessageDto,
  PublicUser,
  SpaceDto,
  SpaceRole,
} from '@campusconnect/shared';
import { SOCKET_EVENTS } from '@campusconnect/shared';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { useUi } from '@/stores/ui';
import { usePresence } from '@/stores/presence';
import { Avatar, Badge, Skeleton } from '@/components/ui';
import { MessageList } from '@/features/chat/MessageList';
import { Composer } from '@/features/chat/Composer';
import { ThreadPanel } from '@/features/chat/ThreadPanel';
import {
  IconFolder,
  IconHash,
  IconHelp,
  IconIncognito,
  IconMegaphone,
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

interface Member {
  role: SpaceRole;
  nickname: string | null;
  user: PublicUser;
}

export function SpacePage() {
  const { spaceId, channelId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { memberListOpen, toggleMemberList } = useUi();
  const [threadRoot, setThreadRoot] = useState<MessageDto | null>(null);

  const { data: space, isLoading } = useQuery({
    queryKey: ['space', spaceId],
    queryFn: () => api.get<SpaceDto>(`/spaces/${spaceId}`),
    enabled: Boolean(spaceId),
  });

  const { data: members } = useQuery({
    queryKey: ['space-members', spaceId],
    queryFn: () => api.get<Member[]>(`/spaces/${spaceId}/members`),
    enabled: Boolean(spaceId),
  });

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

  // Join the socket room for whichever channel is open, and leave the previous one.
  useEffect(() => {
    if (!active) return;
    const socket = getSocket();
    socket.emit(SOCKET_EVENTS.channelJoin, active.id);
    setThreadRoot(null);
    return () => {
      socket.emit(SOCKET_EVENTS.channelLeave, active.id);
      // Unread counts are computed from the read cursor, so refresh them on the way out.
      void queryClient.invalidateQueries({ queryKey: ['space', spaceId] });
    };
  }, [active, spaceId, queryClient]);

  if (isLoading || !space) return <ChatSkeleton />;

  return (
    <div className="flex h-full">
      {/* ── Channel list ──────────────────────────────────────────────────── */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-edge bg-panel md:flex">
        <div className="border-b border-edge px-4 py-3.5">
          <h1 className="truncate font-display text-[0.9375rem] font-semibold tracking-tight text-chalk">
            {space.name}
          </h1>
          <p className="mt-0.5 font-mono text-[0.625rem] uppercase tracking-wider text-faint">
            {space.type.toLowerCase()} · {space.memberCount} members
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {channels.map((channel) => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              active={channel.id === active?.id}
              onClick={() => navigate(`/spaces/${space.id}/${channel.id}`)}
            />
          ))}
        </nav>
      </aside>

      {/* ── Chat pane ─────────────────────────────────────────────────────── */}
      <section className="flex min-w-0 flex-1 flex-col">
        {active && (
          <>
            <header className="flex items-center gap-2.5 border-b border-edge bg-panel/60 px-4 py-3 backdrop-blur">
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
                <Badge tone="accent" className="ml-auto shrink-0">
                  names hidden
                </Badge>
              )}
              <button
                onClick={toggleMemberList}
                className={cn(
                  'ml-auto hidden shrink-0 rounded-md p-1.5 transition lg:block',
                  memberListOpen
                    ? 'bg-raised text-chalk'
                    : 'text-dim hover:bg-raised hover:text-chalk',
                )}
                aria-label={memberListOpen ? 'Hide member list' : 'Show member list'}
                aria-pressed={memberListOpen}
              >
                <IconUsers />
              </button>
            </header>

            {active.type === 'VOICE_STUB' ? (
              <VoiceStub members={members ?? []} />
            ) : (
              <>
                <MessageList
                  channel={active}
                  spaceRole={space.myRole ?? null}
                  onOpenThread={setThreadRoot}
                />
                <Composer channel={active} spaceRole={space.myRole ?? null} />
              </>
            )}
          </>
        )}
      </section>

      {/* ── Thread panel (replaces the member list when open) ──────────────── */}
      {threadRoot ? (
        <ThreadPanel root={threadRoot} channel={active!} onClose={() => setThreadRoot(null)} />
      ) : (
        memberListOpen && <MemberList members={members} />
      )}
    </div>
  );
}

function ChannelGlyph({ type, className }: { type: string; className?: string }) {
  const Glyph = CHANNEL_ICON[type] ?? IconHash;
  return <Glyph className={className} />;
}

function ChannelRow({
  channel,
  active,
  onClick,
}: {
  channel: ChannelDto;
  active: boolean;
  onClick: () => void;
}) {
  const unread = channel.unreadCount ?? 0;
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition',
        active ? 'bg-raised text-chalk' : 'text-dim hover:bg-raised/60 hover:text-chalk',
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
      {unread > 0 && !active && (
        <span className="shrink-0 rounded-full bg-accent px-1.5 font-mono text-[0.5625rem] font-bold text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}

function MemberList({ members }: { members?: Member[] }) {
  const online = usePresence((s) => s.online);

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
    const aOn = online.has(a.user.id) ? 0 : 1;
    const bOn = online.has(b.user.id) ? 0 : 1;
    return aOn - bOn || a.user.displayName.localeCompare(b.user.displayName);
  });
  const onlineCount = sorted.filter((m) => online.has(m.user.id)).length;

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-l border-edge bg-panel lg:flex">
      <p className="eyebrow border-b border-edge px-4 py-3.5">
        {onlineCount} online · {members.length} members
      </p>
      <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {sorted.map((member) => (
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
              online={online.has(member.user.id)}
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block truncate text-[0.8125rem]',
                  online.has(member.user.id) ? 'text-chalk' : 'text-dim',
                )}
              >
                {member.nickname ?? member.user.displayName}
              </span>
            </span>
            {member.role !== 'MEMBER' && (
              <span className="shrink-0 font-mono text-[0.5625rem] uppercase tracking-wide text-faint">
                {member.role}
              </span>
            )}
          </Link>
        ))}
      </div>
    </aside>
  );
}

/** §4: voice channels render presence only. The honest version of "not built yet" is a
 *  room that shows who is in it, not a fake call UI. */
function VoiceStub({ members }: { members: Member[] }) {
  const online = usePresence((s) => s.online);
  const present = members.filter((m) => online.has(m.user.id)).slice(0, 8);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
      <IconSpeaker className="h-7 w-7 text-faint" />
      <div>
        <h3 className="font-display text-display-md text-chalk">Study hall</h3>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-dim">
          Co-working presence, no audio. People here are working on their own thing at the same time
          as you.
        </p>
      </div>

      {present.length === 0 ? (
        <p className="text-sm text-faint">Nobody in here right now. Being first tends to work.</p>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          {present.map((m) => (
            <div
              key={m.user.id}
              className="flex items-center gap-2 rounded-full border border-edge bg-raised px-2.5 py-1.5"
            >
              <Avatar name={m.user.displayName} src={m.user.avatarUrl} seed={m.user.id} size={22} />
              <span className="text-xs text-chalk">{m.user.displayName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
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
