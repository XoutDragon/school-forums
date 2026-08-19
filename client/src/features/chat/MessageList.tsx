import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChannelDto, MessageDto, SpaceRole } from '@campusconnect/shared';
import { SOCKET_EVENTS } from '@campusconnect/shared';
import { api, qs } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { cn, dayStamp, timeOfDay } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import { usePresence } from '@/stores/presence';
import { Avatar, EmptyState, Skeleton } from '@/components/ui';
import { Markdown } from '@/features/chat/Markdown';
import { IconPin, IconReply, IconThread } from '@/components/Icons';

const QUICK_EMOJI = ['👍', '🙏', '😂', '🔥', '👀', '❤️'];

/** Zustand compares snapshots by reference, so a selector must never build a new value.
 *  Returning `[]` inline from the typing selector re-renders forever. */
const NO_TYPING: { name: string; at: number }[] = [];

export function MessageList({
  channel,
  spaceRole,
  onOpenThread,
}: {
  channel: ChannelDto;
  spaceRole: SpaceRole | null;
  onOpenThread: (message: MessageDto) => void;
}) {
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const typing = usePresence((s) => s.typing.get(channel.id)) ?? NO_TYPING;

  const { data, isLoading } = useQuery({
    queryKey: ['messages', channel.id],
    queryFn: () => api.get<MessageDto[]>(`/channels/${channel.id}/messages${qs({ limit: 50 })}`),
  });

  useEffect(() => {
    if (data) {
      setMessages(data);
      setExhausted(data.length < 50);
    }
  }, [data]);

  // Stick to the bottom on new messages, but only if the reader was already there —
  // yanking someone out of scrollback to show a new message is hostile.
  const atBottomRef = useRef(true);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const socket = getSocket();

    const onNew = (message: MessageDto) => {
      if (message.channelId !== channel.id) return;
      // Thread replies belong to the thread panel, not the main flow.
      if (message.threadRootId) return;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    };
    const onEdit = (message: MessageDto) => {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
    };
    const onDelete = ({ id }: { id: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, deletedAt: new Date().toISOString(), content: '' } : m,
        ),
      );
    };
    const onReaction = () =>
      void queryClient.invalidateQueries({ queryKey: ['messages', channel.id] });

    socket.on(SOCKET_EVENTS.messageNew, onNew);
    socket.on(SOCKET_EVENTS.messageEdit, onEdit);
    socket.on(SOCKET_EVENTS.messageDelete, onDelete);
    socket.on(SOCKET_EVENTS.reactionAdd, onReaction);
    socket.on(SOCKET_EVENTS.reactionRemove, onReaction);

    return () => {
      socket.off(SOCKET_EVENTS.messageNew, onNew);
      socket.off(SOCKET_EVENTS.messageEdit, onEdit);
      socket.off(SOCKET_EVENTS.messageDelete, onDelete);
      socket.off(SOCKET_EVENTS.reactionAdd, onReaction);
      socket.off(SOCKET_EVENTS.reactionRemove, onReaction);
    };
  }, [channel.id, queryClient]);

  const onScroll = async () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;

    if (el.scrollTop < 120 && !loadingMore && !exhausted && messages[0]) {
      setLoadingMore(true);
      const previousHeight = el.scrollHeight;
      const older = await api
        .get<MessageDto[]>(
          `/channels/${channel.id}/messages${qs({ before: messages[0].id, limit: 50 })}`,
        )
        .catch(() => []);
      if (older.length < 50) setExhausted(true);
      if (older.length) {
        setMessages((prev) => [...older, ...prev]);
        // Preserve the reader's position rather than jumping to the new top.
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight - previousHeight;
        });
      }
      setLoadingMore(false);
    }
  };

  const react = async (message: MessageDto, emoji: string) => {
    const mine = message.reactions.find((r) => r.emoji === emoji)?.mine;
    if (mine) await api.del(`/messages/${message.id}/reactions/${encodeURIComponent(emoji)}`);
    else await api.post(`/messages/${message.id}/reactions`, { emoji });
    void queryClient.invalidateQueries({ queryKey: ['messages', channel.id] });
  };

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-6">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const canModerate = spaceRole === 'OWNER' || spaceRole === 'ADMIN' || spaceRole === 'MOD';

  return (
    <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-4 md:px-5">
      {exhausted && messages.length > 0 && (
        <p className="pb-5 text-center font-mono text-[0.625rem] uppercase tracking-wider text-faint">
          the beginning of #{channel.name}
        </p>
      )}
      {loadingMore && (
        <p className="pb-4 text-center text-xs text-faint">Loading earlier messages…</p>
      )}

      {messages.length === 0 ? (
        <div className="grid h-full place-items-center">
          <EmptyState
            title={`#${channel.name} is empty`}
            body={
              channel.type === 'ANONYMOUS'
                ? 'Nobody has said anything yet. Posts here show an animal name instead of yours.'
                : 'No messages yet. Somebody has to go first, and it may as well be you.'
            }
          />
        </div>
      ) : (
        messages.map((message, i) => {
          const previous = messages[i - 1];
          const newDay = !previous || dayStamp(previous.createdAt) !== dayStamp(message.createdAt);
          // Group consecutive messages from the same author within 5 minutes.
          const grouped =
            !newDay &&
            previous &&
            authorKey(previous) === authorKey(message) &&
            new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() <
              300_000;

          return (
            <div key={message.id}>
              {newDay && (
                <div className="my-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-edge" />
                  <span className="font-mono text-[0.625rem] uppercase tracking-wider text-faint">
                    {dayStamp(message.createdAt)}
                  </span>
                  <span className="h-px flex-1 bg-edge" />
                </div>
              )}
              <MessageRow
                message={message}
                grouped={Boolean(grouped)}
                isMine={message.author.kind === 'user' && message.author.user.id === me?.id}
                canModerate={canModerate}
                onReact={react}
                onOpenThread={onOpenThread}
                onDelete={async () => {
                  await api.del(`/messages/${message.id}`);
                }}
              />
            </div>
          );
        })
      )}

      {typing.length > 0 && (
        <p className="px-1 pt-2 text-xs text-faint" aria-live="polite">
          {typing.map((t) => t.name).join(', ')} {typing.length === 1 ? 'is' : 'are'} typing…
        </p>
      )}
    </div>
  );
}

