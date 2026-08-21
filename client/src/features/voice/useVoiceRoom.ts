import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';

/**
 * Voice rooms over WebRTC, with Convex as the signalling channel.
 *
 * The shape, briefly: every participant opens a direct `RTCPeerConnection` to every
 * other participant — a full mesh. Audio flows peer to peer and never touches the
 * backend; only offers, answers and ICE candidates go through Convex, as rows that
 * the recipient reads and deletes.
 *
 * Two details that are easy to get wrong and are handled explicitly here:
 *
 *  - **Glare.** If both sides send an offer at once, both connections fail. The
 *    tiebreak is lexicographic: of any pair, the peer with the smaller id is the
 *    one that offers. It is arbitrary, symmetric, and needs no coordination.
 *
 *  - **Candidates arriving before the answer.** ICE can show up before
 *    `setRemoteDescription` has run, and `addIceCandidate` throws if it does. They
 *    are queued per peer and flushed once the remote description lands.
 *
 * The one external dependency in the whole app lives here: a STUN server, needed to
 * discover the public address of a peer behind NAT. It is overridable with
 * `VITE_STUN_URL`. Without any STUN, calls work on a single LAN and nowhere else;
 * with STUN but no TURN, they work for most people but fail behind symmetric NAT,
 * which is the usual trade for not running relay infrastructure.
 */

const STUN_URL = (import.meta.env.VITE_STUN_URL as string) || 'stun:stun.l.google.com:19302';
const RTC_CONFIG: RTCConfiguration = { iceServers: [{ urls: STUN_URL }] };

const HEARTBEAT_MS = 8_000;

/** Module-level constants: `?? []` inside the component allocates a fresh array on
 *  every render, and both of these feed useEffect dependency lists — the same class
 *  of bug that made the chat pane loop earlier in this project. */
const NO_PARTICIPANTS: VoiceParticipant[] = [];
const NO_SIGNALS: Signal[] = [];

export type VoiceScope = 'CHANNEL' | 'DM';

export interface VoiceParticipant {
  peerId: string;
  muted: boolean;
  deafened: boolean;
  joinedAt: number;
  isMe: boolean;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

interface Signal {
  id: string;
  fromPeerId: string;
  kind: 'OFFER' | 'ANSWER' | 'ICE';
  payload: string;
}

/** One id per tab, so the same account in two windows is two distinct peers. */
function newPeerId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export interface VoiceRoom {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  participants: VoiceParticipant[];
  /** Remote audio, keyed by peer id. Render one <audio> per entry. */
  remoteStreams: Map<string, MediaStream>;
  /** Peer ids currently above the speech threshold, including your own. */
  speaking: Set<string>;
  muted: boolean;
  deafened: boolean;
  join: () => void;
  leave: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
}

export function useVoiceRoom(room: string | null, scope: VoiceScope): VoiceRoom {
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());

