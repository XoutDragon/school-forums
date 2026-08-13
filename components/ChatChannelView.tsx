"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import clsx from "clsx";
import { Hash, Trash2 } from "lucide-react";
import { UserAvatar } from "@/components/UserBadge";
import {
  AttachImageButton,
  AttachedImage,
  PendingImagePreview,
} from "@/components/ImageAttachment";
import { useImageUpload } from "@/lib/useImageUpload";

type Message = FunctionReturnType<typeof api.messages.listByChannel>[number];

// Consecutive messages from the same person within this window get stacked
// under one header, the way Discord groups them.
const GROUP_WINDOW_MS = 5 * 60 * 1000;

// A text channel is live chat: a running message log with a composer at the
// bottom. Titles, votes and replies belong to the forum, not here.
export default function ChatChannelView({
  channel,
  userId,
  canModerate,
}: {
  channel: Doc<"channels">;
  userId: Id<"users">;
  canModerate: boolean;
}) {
  const messages = useQuery(api.messages.listByChannel, { channelId: channel._id });
  const send = useMutation(api.messages.send);

  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const image = useImageUpload();

  // Stick to the newest message, both on channel switch and as messages arrive.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, channel._id]);

  async function handleSend() {
    const text = body.trim();
    // An image on its own is a valid message.
    if (!text && !image.pending) return;
    setBody("");
    setError(null);
    try {
      // Upload happens here, not at attach time, so cancelling costs nothing.
      const uploaded = await image.upload(userId);
      await send({
        channelId: channel._id,
        authorId: userId,
        body: text,
        ...(uploaded ?? {}),
      });
      image.clear();
    } catch (e) {
      setBody(text); // don't lose what they typed
      setError(e instanceof Error ? e.message : "Couldn't send that message.");
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="border-b border-border px-6 py-3.5 flex items-center gap-1.5">
        <Hash className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{channel.name}</h2>
        <span className="ml-2 text-[11px] text-muted-foreground">Live chat</span>
      </header>

      <div
        className={clsx(
          "flex-1 overflow-y-auto px-6 py-4 relative",
          dragging && "outline-2 -outline-offset-2 outline-dashed outline-primary/60",
        )}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          image.attachFromTransfer(e.dataTransfer);
        }}
      >
        {dragging && (
          <p className="sticky top-0 text-center text-xs text-primary">
            Drop an image to attach it
          </p>
        )}
        {messages === undefined && (
          <p className="text-sm text-muted-foreground">Loading messages...</p>
        )}
        {messages?.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-1 text-center">
            <Hash className="w-8 h-8 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">Welcome to #{channel.name}</p>
            <p className="text-xs text-muted-foreground">
              This is the start of the channel. Say something.
            </p>
          </div>
        )}
        {messages?.map((message, i) => (
          <MessageRow
            key={message._id}
            message={message}
            previous={messages[i - 1]}
            userId={userId}
            canModerate={canModerate}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-6 pb-4">
        {(error || image.error) && (
          <p className="mb-1.5 text-[11px] text-red-400" role="alert">
            {error ?? image.error}
          </p>
        )}
        {image.pending && (
          <div className="mb-2">
            <PendingImagePreview
              pending={image.pending}
              uploading={image.uploading}
              onRemove={image.clear}
            />
          </div>
        )}
        <div className="flex items-end gap-2 rounded-lg bg-secondary border border-border px-3 py-2 focus-within:border-primary">
          <AttachImageButton onFile={image.attach} disabled={image.uploading} />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onPaste={(e) => {
              // Screenshot straight from the clipboard.
              if (image.attachFromTransfer(e.clipboardData)) e.preventDefault();
            }}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter starts a new line.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder={`Message #${channel.name}`}
            className="flex-1 min-w-0 bg-transparent text-sm text-foreground outline-none resize-none max-h-32 py-1"
          />
          <button
            onClick={handleSend}
            disabled={image.uploading || (!body.trim() && !image.pending)}
            className="rounded-md bg-primary text-white text-xs font-medium px-2.5 py-1.5 hover:opacity-90 disabled:opacity-40"
          >
            {image.uploading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageRow({
  message,
  previous,
  userId,
  canModerate,
}: {
  message: Message;
  previous: Message | undefined;
  userId: Id<"users">;
  canModerate: boolean;
}) {
  const removeMessage = useMutation(api.messages.remove);
  const canDelete = canModerate || message.authorId === userId;

  const grouped =
    previous !== undefined &&
    previous.authorId === message.authorId &&
    message.createdAt - previous.createdAt < GROUP_WINDOW_MS;

  const newDay =
    previous !== undefined &&
    new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString();

  const time = new Date(message.createdAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <>
      {newDay && (
        <div className="flex items-center gap-3 my-4">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {new Date(message.createdAt).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
      )}

      <div
        className={clsx(
          "group/msg flex gap-2.5 px-2 -mx-2 py-0.5 rounded hover:bg-secondary/40",
          // Grouped messages tuck in under the previous one; new speakers get air.
          !(grouped && !newDay) && "mt-3",
        )}
      >
        <div className="w-9 shrink-0">
          {grouped && !newDay ? (
            <span className="hidden group-hover/msg:block text-[10px] text-muted-foreground pt-1 tabular-nums">
              {time}
            </span>
          ) : (
            <UserAvatar
              name={message.author?.name ?? "?"}
              color={message.author?.avatarColor ?? "#3f4451"}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {(!grouped || newDay) && (
            <p className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {message.author?.name ?? "Unknown"}
              </span>
              <span className="text-[10px] text-muted-foreground">{time}</span>
            </p>
          )}
          {message.body && (
            <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
              {message.body}
            </p>
          )}
          {message.imageUrl && (
            <AttachedImage
              url={message.imageUrl}
              width={message.imageWidth}
              height={message.imageHeight}
              alt={`Image from ${message.author?.name ?? "a member"}`}
            />
          )}
        </div>

        {canDelete && (
          <button
            aria-label="Delete message"
            onClick={() => removeMessage({ messageId: message._id, userId })}
            className="opacity-0 group-hover/msg:opacity-100 self-start text-muted-foreground hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </>
  );
}
