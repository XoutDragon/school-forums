"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";

export default function TextChannelView({
  channel,
  userId,
}: {
  channel: Doc<"channels">;
  userId: Id<"users">;
}) {
  const threads = useQuery(api.threads.listByChannel, { channelId: channel._id });
  const createThread = useMutation(api.threads.create);

  const [showComposer, setShowComposer] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handlePost() {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    try {
      await createThread({ channelId: channel._id, title, authorId: userId, body });
      setTitle("");
      setBody("");
      setShowComposer(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground"># {channel.name}</h2>
        <button
          onClick={() => setShowComposer((s) => !s)}
          className="rounded-lg bg-primary text-white text-xs font-medium px-3 py-1.5 hover:opacity-90"
        >
          New thread
        </button>
      </header>

      {showComposer && (
        <div className="border-b border-border px-6 py-4 bg-secondary/40 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Thread title"
            className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What's on your mind?"
            rows={3}
            className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowComposer(false)}
              className="text-xs text-muted-foreground px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={handlePost}
              disabled={submitting}
              className="rounded-lg bg-primary text-white text-xs font-medium px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Posting..." : "Post thread"}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {threads === undefined && <p className="text-sm text-muted-foreground">Loading threads...</p>}
        {threads?.length === 0 && (
          <p className="text-sm text-muted-foreground">No threads yet. Start the conversation.</p>
        )}
        {threads?.map((thread) => (
          <div key={thread._id} className="bg-card border border-border rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              {thread.pinned && <span className="text-[10px] text-primary">PINNED</span>}
              <h3 className="text-sm font-medium text-foreground">{thread.title}</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              by {thread.author?.name ?? "Unknown"} · {thread.replyCount} replies
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
