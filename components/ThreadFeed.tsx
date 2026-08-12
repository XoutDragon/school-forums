"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import clsx from "clsx";
import {
  Clock,
  Flame,
  Hash,
  MessageSquare,
  Pin,
  PinOff,
  Trash2,
  TrendingUp,
} from "lucide-react";
import ActionMenu, { MenuItem } from "@/components/ActionMenu";
import { UserAvatar } from "@/components/UserBadge";
import { compactNumber, timeAgo } from "@/lib/format";

export type SortOrder = "hot" | "new" | "top";

const SORTS: { key: SortOrder; label: string; icon: typeof Flame }[] = [
  { key: "hot", label: "Hot", icon: Flame },
  { key: "new", label: "New", icon: Clock },
  { key: "top", label: "Top", icon: TrendingUp },
];

// Reddit-style feed of threads. `channel === null` is the topic-wide "Forum"
// front page (the entry pinned above the channel list); passing a channel
// scopes it to that channel and locks the composer to it.
export default function ThreadFeed({
  topic,
  channel,
  textChannels,
  userId,
  canModerate,
  onOpenThread,
}: {
  topic: Doc<"topics">;
  channel: Doc<"channels"> | null;
  textChannels: Doc<"channels">[];
  userId: Id<"users">;
  canModerate: boolean;
  onOpenThread: (threadId: Id<"threads">) => void;
}) {
  const isForum = channel === null;
  const [sort, setSort] = useState<SortOrder>(isForum ? "hot" : "new");

  // Only one of these runs: the other is skipped depending on the scope.
  const topicThreads = useQuery(
    api.threads.listByTopic,
    isForum ? { topicId: topic._id, userId, sort } : "skip",
  );
  const channelThreads = useQuery(
    api.threads.listByChannel,
    channel ? { channelId: channel._id, userId, sort } : "skip",
  );
  const threads = isForum ? topicThreads : channelThreads;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="border-b border-border px-6 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              {isForum ? (
                <>Forum</>
              ) : (
                <>
                  <Hash className="w-3.5 h-3.5 opacity-70" />
                  {channel.name}
                </>
              )}
            </h2>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {isForum
                ? topic.description || "Every thread across all channels"
                : `Threads in #${channel.name}`}
            </p>
          </div>
          <SortTabs sort={sort} onChange={setSort} />
        </div>
      </header>

      <Composer
        topicId={topic._id}
        userId={userId}
        textChannels={textChannels}
        fixedChannel={channel}
        onPosted={onOpenThread}
      />

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {threads === undefined && (
          <p className="text-sm text-muted-foreground">Loading threads...</p>
        )}
        {threads?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {isForum
              ? "No threads in this topic yet. Start the conversation."
              : `Nothing in #${channel.name} yet. Start the conversation.`}
          </p>
        )}
        {threads?.map((thread) => (
          <ThreadCard
            key={thread._id}
            thread={thread}
            userId={userId}
            canModerate={canModerate}
            showChannel={isForum}
            onOpen={() => onOpenThread(thread._id)}
          />
        ))}
      </div>
    </div>
  );
}

function SortTabs({
  sort,
  onChange,
}: {
  sort: SortOrder;
  onChange: (s: SortOrder) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-secondary/60 p-0.5 shrink-0">
      {SORTS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={clsx(
            "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium",
            sort === key
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="w-3 h-3" />
          {label}
        </button>
      ))}
    </div>
  );
}

type FeedThread = FunctionReturnType<typeof api.threads.listByTopic>[number];

