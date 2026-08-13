import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logEvent } from "./log";
import { requireModOrOwner } from "./permissions";
import { deleteImages } from "./files";

export const listByTopic = query({
  args: { topicId: v.id("topics") },
  handler: async (ctx, { topicId }) => {
    const channels = await ctx.db
      .query("channels")
      .withIndex("by_topic", (q) => q.eq("topicId", topicId))
      .collect();
    return channels.sort((a, b) => a.order - b.order);
  },
});

export const get = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, { channelId }) => {
    return await ctx.db.get(channelId);
  },
});

export const create = mutation({
  args: {
    topicId: v.id("topics"),
    userId: v.id("users"), // acting user, checked for permission
    name: v.string(),
    type: v.union(v.literal("text"), v.literal("voice")),
  },
  handler: async (ctx, { topicId, userId, name, type }) => {
    await requireModOrOwner(ctx, topicId, userId);

    const existing = await ctx.db
      .query("channels")
      .withIndex("by_topic", (q) => q.eq("topicId", topicId))
      .collect();

    const channelId = await ctx.db.insert("channels", {
      topicId,
      name: name.trim(),
      type,
      order: existing.length,
    });

    const [actor, topic] = await Promise.all([
      ctx.db.get(userId),
      ctx.db.get(topicId),
    ]);
    await logEvent(ctx, {
      type: "channel_created",
      message: `${actor?.name ?? "Someone"} created ${type} channel "${name.trim()}" in "${
        topic?.name ?? "a topic"
      }"`,
      actorId: userId,
      topicId,
    });

    return channelId;
  },
});

export const rename = mutation({
  args: {
    channelId: v.id("channels"),
    userId: v.id("users"),
    name: v.string(),
  },
  handler: async (ctx, { channelId, userId, name }) => {
    const channel = await ctx.db.get(channelId);
    if (!channel) throw new Error("Channel not found");
    await requireModOrOwner(ctx, channel.topicId, userId);

    const trimmed = name.trim();
    if (!trimmed) throw new Error("Channel name can't be empty.");
    if (trimmed === channel.name) return;

    await ctx.db.patch(channelId, { name: trimmed });

    const [actor, topic] = await Promise.all([
      ctx.db.get(userId),
      ctx.db.get(channel.topicId),
    ]);
    await logEvent(ctx, {
      type: "channel_renamed",
      message: `${actor?.name ?? "Someone"} renamed channel "${channel.name}" to "${trimmed}" in "${
        topic?.name ?? "a topic"
      }"`,
      actorId: userId,
      topicId: channel.topicId,
    });
  },
});

export const remove = mutation({
  args: { channelId: v.id("channels"), userId: v.id("users") },
  handler: async (ctx, { channelId, userId }) => {
    const channel = await ctx.db.get(channelId);
    if (!channel) return;
    await requireModOrOwner(ctx, channel.topicId, userId);

    // A text channel's chat history goes with it. Forum threads are topic-level
    // and unaffected, so they survive a channel being deleted.
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .collect();
    await deleteImages(ctx, messages);
    await Promise.all(messages.map((m) => ctx.db.delete(m._id)));

    await ctx.db.delete(channelId);

    const [actor, topic] = await Promise.all([
      ctx.db.get(userId),
      ctx.db.get(channel.topicId),
    ]);
    await logEvent(ctx, {
      type: "channel_deleted",
      message: `${actor?.name ?? "Someone"} deleted channel "${channel.name}" in "${
        topic?.name ?? "a topic"
      }"`,
      actorId: userId,
      topicId: channel.topicId,
    });
  },
});
