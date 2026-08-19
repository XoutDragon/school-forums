import { create } from 'zustand';

interface PresenceState {
  online: Set<string>;
  typing: Map<string, { name: string; at: number }[]>;
  setOnline: (userId: string, isOnline: boolean) => void;
  addTyping: (channelId: string, name: string) => void;
  clearTyping: (channelId: string, name?: string) => void;
}

/** Presence and typing are the two things that must never be stale enough to notice, and
 *  the two things nobody should ever see a loading state for. Both live in memory only. */
export const usePresence = create<PresenceState>((set, get) => ({
  online: new Set(),
  typing: new Map(),

  setOnline(userId, isOnline) {
    const online = new Set(get().online);
    if (isOnline) online.add(userId);
    else online.delete(userId);
    set({ online });
  },

  addTyping(channelId, name) {
    const typing = new Map(get().typing);
    const current = (typing.get(channelId) ?? []).filter((t) => t.name !== name);
    typing.set(channelId, [...current, { name, at: Date.now() }]);
    set({ typing });
  },

  clearTyping(channelId, name) {
    const typing = new Map(get().typing);
    if (!name) typing.delete(channelId);
    else
      typing.set(
        channelId,
        (typing.get(channelId) ?? []).filter((t) => t.name !== name),
      );
    set({ typing });
  },
}));

// Typing indicators expire on their own — a dropped `typing:stop` shouldn't leave someone
// permanently "typing…".
setInterval(() => {
  const { typing } = usePresence.getState();
  let changed = false;
  const next = new Map(typing);
  for (const [channelId, entries] of next) {
    const live = entries.filter((e) => Date.now() - e.at < 6000);
    if (live.length !== entries.length) {
      changed = true;
      if (live.length) next.set(channelId, live);
      else next.delete(channelId);
    }
  }
  if (changed) usePresence.setState({ typing: next });
}, 3000);
