import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getMembership, requireModOrOwner } from "./permissions";
import { deleteImages, imageUrl, requireValidImage } from "./files";

// How much backlog a channel loads. Chat is append-only and read newest-last,
// so this takes the most recent N and hands them back in oldest-first order.
const BACKLOG = 100;

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
        const [author, url] = await Promise.all([
          ctx.db.get(m.authorId),
          imageUrl(ctx, m.imageId),
        ]);
        return { ...m, author, imageUrl: url };
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
    ...imageArgs,
  },
  handler: async (ctx, { channelId, authorId, body, imageId, imageWidth, imageHeight }) => {
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

    return await ctx.db.insert("messages", {
      channelId,
      topicId: channel.topicId,
      authorId,
      body: trimmed,
      createdAt: Date.now(),
      imageId,
      imageWidth,
      imageHeight,
    });
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