function authorKey(message: MessageDto): string {
  if (message.author.kind === 'user') return message.author.user.id;
  if (message.author.kind === 'anonymous') return message.author.anon.alias;
  return 'deleted';
}

function MessageRow({
  message,
  grouped,
  isMine,
  canModerate,
  onReact,
  onOpenThread,
  onDelete,
}: {
  message: MessageDto;
  grouped: boolean;
  isMine: boolean;
  canModerate: boolean;
  onReact: (message: MessageDto, emoji: string) => void;
  onOpenThread: (message: MessageDto) => void;
  onDelete: () => Promise<void>;
}) {
  const [showEmoji, setShowEmoji] = useState(false);
  const online = usePresence((s) => s.online);

  if (message.deletedAt) {
    return (
      <div className="group py-1 pl-12 text-xs italic text-faint">This message was deleted.</div>
    );
  }

  const name =
    message.author.kind === 'user'
      ? message.author.user.displayName
      : message.author.kind === 'anonymous'
        ? message.author.anon.alias
        : 'Deleted account';

  return (
    <article
      className={cn(
        'group relative rounded-md px-2 transition-colors hover:bg-panel/50',
        grouped ? 'py-0.5' : 'mt-2 py-1',
      )}
    >
      {message.replyTo && (
        <div className="mb-1 flex items-center gap-1.5 pl-12 text-xs text-faint">
          <IconReply className="h-3 w-3" />
          <span className="font-medium text-dim">{message.replyTo.authorName}</span>
          <span className="min-w-0 truncate">{message.replyTo.excerpt}</span>
        </div>
      )}

      <div className="flex gap-3">
        <div className="w-9 shrink-0">
          {!grouped ? (
            message.author.kind === 'anonymous' ? (
              /* An anonymous poster gets a colour derived from their alias, so the thread
                 stays followable without any identity behind it. */
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-full border border-edge text-sm"
                style={{ background: `hsl(${message.author.anon.colorSeed} 30% 22%)` }}
              >
                🎭
              </span>
            ) : message.author.kind === 'user' ? (
              <Link to={`/u/${message.author.user.username}`}>
                <Avatar
                  name={message.author.user.displayName}
                  src={message.author.user.avatarUrl}
                  seed={message.author.user.id}
                  size={36}
                  online={online.has(message.author.user.id)}
                />
              </Link>
            ) : (
              <Avatar name="?" size={36} />
            )
          ) : (
            <span className="hidden pt-1 text-right font-mono text-[0.5625rem] text-faint group-hover:block">
              {timeOfDay(message.createdAt)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {!grouped && (
            <div className="flex items-baseline gap-2">
              {message.author.kind === 'user' ? (
                <Link
                  to={`/u/${message.author.user.username}`}
                  className="text-sm font-semibold text-chalk hover:underline"
                >
                  {name}
                </Link>
              ) : (
                <span className="text-sm font-semibold text-dim">{name}</span>
              )}
              <span className="font-mono text-[0.625rem] text-faint">
                {timeOfDay(message.createdAt)}
              </span>
              {message.isPinned && <IconPin className="h-3 w-3 text-clubs" />}
            </div>
          )}

          <div className="text-[0.9375rem] leading-relaxed text-chalk/95">
            <Markdown content={message.content} />
            {message.editedAt && (
              <span className="ml-1 font-mono text-[0.625rem] text-faint">(edited)</span>
            )}
          </div>

          {message.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {message.attachments.map((a) =>
                a.mimeType.startsWith('image/') ? (
                  <a key={a.url} href={a.url} target="_blank" rel="noreferrer">
                    <img
                      src={a.url}
                      alt={a.name}
                      className="max-h-64 rounded-lg border border-edge object-cover"
                    />
                  </a>
                ) : (
                  <a
                    key={a.url}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-edge bg-raised px-3 py-2 text-xs text-chalk hover:border-accent/50"
                  >
                    <span className="font-mono text-[0.625rem] uppercase text-faint">file</span>
                    {a.name}
                  </a>
                ),
              )}
            </div>
          )}

          {message.reactions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {message.reactions.map((r) => (
                <button
                  key={r.emoji}
                  onClick={() => onReact(message, r.emoji)}
                  className={cn(
                    'flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition',
                    r.mine
                      ? 'border-accent/50 bg-accent/15 text-chalk'
                      : 'border-edge bg-raised text-dim hover:border-faint/60',
                  )}
                >
                  <span>{r.emoji}</span>
                  <span className="font-mono text-[0.625rem]">{r.count}</span>
                </button>
              ))}
            </div>
          )}

          {message.threadReplyCount > 0 && (
            <button
              onClick={() => onOpenThread(message)}
              className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-accent-lift hover:underline"
            >
              <IconThread className="h-3.5 w-3.5" />
              {message.threadReplyCount} {message.threadReplyCount === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>

        {/* Hover actions. Keyboard users reach them via focus-within. */}
        <div className="absolute right-2 top-0 hidden -translate-y-1/2 items-center gap-0.5 rounded-lg border border-edge bg-raised p-0.5 shadow-lg group-hover:flex group-focus-within:flex">
          {showEmoji ? (
            QUICK_EMOJI.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onReact(message, emoji);
                  setShowEmoji(false);
                }}
                className="rounded px-1.5 py-1 text-sm hover:bg-panel"
                aria-label={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))
          ) : (
            <>
              <IconButton label="Add reaction" onClick={() => setShowEmoji(true)}>
                <span className="text-xs">🙂</span>
              </IconButton>
              <IconButton label="Reply in thread" onClick={() => onOpenThread(message)}>
                <IconThread className="h-3.5 w-3.5" />
              </IconButton>
              {(isMine || canModerate) && (
                <IconButton label="Delete message" onClick={onDelete}>
                  <span className="text-xs">🗑</span>
                </IconButton>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded text-dim transition hover:bg-panel hover:text-chalk"
    >
      {children}
    </button>
  );
}
