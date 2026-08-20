import { useEffect } from 'react';
import { timeOfDay } from '@/lib/utils';
import { api } from '@/lib/convexApi';
import { useQ } from '@/lib/convexHooks';
import { Avatar, Skeleton } from '@/components/ui';
import { Markdown } from '@/features/chat/Markdown';
import { Composer } from '@/features/chat/Composer';
import { IconClose } from '@/components/Icons';
import type { ChannelDto, MessageDto } from '@/features/chat/MessageList';

/**
 * A thread is a side panel, so thread traffic never clutters the channel (section 5.2).
 * The query is live, so a reply from anyone appears here without a socket listener.
 */
export function ThreadPanel({
  root,
  channel,
  onClose,
}: {
  root: MessageDto;
  channel: ChannelDto;
  onClose: () => void;
}) {
  const messages = useQ<MessageDto[]>(api.messages.thread, { rootId: root.id });

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  return (
    <aside className="flex w-full shrink-0 flex-col border-l border-edge bg-panel md:w-96">
      <header className="flex items-center justify-between border-b border-edge px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-chalk">Thread</h2>
          <p className="font-mono text-[0.625rem] uppercase tracking-wider text-faint">
            #{channel.name}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close thread"
          className="rounded-md p-1.5 text-dim transition hover:bg-raised hover:text-chalk"
        >
          <IconClose />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages === undefined
          ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14" />)
          : messages.map((message, i) => (
              <div key={message.id}>
                <ThreadMessage message={message} />
                {i === 0 && messages.length > 1 && (
                  <div className="my-3 flex items-center gap-2">
                    <span className="h-px flex-1 bg-edge" />
                    <span className="font-mono text-[0.625rem] uppercase tracking-wider text-faint">
                      {messages.length - 1} {messages.length === 2 ? 'reply' : 'replies'}
                    </span>
                    <span className="h-px flex-1 bg-edge" />
                  </div>
                )}
              </div>
            ))}
      </div>

      <Composer channel={channel} spaceRole="MEMBER" threadRootId={root.id} compact />
    </aside>
  );
}

function ThreadMessage({ message }: { message: MessageDto }) {
  const name =
    message.author.kind === 'user'
      ? message.author.user.displayName
      : message.author.kind === 'anonymous'
        ? message.author.anon.alias
        : 'Deleted account';

  return (
    <article className="flex gap-2.5">
      {message.author.kind === 'user' ? (
        <Avatar
          name={message.author.user.displayName}
          src={message.author.user.avatarUrl}
          seed={message.author.user.id}
          size={28}
        />
      ) : (
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-edge text-xs"
          style={{
            background:
              message.author.kind === 'anonymous'
                ? `hsl(${message.author.anon.colorSeed} 30% 22%)`
                : undefined,
          }}
        >
          🎭
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[0.8125rem] font-semibold text-chalk">{name}</span>
          <span className="font-mono text-[0.625rem] text-faint">
            {timeOfDay(message.createdAt)}
          </span>
        </div>
        <div className="text-sm leading-relaxed text-chalk/95">
          <Markdown content={message.content} />
        </div>
      </div>
    </article>
  );
}
