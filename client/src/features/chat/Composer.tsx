import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Attachment, ChannelDto, SpaceRole } from '@campusconnect/shared';
import { SOCKET_EVENTS } from '@campusconnect/shared';
import { api, ApiRequestError } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { IconClose, IconSend } from '@/components/Icons';

export function Composer({
  channel,
  spaceRole,
  threadRootId,
  compact,
}: {
  channel: ChannelDto;
  spaceRole: SpaceRole | null;
  threadRootId?: string;
  compact?: boolean;
}) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingSentAt = useRef(0);

  const { data: filter } = useQuery({
    queryKey: ['filter-words'],
    queryFn: () => api.get<{ words: string[] }>('/catalog/filter-words'),
    staleTime: Infinity,
  });

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

    const now = Date.now();
    if (next && now - typingSentAt.current > 2500) {
      typingSentAt.current = now;
      getSocket().emit(SOCKET_EVENTS.typingStart, channel.id);
    }
  };

  const softCheck = (text: string) =>
    (filter?.words ?? []).some((word) => new RegExp(`\\b${word}\\b`, 'i').test(text));

  const send = async () => {
    const content = value.trim();
    if (!content && attachments.length === 0) return;

    // §5.10: the soft filter asks once. Sending again goes through — this is a nudge,
    // not a gate, and pretending otherwise would just teach people to work around it.
    if (!flagged && softCheck(content)) {
      setFlagged(true);
      return;
    }

    setSending(true);
    setError(null);
    try {
      await api.post(`/channels/${channel.id}/messages`, {
        content: content || '(attachment)',
        attachments,
        threadRootId: threadRootId ?? null,
        isAnonymous: channel.type === 'ANONYMOUS',
      });
      setValue('');
      setAttachments([]);
      setFlagged(false);
      getSocket().emit(SOCKET_EVENTS.typingStop, channel.id);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "That didn't send.");
    } finally {
      setSending(false);
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const uploaded = await api.upload([...files]);
      setAttachments((prev) => [...prev, ...uploaded].slice(0, 5));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "That file didn't upload.");
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

      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachments.map((a) => (
            <span
              key={a.url}
              className="flex items-center gap-1.5 rounded-md border border-edge bg-raised px-2 py-1 text-xs text-chalk"
            >
              <span className="max-w-[10rem] truncate">{a.name}</span>
              <button
                onClick={() => setAttachments((prev) => prev.filter((x) => x.url !== a.url))}
                aria-label={`Remove ${a.name}`}
                className="text-faint hover:text-events"
              >
                <IconClose className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 rounded-xl border border-edge bg-raised px-3 py-2 transition focus-within:border-accent/50">
        <button
          onClick={() => fileRef.current?.click()}
          className="pb-1 text-lg leading-none text-faint transition hover:text-chalk"
          aria-label="Attach a file"
        >
          +
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept="image/*,application/pdf,text/plain,text/markdown"
          onChange={(e) => {
            void onFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          onBlur={() => getSocket().emit(SOCKET_EVENTS.typingStop, channel.id)}
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
          onClick={() => void send()}
          disabled={sending || (!value.trim() && attachments.length === 0)}
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
          <Button size="sm" variant="ghost" onClick={() => void send()}>
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
