import { useEffect } from 'react';
import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';
import { getSessionToken } from '@/lib/convex';
import type { MeUser } from '@/stores/auth';

/**
 * The signed-in student, as a live subscription.
 *
 * Returns `undefined` while loading and `null` when signed out — the two are
 * different, and conflating them makes the app flash the sign-in screen on every
 * refresh.
 */
export function useMe(): MeUser | null | undefined {
  return useQ<MeUser | null>(api.auth.me);
}

/**
 * Presence heartbeat.
 *
 * Socket.IO gave presence for free: connected meant online. Convex has no
 * connection to observe, so the client says so periodically and the server treats
 * anyone seen in the last 45s as online.
 */
export function usePresenceHeartbeat(enabled: boolean): void {
  const heartbeat = useM(api.auth.heartbeat);

  useEffect(() => {
    if (!enabled || !getSessionToken()) return;

    const beat = () => void heartbeat({}).catch(() => undefined);
    beat();
    const id = setInterval(beat, 20_000);
    return () => clearInterval(id);
  }, [enabled, heartbeat]);
}

/** Signals "typing" in a channel. Cleared by the server's 6s staleness window. */
export function useTypingSignal(): (channelId: string | null) => void {
  const heartbeat = useM(api.auth.heartbeat);
  return (channelId) =>
    void heartbeat({ typingInChannel: channelId ?? undefined }).catch(() => undefined);
}
