import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn, dayStamp, timeOfDay } from '@/lib/utils';
import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';
import { useMe } from '@/hooks/useMe';
import { Avatar, Button, EmptyState, Skeleton, Textarea } from '@/components/ui';
import { Markdown } from '@/features/chat/Markdown';
import { ReportDialog } from '@/features/moderation/ReportDialog';
import { IconEdit, IconFlag, IconPin, IconReply, IconThread, IconTrash } from '@/components/Icons';

const QUICK_EMOJI = ['👍', '🙏', '😂', '🔥', '👀', '❤️'];

/**
 * Message list.
 *
 * `api.messages.list` is a live subscription: any mutation touching the table
 * re-runs it here. The Socket.IO listeners, the local message array and the
 * reducer that folded socket events into it are all gone — the query result is
 * the state.
 */

export interface MessageDto {
  id: string;
  channelId: string;
  content: string;
  author:
    | {
        kind: 'user';
        user: { id: string; username: string; displayName: string; avatarUrl: string | null };
      }
    | { kind: 'anonymous'; anon: { alias: string; animal: string; colorSeed: number } }
    | { kind: 'deleted' };
  attachments: { url: string; name: string; mimeType: string; size: number }[];
  replyToId: string | null;
  replyTo: { id: string; excerpt: string; authorName: string } | null;
  threadRootId: string | null;
  threadReplyCount: number;
  reactions: { emoji: string; count: number; mine: boolean }[];
  isPinned: boolean;
  createdAt: number;
  editedAt: number | null;
  deletedAt: number | null;
}

export interface ChannelDto {
  id: string;
  spaceId: string;
  name: string;
  topic: string | null;
  type: string;
  position: number;
  isDefault: boolean;
  unreadCount?: number;
}

export function MessageList({
  channel,
  spaceRole,
  canPin = false,
  onOpenThread,
}: {
  channel: ChannelDto;
  spaceRole: string | null;
  /** From the space's resolved permission set — a custom role can grant this to
   *  someone who holds no moderation rank at all. */
  canPin?: boolean;
  onOpenThread: (message: MessageDto) => void;
}) {
  const me = useMe();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(50);

  const messages = useQ<MessageDto[]>(api.messages.list, { channelId: channel.id, limit });
  const toggleReaction = useM(api.messages.toggleReaction);
  const removeMessage = useM(api.messages.remove);
  const togglePin = useM(api.messages.togglePin);
  const editMessage = useM(api.messages.edit);

  const typing = useQ<{ name: string }[]>(api.messages.typingIn, { channelId: channel.id }) ?? [];

  // Stick to the bottom on new messages, but only if the reader was already there —
  // yanking someone out of scrollback is hostile.
  const atBottomRef = useRef(true);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;

    // Paging widens the same subscription rather than issuing a second fetch, so
    // messages already on screen stay live.
    if (el.scrollTop < 120 && messages && messages.length >= limit) {
      setLimit((n) => n + 50);
    }
  };

  if (messages === undefined) {
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
  const exhausted = messages.length < limit;

  return (
    <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-4 md:px-5">
      {exhausted && messages.length > 0 && (
        <p className="pb-5 text-center font-mono text-[0.625rem] uppercase tracking-wider text-faint">
          the beginning of #{channel.name}
        </p>
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
            message.createdAt - previous.createdAt < 300_000;

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
                canPin={canPin}
                onReact={(m, emoji) => void toggleReaction({ messageId: m.id, emoji })}
                onOpenThread={onOpenThread}
                onDelete={() => void removeMessage({ messageId: message.id })}
                onTogglePin={() => void togglePin({ messageId: message.id })}
                onEdit={(content) => editMessage({ messageId: message.id, content })}
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
  canPin,
  onReact,
  onOpenThread,
  onDelete,
  onTogglePin,
  onEdit,
}: {
  message: MessageDto;
  grouped: boolean;
  isMine: boolean;
  canModerate: boolean;
  canPin: boolean;
  onReact: (message: MessageDto, emoji: string) => void;
  onOpenThread: (message: MessageDto) => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onEdit: (content: string) => Promise<unknown>;
}) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [reporting, setReporting] = useState(false);

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
              /* An anonymous poster gets a colour derived from their alias, so the
                 thread stays followable without any identity behind it. */
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

          {editing ? (
            /* Inline rather than a dialog: editing a message is a small correction,
               and moving it into a modal loses the surrounding conversation. */
            <form
              className="mt-1 space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const next = draft.trim();
                if (next && next !== message.content) await onEdit(next);
                setEditing(false);
              }}
            >
              <Textarea
                rows={2}
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setDraft(message.content);
                    setEditing(false);
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm">
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(message.content);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
                <span className="text-xs text-faint">Escape to cancel · Enter to save</span>
              </div>
            </form>
          ) : (
            <div className="text-[0.9375rem] leading-relaxed text-chalk/95">
              <Markdown content={message.content} />
              {message.editedAt && (
                <span className="ml-1 font-mono text-[0.625rem] text-faint">(edited)</span>
              )}
            </div>
          )}

          {message.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {message.attachments.map((a) => {
                return a.mimeType.startsWith('image/') ? (
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
                );
              })}
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
        <div className="absolute right-2 top-0 hidden -translate-y-1/2 items-center gap-0.5 rounded-lg border border-edge bg-raised p-0.5 shadow-lg group-focus-within:flex group-hover:flex">
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
              {canPin && (
                <IconButton
                  label={message.isPinned ? 'Unpin message' : 'Pin message'}
                  onClick={onTogglePin}
                >
                  <IconPin className={cn('h-3.5 w-3.5', message.isPinned && 'text-clubs')} />
                </IconButton>
              )}
              {/* Editing is author-only server-side, and anonymous posts are left
                  alone: an edited anonymous message is a way to leak who wrote it. */}
              {isMine && message.author.kind === 'user' && (
                <IconButton
                  label="Edit message"
                  onClick={() => {
                    setDraft(message.content);
                    setEditing(true);
                  }}
                >
                  <IconEdit className="h-3.5 w-3.5" />
                </IconButton>
              )}
              {!isMine && (
                <IconButton label="Report message" onClick={() => setReporting(true)}>
                  <IconFlag className="h-3.5 w-3.5" />
                </IconButton>
              )}
              {(isMine || canModerate) && (
                <IconButton label="Delete message" onClick={onDelete}>
                  <IconTrash className="h-3.5 w-3.5" />
                </IconButton>
              )}
            </>
          )}
        </div>
      </div>

      <ReportDialog
        open={reporting}
        onClose={() => setReporting(false)}
        targetType="MESSAGE"
        targetId={message.id}
        context={message.content}
      />
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
