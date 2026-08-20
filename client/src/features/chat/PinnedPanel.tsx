import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';
import { relativeTime } from '@/lib/utils';
import { Avatar, Button, EmptyState, Skeleton } from '@/components/ui';
import { Markdown } from '@/features/chat/Markdown';
import { IconClose, IconPin } from '@/components/Icons';
import type { MessageDto } from '@/features/chat/MessageList';

/**
 * Pinned messages (feature 9).
 *
 * A side panel rather than a modal, because pins are read *while* reading the
 * channel — the point of pinning something is that it stays available next to the
 * conversation it came out of, not behind a dialog that hides it.
 *
 * Reactive: pinning from the message hover menu makes the row appear here without
 * a refetch.
 */

type PinnedMessage = MessageDto & { pinnedAt: number };

export function PinnedPanel({
  channelId,
  channelName,
  canPin,
  onClose,
}: {
  channelId: string;
  channelName: string;
  canPin: boolean;
  onClose: () => void;
}) {
  const pins = useQ<PinnedMessage[]>(api.messages.pinned, { channelId });
  const togglePin = useM(api.messages.togglePin);

  return (
    <aside className="flex w-full shrink-0 flex-col border-l border-edge bg-panel lg:w-80">
      <header className="flex items-center gap-2 border-b border-edge px-4 py-3">
        <IconPin className="h-4 w-4 shrink-0 text-clubs" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-chalk">
          Pinned in #{channelName}
        </h2>
        <button
          onClick={onClose}
          aria-label="Close pinned messages"
          className="rounded-md p-1 text-dim transition hover:bg-raised hover:text-chalk"
        >
          <IconClose className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {pins === undefined ? (
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20" />)
        ) : !pins.length ? (
          <EmptyState
            title="Nothing pinned"
            body={
              canPin
                ? 'Pin the message people keep scrolling back for — the meeting time, the syllabus link, the answer.'
                : 'A moderator can pin messages here. Ask them to pin the one everyone keeps asking about.'
            }
          />
        ) : (
          pins.map((message) => {
            const name =
              message.author.kind === 'user'
                ? message.author.user.displayName
                : message.author.kind === 'anonymous'
                  ? message.author.anon.alias
                  : 'Deleted account';

            return (
              <article
                key={message.id}
                className="group rounded-xl border border-edge bg-raised/50 p-3"
              >
                <header className="flex items-center gap-2">
                  {message.author.kind === 'user' ? (
                    <Avatar
                      name={message.author.user.displayName}
                      src={message.author.user.avatarUrl}
                      seed={message.author.user.id}
                      size={20}
                    />
                  ) : (
                    <span aria-hidden className="text-sm">
                      🎭
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-chalk">
                    {name}
                  </span>
                  <span className="shrink-0 font-mono text-[0.5625rem] text-faint">
                    {relativeTime(message.createdAt)}
                  </span>
                </header>

                <div className="mt-1.5 text-[0.8125rem] leading-relaxed text-chalk/90">
                  <Markdown content={message.content} />
                </div>

                {message.attachments.length > 0 && (
                  <p className="mt-1.5 font-mono text-[0.625rem] uppercase tracking-wide text-faint">
                    {message.attachments.length}{' '}
                    {message.attachments.length === 1 ? 'attachment' : 'attachments'}
                  </p>
                )}

                {canPin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1.5 h-7 px-2 text-xs opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => void togglePin({ messageId: message.id })}
                  >
                    Unpin
                  </Button>
                )}
              </article>
            );
          })
        )}
      </div>
    </aside>
  );
}
