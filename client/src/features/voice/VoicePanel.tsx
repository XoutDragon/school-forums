import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Avatar, Button } from '@/components/ui';
import { IconHeadphones, IconMic, IconMicOff, IconPhoneOff, IconSpeaker } from '@/components/Icons';
import {
  useVoiceRoom,
  type VoiceParticipant,
  type VoiceScope,
} from '@/features/voice/useVoiceRoom';

/**
 * Voice UI (feature 4). One component for both surfaces — a voice channel in a
 * space and a call inside a DM — because the only thing that differs is the room
 * key and the copy around it.
 *
 * `variant` picks the shape: the full-pane version for a VOICE_STUB channel, and a
 * compact bar for a DM header.
 */

export function VoicePanel({
  room,
  scope,
  title,
  blurb,
  variant = 'full',
}: {
  room: string;
  scope: VoiceScope;
  title: string;
  blurb?: string;
  variant?: 'full' | 'bar';
}) {
  const voice = useVoiceRoom(room, scope);

  const others = voice.participants.filter((p) => !p.isMe);
  const selfSpeaking = voice.speaking.has('self') && !voice.muted;

  return (
    <div
      className={cn(
        variant === 'full'
          ? 'flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center'
          : 'flex flex-wrap items-center gap-3 border-b border-edge bg-raised/60 px-4 py-2.5',
      )}
    >
      {/* Remote audio. Rendered, never seen. `deafened` mutes every element at once,
          which is the honest implementation — pausing playback would keep the peer
          connections streaming for nothing. */}
      {[...voice.remoteStreams.entries()].map(([id, stream]) => (
        <RemoteAudio key={id} stream={stream} muted={voice.deafened} />
      ))}

      {variant === 'full' && (
        <>
          <IconSpeaker className="h-7 w-7 text-faint" />
          <div>
            <h3 className="font-display text-display-md text-chalk">{title}</h3>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-dim">
              {blurb ??
                'Audio goes straight between browsers — it never passes through the campus server. Up to eight people at once.'}
            </p>
          </div>
        </>
      )}

      {variant === 'bar' && (
        <span className="flex items-center gap-2 text-sm font-medium text-chalk">
          <IconSpeaker className="h-4 w-4 text-dim" />
          {voice.connected
            ? `In a call · ${voice.participants.length}`
            : others.length
              ? `${others.length} in a call`
              : 'Voice'}
        </span>
      )}

      {/* ── Roster ────────────────────────────────────────────────────────── */}
      {voice.participants.length > 0 && (
        <div
          className={cn(
            'flex flex-wrap gap-2',
            variant === 'full' ? 'justify-center' : 'items-center',
          )}
        >
          {voice.participants.map((participant) => (
            <ParticipantChip
              key={participant.peerId}
              participant={participant}
              speaking={participant.isMe ? selfSpeaking : voice.speaking.has(participant.peerId)}
              compact={variant === 'bar'}
            />
          ))}
        </div>
      )}

      {variant === 'full' && !voice.connected && voice.participants.length === 0 && (
        <p className="text-sm text-faint">
          Nobody is in here right now. Being first tends to work.
        </p>
      )}

      {voice.error && (
        <p
          role="alert"
          className="rounded-lg border border-events/40 bg-events/[0.07] px-3 py-2 text-sm text-events"
        >
          {voice.error}
        </p>
      )}

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className={cn('flex items-center gap-2', variant === 'bar' && 'ml-auto')}>
        {voice.connected ? (
          <>
            <ControlButton
              active={voice.muted}
              onClick={voice.toggleMute}
              label={voice.muted ? 'Unmute' : 'Mute'}
            >
              {voice.muted ? <IconMicOff /> : <IconMic />}
            </ControlButton>
            <ControlButton
              active={voice.deafened}
              onClick={voice.toggleDeafen}
              label={voice.deafened ? 'Undeafen' : 'Deafen'}
            >
              <IconHeadphones />
            </ControlButton>
            <Button size={variant === 'bar' ? 'sm' : 'md'} variant="danger" onClick={voice.leave}>
              <IconPhoneOff className="h-4 w-4" />
              Leave
            </Button>
          </>
        ) : (
          <Button
            size={variant === 'bar' ? 'sm' : 'lg'}
            loading={voice.connecting}
            onClick={voice.join}
          >
            <IconMic className="h-4 w-4" />
            {voice.connecting ? 'Connecting' : others.length ? 'Join the call' : 'Start a call'}
          </Button>
        )}
      </div>

      {variant === 'full' && !voice.connected && (
        <p className="max-w-sm text-xs leading-relaxed text-faint">
          Your browser will ask for the microphone. Nothing is recorded and nothing is stored — only
          who is currently in the room.
        </p>
      )}
    </div>
  );
}

function ParticipantChip({
  participant,
  speaking,
  compact,
}: {
  participant: VoiceParticipant;
  speaking: boolean;
  compact: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full border bg-panel transition',
        compact ? 'px-2 py-1' : 'px-2.5 py-1.5',
        speaking ? 'border-courses' : 'border-edge',
      )}
      title={
        participant.muted ? `${participant.user.displayName} (muted)` : participant.user.displayName
      }
    >
      <span className={cn('relative inline-flex rounded-full', speaking && 'animate-speak-ring')}>
        <Avatar
          name={participant.user.displayName}
          src={participant.user.avatarUrl}
          seed={participant.user.id}
          size={compact ? 20 : 24}
        />
      </span>
      <span className={cn('text-chalk', compact ? 'text-xs' : 'text-[0.8125rem]')}>
        {participant.user.displayName}
        {participant.isMe && <span className="text-faint"> (you)</span>}
      </span>
      {participant.muted && <IconMicOff className="h-3 w-3 shrink-0 text-faint" />}
    </div>
  );
}

function ControlButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'grid h-10 w-10 place-items-center rounded-lg border transition',
        active
          ? 'border-events/50 bg-events/10 text-events'
          : 'border-edge bg-panel text-dim hover:bg-raised hover:text-chalk',
      )}
    >
      {children}
    </button>
  );
}

/** `srcObject` cannot be set from JSX, so this exists purely to hold the ref. */
function RemoteAudio({ stream, muted }: { stream: MediaStream; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    // Autoplay can be refused before the page has been interacted with. Joining a
    // call is itself a click, so in practice this resolves.
    void el.play().catch(() => undefined);
  }, [stream]);

  return <audio ref={ref} autoPlay muted={muted} className="hidden" />;
}
