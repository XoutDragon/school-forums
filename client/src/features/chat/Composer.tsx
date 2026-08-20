import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/convexApi';
import { useM, usePublicQ } from '@/lib/convexHooks';
import { useTypingSignal } from '@/hooks/useMe';
import { Button } from '@/components/ui';
import { IconSend } from '@/components/Icons';
import type { ChannelDto } from '@/features/chat/MessageList';

export function Composer({
  channel,
  spaceRole,
  threadRootId,
  compact,
}: {
  channel: ChannelDto;
  spaceRole: string | null;
  threadRootId?: string;
  compact?: boolean;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingSentAt = useRef(0);

  const send = useM(api.messages.send);
  const signalTyping = useTypingSignal();
  const filter = usePublicQ<{ words: string[] }>(api.catalog.filterWords);

  const isAnnouncement = channel.type === 'ANNOUNCEMENT';
  const canPost =
    !isAnnouncement || spaceRole === 'ADMIN' || spaceRole === 'OWNER' || spaceRole === 'MOD';

  // Grow with the content up to a ceiling, so a long message isn't typed through a slot.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const onChange = (next: string) => {
    setValue(next);
    setFlagged(false);
    setError(null);

    // Typing is a heartbeat now rather than a socket event; the server expires it
    // after 6 seconds, so re-signalling every few keystrokes is enough.
    const now = Date.now();
    if (next && now - typingSentAt.current > 2500) {
      typingSentAt.current = now;
      signalTyping(channel.id);
    }
  };

  const softCheck = (text: string) =>
    (filter?.words ?? []).some((word) => new RegExp(`\\b${word}\\b`, 'i').test(text));

  const submit = async () => {
    const content = value.trim();
    if (!content) return;

    // The soft filter asks once. Sending again goes through — this is a nudge, not
    // a gate, and pretending otherwise would just teach people to work around it.
    if (!flagged && softCheck(content)) {
      setFlagged(true);
      return;
    }

    setSending(true);
    setError(null);
    try {
      await send({
        channelId: channel.id,
        content,
        threadRootId,
        isAnonymous: channel.type === 'ANONYMOUS',
      });
      setValue('');
      setFlagged(false);
      signalTyping(null);
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      const match = /(?:BAD_REQUEST|FORBIDDEN|RATE_LIMITED|NOT_FOUND): (.*)/.exec(raw);
      setError(match?.[1] ?? "That didn't send.");
    } finally {
      setSending(false);
    }
  };

  if (!canPost) {
    return (
      <div className="border-t border-edge bg-panel px-4 py-3.5">
        <p className="text-center text-sm text-dim">
          Only space admins post in #{channel.name}. You can still react to announcements.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn('border-t border-edge bg-panel px-3 py-3 md:px-4', compact && 'px-3 py-2.5')}
    >
      {channel.type === 'ANONYMOUS' && (
        <p className="mb-2 flex items-center gap-1.5 font-mono text-[0.625rem] uppercase tracking-wider text-accent-lift">
          <span aria-hidden>🎭</span> posting as an animal · 5 an hour
        </p>
      )}

      <div className="flex items-end gap-2 rounded-xl border border-edge bg-raised px-3 py-2 transition focus-within:border-accent/50">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          onBlur={() => signalTyping(null)}
          rows={1}
          placeholder={
            threadRootId
              ? 'Reply in thread…'
              : channel.type === 'ANONYMOUS'
                ? 'Say it anonymously…'
                : `Message #${channel.name}`
          }
          className="max-h-[200px] flex-1 resize-none bg-transparent py-1 text-[0.9375rem] text-chalk outline-none placeholder:text-faint"
        />

        <button
          onClick={() => void submit()}
          disabled={sending || !value.trim()}
          aria-label="Send message"
          className="pb-0.5 text-accent transition hover:text-accent-lift disabled:text-faint"
        >
          <IconSend />
        </button>
      </div>

      {flagged && (
        <div className="mt-2 flex items-center gap-3 rounded-lg border border-clubs/40 bg-clubs/10 px-3 py-2">
          <p className="flex-1 text-xs text-chalk">
            That reads sharper than you might mean it. Want to rephrase?
          </p>
          <Button size="sm" variant="ghost" onClick={() => void submit()}>
            Send anyway
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-events">
          {error}
        </p>
      )}
    </div>
  );
}