function ThreadCard({
  thread,
  userId,
  canModerate,
  showChannel,
  onOpen,
}: {
  thread: FeedThread;
  userId: Id<"users">;
  canModerate: boolean;
  showChannel: boolean;
  onOpen: () => void;
}) {
  const removeThread = useMutation(api.threads.remove);
  const setPinned = useMutation(api.threads.setPinned);
  const canDelete = canModerate || thread.authorId === userId;

  async function handleDelete() {
    if (!window.confirm(`Delete "${thread.title}" and all its replies?`)) return;
    await removeThread({ threadId: thread._id, userId });
  }

  return (
    <article className="flex bg-card border border-border rounded-lg hover:border-border/80 hover:bg-secondary/20 transition-colors">
      <VoteColumn thread={thread} userId={userId} />

      <div className="flex-1 min-w-0 py-3 pr-3">
        <div className="flex items-start justify-between gap-2">
          <button onClick={onOpen} className="min-w-0 text-left">
            <span className="flex items-center gap-1.5">
              {thread.pinned && (
                <Pin className="w-3 h-3 text-primary shrink-0" aria-label="Pinned" />
              )}
              <h3 className="text-sm font-medium text-foreground truncate">{thread.title}</h3>
            </span>
          </button>
          {canDelete && (
            <ActionMenu trigger={<span className="px-1 text-xs leading-none">···</span>} label="Thread actions">
              {(close) => (
                <>
                  {canModerate && (
                    <MenuItem
                      icon={thread.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                      onClick={() => {
                        setPinned({ threadId: thread._id, userId, pinned: !thread.pinned });
                        close();
                      }}
                    >
                      {thread.pinned ? "Unpin thread" : "Pin thread"}
                    </MenuItem>
                  )}
                  <MenuItem
                    danger
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                    onClick={() => {
                      close();
                      handleDelete();
                    }}
                  >
                    Delete thread
                  </MenuItem>
                </>
              )}
            </ActionMenu>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
          {showChannel && (
            <span className="inline-flex items-center gap-0.5 rounded bg-secondary px-1.5 py-0.5 text-foreground/80">
              <Hash className="w-2.5 h-2.5" />
              {thread.channelName}
            </span>
          )}
          {thread.author && (
            <span className="inline-flex items-center gap-1">
              <UserAvatar name={thread.author.name} color={thread.author.avatarColor} size="sm" className="w-4 h-4 text-[8px]" />
              {thread.author.name}
            </span>
          )}
          <span>· {timeAgo(thread.createdAt)}</span>
          <button onClick={onOpen} className="inline-flex items-center gap-1 hover:text-foreground">
            <MessageSquare className="w-3 h-3" />
            {thread.replyCount} {thread.replyCount === 1 ? "reply" : "replies"}
          </button>
        </div>
      </div>
    </article>
  );
}

export function VoteColumn({
  thread,
  userId,
  orientation = "vertical",
}: {
  thread: { _id: Id<"threads">; score: number; myVote: number };
  userId: Id<"users">;
  orientation?: "vertical" | "horizontal";
}) {
  const vote = useMutation(api.threads.vote);

  const arrow = (value: 1 | -1) => (
    <button
      onClick={() => vote({ threadId: thread._id, userId, value })}
      aria-label={value === 1 ? "Upvote" : "Downvote"}
      aria-pressed={thread.myVote === value}
      className={clsx(
        "leading-none",
        thread.myVote === value
          ? value === 1
            ? "text-primary"
            : "text-red-400"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <svg viewBox="0 0 24 24" className={clsx("w-4 h-4", value === -1 && "rotate-180")} fill="currentColor">
        <path d="M12 4l8 9h-5v7H9v-7H4l8-9z" />
      </svg>
    </button>
  );

  return (
    <div
      className={clsx(
        "flex items-center justify-center gap-1 shrink-0",
        orientation === "vertical" ? "flex-col w-10 py-3" : "flex-row",
      )}
    >
      {arrow(1)}
      <span className="text-xs font-semibold text-foreground tabular-nums">
        {compactNumber(thread.score)}
      </span>
      {arrow(-1)}
    </div>
  );
}

function Composer({
  topicId,
  userId,
  textChannels,
  fixedChannel,
  onPosted,
}: {
  topicId: Id<"topics">;
  userId: Id<"users">;
  textChannels: Doc<"channels">[];
  fixedChannel: Doc<"channels"> | null;
  onPosted: (threadId: Id<"threads">) => void;
}) {
  const createThread = useMutation(api.threads.create);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [channelId, setChannelId] = useState<Id<"channels"> | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // In forum mode the author picks a channel; default to the first text one.
  const target = fixedChannel?._id ?? (channelId || textChannels[0]?._id);

  async function handlePost() {
    if (!title.trim() || !body.trim() || !target) return;
    setSubmitting(true);
    setError(null);
    try {
      const threadId = await createThread({ channelId: target, title, authorId: userId, body });
      setTitle("");
      setBody("");
      setOpen(false);
      onPosted(threadId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't post that thread.");
    } finally {
      setSubmitting(false);
    }
  }

  if (textChannels.length === 0) {
    return (
      <div className="border-b border-border px-6 py-3 text-xs text-muted-foreground">
        This topic has no text channels yet, so there's nowhere to post.
      </div>
    );
  }

  if (!open) {
    return (
      <div className="border-b border-border px-6 py-3">
        <button
          onClick={() => setOpen(true)}
          className="w-full text-left rounded-lg bg-secondary/60 border border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary/60"
        >
          Create a post{fixedChannel ? ` in #${fixedChannel.name}` : ""}...
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-border px-6 py-4 bg-secondary/40 space-y-2">
      {!fixedChannel && (
        <select
          value={target ?? ""}
          onChange={(e) => setChannelId(e.target.value as Id<"channels">)}
          className="rounded-lg bg-secondary border border-border px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
        >
          {textChannels.map((c) => (
            <option key={c._id} value={c._id}>
              #{c.name}
            </option>
          ))}
        </select>
      )}
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
        rows={4}
        className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary resize-none"
      />
      {error && (
        <p className="text-[11px] text-red-400" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground px-3 py-1.5">
          Cancel
        </button>
        <button
          onClick={handlePost}
          disabled={submitting || !title.trim() || !body.trim()}
          className="rounded-lg bg-primary text-white text-xs font-medium px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Posting..." : "Post thread"}
        </button>
      </div>
    </div>
  );
}
