import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getMembership, requireModOrOwner } from "./permissions";
import { deleteImages, imageUrl, requireValidImage } from "./files";

// How much backlog a channel loads. Chat is append-only and read newest-last,
// so this takes the most recent N and hands them back in oldest-first order.
const BACKLOG = 100;

// How much of a replied-to message survives into the quoted preview.
const REPLY_PREVIEW_LENGTH = 120;

// Reused by messages.send and threads.create/reply.
export const imageArgs = {
  imageId: v.optional(v.id("_storage")),
  imageWidth: v.optional(v.number()),
  imageHeight: v.optional(v.number()),
};

export const listByChannel = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, { channelId }) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .order("desc")
      .take(BACKLOG);

    const withAuthors = await Promise.all(
      messages.map(async (m) => {
        const [author, url, replyTo] = await Promise.all([
          ctx.db.get(m.authorId),
          imageUrl(ctx, m.imageId),
          m.replyToId ? ctx.db.get(m.replyToId) : null,
        ]);

        // Denormalized preview only — the composer/UI never needs the full
        // replied-to message, and this keeps listByChannel to one pass.
        let replyPreview = null as {
          _id: typeof messages[number]["_id"];
          authorName: string;
          body: string;
        } | null;

        if (replyTo) {
          const replyAuthor = await ctx.db.get(replyTo.authorId);
          replyPreview = {
            _id: replyTo._id,
            authorName: replyAuthor?.name ?? "Unknown",
            body: replyTo.body
              ? replyTo.body.slice(0, REPLY_PREVIEW_LENGTH)
              : replyTo.imageId
                ? "Image"
                : "",
          };
        }

        return { ...m, author, imageUrl: url, replyTo: replyPreview };
      }),
    );

    return withAuthors.reverse();
  },
});

export const send = mutation({
  args: {
    channelId: v.id("channels"),
    authorId: v.id("users"),
    body: v.string(),
    replyToId: v.optional(v.id("messages")),
    ...imageArgs,
  },
  handler: async (
    ctx,
    { channelId, authorId, body, replyToId, imageId, imageWidth, imageHeight },
  ) => {
    const channel = await ctx.db.get(channelId);
    if (!channel) throw new Error("Channel not found");
    if (channel.type !== "text") {
      throw new Error("You can only send messages in a text channel.");
    }

    const trimmed = body.trim();
    // An image on its own is a valid message; nothing at all isn't.
    if (!trimmed && !imageId) return;

    const membership = await getMembership(ctx, channel.topicId, authorId);
    if (!membership) throw new Error("Join this topic before chatting in it.");

    if (imageId) await requireValidImage(ctx, imageId);

    // A reply only makes sense pointing at a message still in this channel.
    if (replyToId) {
      const replyTo = await ctx.db.get(replyToId);
      if (!replyTo || replyTo.channelId !== channelId) {
        throw new Error("That message no longer exists.");
      }
    }

    return await ctx.db.insert("messages", {
      channelId,
      topicId: channel.topicId,
      authorId,
      body: trimmed,
      createdAt: Date.now(),
      replyToId,
      imageId,
      imageWidth,
      imageHeight,
    });
  },
});

// Authors edit their own messages. No moderator override here — moderators
// can delete a bad message, but rewriting someone else's words isn't a mod
// power the way deletion is.
export const edit = mutation({
  args: {
    messageId: v.id("messages"),
    userId: v.id("users"),
    body: v.string(),
  },
  handler: async (ctx, { messageId, userId, body }) => {
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error("Message not found");
    if (message.authorId !== userId) {
      throw new Error("You can only edit your own messages.");
    }

    const trimmed = body.trim();
    if (!trimmed && !message.imageId) {
      throw new Error("Message can't be empty.");
    }
    if (trimmed === message.body) return; // nothing changed, skip the write

    await ctx.db.patch(messageId, { body: trimmed, editedAt: Date.now() });
  },
});

// Authors can delete their own messages; owners/moderators can delete any.
export const remove = mutation({
  args: { messageId: v.id("messages"), userId: v.id("users") },
  handler: async (ctx, { messageId, userId }) => {
    const message = await ctx.db.get(messageId);
    if (!message) return;

    if (message.authorId !== userId) {
      await requireModOrOwner(ctx, message.topicId, userId);
    }

    await deleteImages(ctx, [message]);
    await ctx.db.delete(messageId);
  },
});