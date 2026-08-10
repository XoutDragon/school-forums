import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

async function requireModOrOwner(ctx: any, topicId: any, userId: any) {
  const membership = await ctx.db
    .query("topicMembers")
    .withIndex("by_topic_and_user", (q: any) => q.eq("topicId", topicId).eq("userId", userId))
    .unique();
  if (!membership || (membership.role !== "owner" && membership.role !== "moderator")) {
    throw new Error("Only the topic owner or moderators can manage channels.");
  }
}

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

    return await ctx.db.insert("channels", {
      topicId,
      name: name.trim(),
      type,
      order: existing.length,
    });
  },
});

export const remove = mutation({
  args: { channelId: v.id("channels"), userId: v.id("users") },
  handler: async (ctx, { channelId, userId }) => {
    const channel = await ctx.db.get(channelId);
    if (!channel) return;
    await requireModOrOwner(ctx, channel.topicId, userId);
    await ctx.db.delete(channelId);
  },
});