  const peerId = useMemo(newPeerId, []);
  const localStream = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>());
  const analysers = useRef(new Map<string, { ctx: AudioContext; analyser: AnalyserNode }>());

  const joinRoom = useM(api.voice.join);
  const leaveRoom = useM(api.voice.leave);
  const heartbeat = useM(api.voice.heartbeat);
  const sendSignal = useM(api.voice.signal);
  const consume = useM(api.voice.consume);

  // Both subscriptions are skipped entirely while disconnected, so a channel you
  // are only reading costs nothing.
  const participants =
    useQ<VoiceParticipant[]>(api.voice.participants, active && room ? { room, scope } : 'skip') ??
    NO_PARTICIPANTS;

  const inbox =
    useQ<Signal[]>(api.voice.inbox, active && room ? { room, peerId } : 'skip') ?? NO_SIGNALS;

  // ── Speech detection ─────────────────────────────────────────────────────
  // A time-domain RMS over each stream. Cheap, and it is what makes a voice room
  // feel connected rather than like a list of names.
  const watchStream = useCallback((id: string, stream: MediaStream) => {
    if (analysers.current.has(id)) return;
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analysers.current.set(id, { ctx, analyser });
    } catch {
      // No AudioContext (older Safari, autoplay policy). Voice still works; the
      // ring just never lights up.
    }
  }, []);

  useEffect(() => {
    if (!active) return;

    const buffer = new Uint8Array(256);
    const tick = () => {
      const loud = new Set<string>();
      for (const [id, { analyser }] of analysers.current) {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          const deviation = (buffer[i]! - 128) / 128;
          sum += deviation * deviation;
        }
        if (Math.sqrt(sum / buffer.length) > 0.045) loud.add(id);
      }
      setSpeaking((previous) => {
        if (previous.size === loud.size && [...loud].every((id) => previous.has(id))) {
          return previous; // Same set: keep the reference so React skips the render.
        }
        return loud;
      });
    };

    const timer = window.setInterval(tick, 220);
    return () => window.clearInterval(timer);
  }, [active]);

  // ── Peer plumbing ────────────────────────────────────────────────────────

  const closePeer = useCallback((remoteId: string) => {
    peers.current.get(remoteId)?.close();
    peers.current.delete(remoteId);
    pendingIce.current.delete(remoteId);
    analysers.current
      .get(remoteId)
      ?.ctx.close()
      .catch(() => undefined);
    analysers.current.delete(remoteId);
    setRemoteStreams((previous) => {
      if (!previous.has(remoteId)) return previous;
      const next = new Map(previous);
      next.delete(remoteId);
      return next;
    });
  }, []);

  const ensurePeer = useCallback(
    (remoteId: string, initiator: boolean): RTCPeerConnection => {
      const existing = peers.current.get(remoteId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peers.current.set(remoteId, pc);

      for (const track of localStream.current?.getTracks() ?? []) {
        pc.addTrack(track, localStream.current!);
      }

      pc.onicecandidate = (event) => {
        if (!event.candidate || !room) return;
        void sendSignal({
          room,
          scope,
          fromPeerId: peerId,
          toPeerId: remoteId,
          kind: 'ICE',
          payload: JSON.stringify(event.candidate.toJSON()),
        }).catch(() => undefined);
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (!stream) return;
        watchStream(remoteId, stream);
        setRemoteStreams((previous) => new Map(previous).set(remoteId, stream));
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          closePeer(remoteId);
        }
      };

      if (initiator) {
        void (async () => {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            if (!room) return;
            await sendSignal({
              room,
              scope,
              fromPeerId: peerId,
              toPeerId: remoteId,
              kind: 'OFFER',
              payload: JSON.stringify(offer),
            });
          } catch {
            closePeer(remoteId);
          }
        })();
      }

      return pc;
    },
    [closePeer, peerId, room, scope, sendSignal, watchStream],
  );

  /** Open connections to everyone present, and drop the ones who left. */
  useEffect(() => {
    if (!active || !room || !localStream.current) return;

    const present = new Set(participants.map((p) => p.peerId));
    present.delete(peerId);

    for (const remoteId of present) {
      // Lexicographic tiebreak — see the glare note at the top.
      ensurePeer(remoteId, peerId < remoteId);
    }
    for (const remoteId of [...peers.current.keys()]) {
      if (!present.has(remoteId)) closePeer(remoteId);
    }
  }, [active, room, participants, peerId, ensurePeer, closePeer]);

  /** Drain the signalling inbox. */
  useEffect(() => {
    if (!active || !room || !inbox.length) return;

    let cancelled = false;
    void (async () => {
      const handled: string[] = [];

      for (const signal of inbox) {
        try {
          if (signal.kind === 'OFFER') {
            // Answering side, so never the initiator.
            const pc = ensurePeer(signal.fromPeerId, false);
            await pc.setRemoteDescription(
              new RTCSessionDescription(JSON.parse(signal.payload) as RTCSessionDescriptionInit),
            );
            await flushIce(pc, signal.fromPeerId);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendSignal({
              room,
              scope,
              fromPeerId: peerId,
              toPeerId: signal.fromPeerId,
              kind: 'ANSWER',
              payload: JSON.stringify(answer),
            });
          } else if (signal.kind === 'ANSWER') {
            const pc = peers.current.get(signal.fromPeerId);
            if (pc && !pc.currentRemoteDescription) {
              await pc.setRemoteDescription(
                new RTCSessionDescription(JSON.parse(signal.payload) as RTCSessionDescriptionInit),
              );
              await flushIce(pc, signal.fromPeerId);
            }
          } else {
            const candidate = JSON.parse(signal.payload) as RTCIceCandidateInit;
            const pc = peers.current.get(signal.fromPeerId);
            if (pc?.remoteDescription) await pc.addIceCandidate(candidate);
            else {
              // Arrived early. Hold it until the description lands.
              const queue = pendingIce.current.get(signal.fromPeerId) ?? [];
              queue.push(candidate);
              pendingIce.current.set(signal.fromPeerId, queue);
            }
          }
        } catch {
          // A malformed or stale signal should not stall the rest of the batch.
        }
        handled.push(signal.id);
      }

      if (!cancelled && handled.length) {
        await consume({ signalIds: handled }).catch(() => undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, room, inbox, ensurePeer, peerId, scope, sendSignal, consume]);

  async function flushIce(pc: RTCPeerConnection, remoteId: string) {
    const queue = pendingIce.current.get(remoteId);
    if (!queue?.length) return;
    pendingIce.current.delete(remoteId);
    for (const candidate of queue) {
      await pc.addIceCandidate(candidate).catch(() => undefined);
    }
  }

  // ── Heartbeat ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !room) return;
    const beat = () => void heartbeat({ room, peerId, muted, deafened }).catch(() => undefined);
    beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [active, room, peerId, muted, deafened, heartbeat]);

  // ── Join / leave ─────────────────────────────────────────────────────────

  const teardown = useCallback(() => {
    for (const remoteId of [...peers.current.keys()]) closePeer(remoteId);
    for (const track of localStream.current?.getTracks() ?? []) track.stop();
    localStream.current = null;
    analysers.current
      .get('self')
      ?.ctx.close()
      .catch(() => undefined);
    analysers.current.delete('self');
    setRemoteStreams(new Map());
    setSpeaking(new Set());
  }, [closePeer]);

  const join = useCallback(() => {
    if (!room || active || connecting) return;

    setConnecting(true);
    setError(null);
    void (async () => {
      try {
        // Microphone permission first. Joining the room before we have audio would
        // put a silent participant in the roster while the browser prompt sits open.
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        localStream.current = stream;
        watchStream('self', stream);

        await joinRoom({ room, scope, peerId });
        setActive(true);
      } catch (err) {
        teardown();
        const raw = err instanceof Error ? err.message : '';
        const match = /(?:BAD_REQUEST|FORBIDDEN|NOT_FOUND): (.*)/.exec(raw);
        setError(
          match?.[1] ??
            (err instanceof DOMException
              ? 'No microphone access. Allow it in your browser and try again.'
              : 'Could not join the call.'),
        );
      } finally {
        setConnecting(false);
      }
    })();
  }, [room, active, connecting, joinRoom, scope, peerId, teardown, watchStream]);

  const leave = useCallback(() => {
    if (!active) return;
    setActive(false);
    teardown();
    if (room) void leaveRoom({ room, peerId }).catch(() => undefined);
  }, [active, room, peerId, leaveRoom, teardown]);

  const toggleMute = useCallback(() => {
    setMuted((previous) => {
      const next = !previous;
      for (const track of localStream.current?.getAudioTracks() ?? []) track.enabled = !next;
      return next;
    });
  }, []);

  const toggleDeafen = useCallback(() => {
    setDeafened((previous) => {
      const next = !previous;
      // Deafening also mutes: it is rude to keep talking into a room you stopped
      // listening to, and every client people already use behaves this way.
      if (next && !muted) {
        setMuted(true);
        for (const track of localStream.current?.getAudioTracks() ?? []) track.enabled = false;
      }
      return next;
    });
  }, [muted]);

  /** Leaving the tab open on a call after navigating away would keep the mic hot. */
  useEffect(
    () => () => {
      teardown();
      if (room) void leaveRoom({ room, peerId }).catch(() => undefined);
    },
    // Intentionally mount-scoped: this is the unmount cleanup, and re-running it on
    // every `room` change would tear down a healthy call.
    [],
  );

  /** The browser tab closing should free the slot immediately, not after a timeout. */
  useEffect(() => {
    if (!active || !room) return;
    const onUnload = () => void leaveRoom({ room, peerId }).catch(() => undefined);
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, [active, room, peerId, leaveRoom]);

  return {
    connected: active,
    connecting,
    error,
    participants,
    remoteStreams,
    speaking,
    muted,
    deafened,
    join,
    leave,
    toggleMute,
    toggleDeafen,
  };
}
