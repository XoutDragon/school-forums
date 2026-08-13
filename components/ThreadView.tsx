"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ArrowLeft, Pin, PinOff, Trash2 } from "lucide-react";
import ActionMenu, { MenuItem } from "@/components/ActionMenu";
import { UserAvatar } from "@/components/UserBadge";
import { VoteColumn } from "@/components/ForumView";
import {
  AttachImageButton,
  AttachedImage,
  PendingImagePreview,
} from "@/components/ImageAttachment";
import { useImageUpload } from "@/lib/useImageUpload";
import { timeAgo } from "@/lib/format";

// Reddit-style thread page: the opening post, then its replies in order.
export default function ThreadView({
  threadId,
  userId,
  canModerate,
  onBack,
  onDeleted,
}: {
  threadId: Id<"threads">;
  userId: Id<"users">;
  canModerate: boolean;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const thread = useQuery(api.threads.get, { threadId, userId });
  const posts = useQuery(api.threads.listPosts, { threadId });
  const reply = useMutation(api.threads.reply);
  const setPinned = useMutation(api.threads.setPinned);
  const removeThread = useMutation(api.threads.remove);

  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const image = useImageUpload();

  if (thread === undefined) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Loading thread...
      </div>
    );
  }

  // Deleted from under us (by the author elsewhere, or a moderator).
  if (thread === null) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        This post no longer exists.
        <button onClick={onBack} className="text-xs text-primary">
          Back to the forum
        </button>
      </div>
    );
  }

  const [opening, ...replies] = posts ?? [];
  const canDelete = canModerate || thread.authorId === userId;

  async function handleReply() {
    if (!body.trim() && !image.pending) return;
    setSubmitting(true);
    setError(null);
    try {
      const uploaded = await image.upload(userId);
      await reply({ threadId, authorId: userId, body, ...(uploaded ?? {}) });
      setBody("");
      image.clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't post that reply.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${thread!.title}" and all its replies?`)) return;
    await removeThread({ threadId, userId });
    onDeleted();
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="border-b border-border px-6 py-3.5 flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to forum
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex gap-3">
          <VoteColumn thread={thread} userId={userId} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
                {thread.pinned && <Pin className="w-4 h-4 text-primary shrink-0" aria-label="Pinned" />}
                {thread.title}
              </h1>
              {canDelete && (
                <ActionMenu trigger={<span className="px-1 text-xs leading-none">···</span>} label="Thread actions">
                  {(close) => (
                    <>
                      {canModerate && (
                        <MenuItem
                          icon={thread.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                          onClick={() => {
                            setPinned({ threadId, userId, pinned: !thread.pinned });
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

            <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1.5">
              {thread.author && (
                <>
                  <UserAvatar
                    name={thread.author.name}
                    color={thread.author.avatarColor}
                    size="sm"
                    className="w-4 h-4 text-[8px]"
                  />
                  {thread.author.name}
                </>
              )}
              · {timeAgo(thread.createdAt)}
            </p>

            {opening?.body && (
              <p className="mt-3 text-sm text-foreground/90 whitespace-pre-wrap">{opening.body}</p>
            )}
            {opening?.imageUrl && (
              <AttachedImage
                url={opening.imageUrl}
                width={opening.imageWidth}
                height={opening.imageHeight}
                alt={`Image in ${thread.title}`}
                maxHeight={480}
              />
            )}
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-4">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {thread.replyCount} {thread.replyCount === 1 ? "reply" : "replies"}
          </h2>

          <div className="mt-3 space-y-4">
            {posts === undefined && <p className="text-sm text-muted-foreground">Loading replies...</p>}
            {posts !== undefined && replies.length === 0 && (
              <p className="text-sm text-muted-foreground">No replies yet — be the first.</p>
            )}
            {replies.map((post) => (
              <div key={post._id} className="flex gap-2.5">
                <UserAvatar
                  name={post.author?.name ?? "?"}
                  color={post.author?.avatarColor ?? "#3f4451"}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    <span className="text-foreground font-medium">{post.author?.name ?? "Unknown"}</span>{" "}
                    · {timeAgo(post.createdAt)}
                  </p>
                  {post.body && (
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap mt-0.5">{post.body}</p>
                  )}
                  {post.imageUrl && (
                    <AttachedImage
                      url={post.imageUrl}
                      width={post.imageWidth}
                      height={post.imageHeight}
                      alt={`Image from ${post.author?.name ?? "a member"}`}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border px-6 py-3 space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onPaste={(e) => {
            if (image.attachFromTransfer(e.clipboardData)) e.preventDefault();
          }}
          placeholder="Write a reply..."
          rows={2}
          className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary resize-none"
        />
        {image.pending && (
          <PendingImagePreview
            pending={image.pending}
            uploading={image.uploading}
            onRemove={image.clear}
          />
        )}
        {(error || image.error) && (
          <p className="text-[11px] text-red-400" role="alert">
            {error ?? image.error}
          </p>
        )}
        <div className="flex items-center justify-between">
          <AttachImageButton onFile={image.attach} disabled={image.uploading} />
          <button
            onClick={handleReply}
            disabled={submitting || (!body.trim() && !image.pending)}
            className="rounded-lg bg-primary text-white text-xs font-medium px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Posting..." : "Reply"}
          </button>
        </div>
      </div>
    </div>
  );
}
