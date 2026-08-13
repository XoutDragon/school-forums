"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useSession } from "@/lib/session";
import ChannelSidebar, { Selection } from "@/components/ChannelSidebar";
import ForumView from "@/components/ForumView";
import ThreadView from "@/components/ThreadView";
import ChatChannelView from "@/components/ChatChannelView";
import VoiceChannelView from "@/components/VoiceChannelView";
import MemberList from "@/components/MemberList";
import TopicSettingsModal from "@/components/TopicSettingsModal";

export default function TopicPage() {
  const { topicId } = useParams<{ topicId: Id<"topics"> }>();
  const { userId } = useSession();
  const router = useRouter();

  const topic = useQuery(api.topics.get, { topicId });
  const channels = useQuery(api.channels.listByTopic, { topicId });
  const membership = useQuery(
    api.topics.getMembership,
    userId ? { topicId, userId } : "skip"
  );
  const join = useMutation(api.topics.join);
  const leave = useMutation(api.topics.leave);

  // The reddit-style forum feed is the landing view, mirroring where it sits
  // in the sidebar (above the channel list).
  const [selection, setSelection] = useState<Selection>({ kind: "forum" });
  const [openThreadId, setOpenThreadId] = useState<Id<"threads"> | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Auto-join on visit for this MVP (public topics). Swap for a "Join" button
  // + approval flow if you want private/invite-only topics later.
  useEffect(() => {
    if (userId && membership === null) {
      join({ topicId, userId });
    }
  }, [userId, membership, join, topicId]);

  // If the selected channel disappears (deleted by a mod), fall back to the feed.
  useEffect(() => {
    if (
      selection.kind === "channel" &&
      channels &&
      !channels.some((c) => c._id === selection.channelId)
    ) {
      setSelection({ kind: "forum" });
      setOpenThreadId(null);
    }
  }, [channels, selection]);

  const role = membership?.role ?? null;
  const canManage = role === "owner" || role === "moderator";
  const selectedChannel =
    selection.kind === "channel"
      ? channels?.find((c) => c._id === selection.channelId)
      : undefined;

  if (!topic || !channels || !userId) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        Loading...
      </main>
    );
  }

  async function handleLeave() {
    if (!userId) return;
    if (!window.confirm(`Leave "${topic!.name}"?`)) return;
    await leave({ topicId, userId });
    router.push("/discover");
  }

  return (
    <main className="h-screen flex bg-background overflow-hidden">
      <ChannelSidebar
        topic={topic}
        channels={channels}
        selection={selection}
        onSelect={(next) => {
          setSelection(next);
          setOpenThreadId(null);
        }}
        userId={userId}
        role={role}
        onOpenSettings={() => setShowSettings(true)}
        onLeave={handleLeave}
      />

      {/* Forum = reddit-style posts; text channels = live chat; voice = placeholder. */}
      {openThreadId ? (
        <ThreadView
          threadId={openThreadId}
          userId={userId}
          canModerate={canManage}
          onBack={() => setOpenThreadId(null)}
          onDeleted={() => setOpenThreadId(null)}
        />
      ) : selectedChannel?.type === "text" ? (
        <ChatChannelView channel={selectedChannel} userId={userId} canModerate={canManage} />
      ) : selectedChannel?.type === "voice" ? (
        <VoiceChannelView channel={selectedChannel} />
      ) : (
        <ForumView
          topic={topic}
          userId={userId}
          canModerate={canManage}
          onOpenThread={setOpenThreadId}
        />
      )}

      <MemberList topicId={topicId} viewerId={userId} viewerRole={role} />

      {showSettings && (role === "owner" || role === "moderator") && (
        <TopicSettingsModal
          topic={topic}
          channels={channels}
          userId={userId}
          role={role}
          onClose={() => setShowSettings(false)}
          onDeleted={() => router.push("/discover")}
        />
      )}
    </main>
  );
}
