"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useSession } from "@/lib/session";
import ChannelSidebar from "@/components/ChannelSidebar";
import TextChannelView from "@/components/TextChannelView";
import VoiceChannelView from "@/components/VoiceChannelView";

export default function TopicPage() {
  const { topicId } = useParams<{ topicId: Id<"topics"> }>();
  const { userId } = useSession();

  const topic = useQuery(api.topics.get, { topicId });
  const channels = useQuery(api.channels.listByTopic, { topicId });
  const membership = useQuery(
    api.topics.getMembership,
    userId ? { topicId, userId } : "skip"
  );
  const join = useMutation(api.topics.join);

  const [selectedChannelId, setSelectedChannelId] = useState<Id<"channels"> | null>(null);

  // Default to the first text channel once channels load.
  useEffect(() => {
    if (!selectedChannelId && channels && channels.length > 0) {
      const firstText = channels.find((c) => c.type === "text") ?? channels[0];
      setSelectedChannelId(firstText._id);
    }
  }, [channels, selectedChannelId]);

  // Auto-join on visit for this MVP (public topics). Swap for a "Join" button
  // + approval flow if you want private/invite-only topics later.
  useEffect(() => {
    if (userId && membership === null) {
      join({ topicId, userId });
    }
  }, [userId, membership, join, topicId]);

  const selectedChannel = channels?.find((c) => c._id === selectedChannelId);
  const canManage = membership?.role === "owner" || membership?.role === "moderator";

  if (!topic || !channels || !userId) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        Loading...
      </main>
    );
  }

  return (
    <main className="min-h-screen flex bg-background">
      <ChannelSidebar
        topic={topic}
        channels={channels}
        selectedChannelId={selectedChannelId}
        onSelect={setSelectedChannelId}
        userId={userId}
        canManage={canManage}
      />

      {selectedChannel?.type === "text" && (
        <TextChannelView channel={selectedChannel} userId={userId} />
      )}
      {selectedChannel?.type === "voice" && <VoiceChannelView channel={selectedChannel} />}
      {!selectedChannel && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a channel
        </div>
      )}
    </main>
  );
}
