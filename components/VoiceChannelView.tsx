"use client";

import { Doc } from "@/convex/_generated/dataModel";

// Placeholder UI for a voice channel. Wire this up to LiveKit (or similar)
// by: 1) generating a join token server-side (Convex action) using the
// channel's `voiceRoomName`, 2) connecting with the LiveKit client SDK here,
// 3) rendering participant tiles + mute controls in place of this panel.
export default function VoiceChannelView({ channel }: { channel: Doc<"channels"> }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-w-0 gap-3">
      <div className="w-16 h-16 rounded-full bg-panel2 flex items-center justify-center text-2xl">
        🔊
      </div>
      <h2 className="text-sm font-semibold text-text">{channel.name}</h2>
      <p className="text-xs text-muted max-w-xs text-center">
        Voice isn't connected yet in this MVP. Hook up LiveKit (or Agora/Daily) here — see the
        comment in this file for the integration steps.
      </p>
      <button
        disabled
        className="rounded-lg bg-panel2 border border-border text-muted text-sm font-medium px-4 py-2 cursor-not-allowed"
      >
        Join voice (not wired up)
      </button>
    </div>
  );
}
