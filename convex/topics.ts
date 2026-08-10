import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// --- Discovery feeds -------------------------------------------------

export const listNew = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("topics").withIndex("by_createdAt").order("desc").take(20);
  },
});

export const listPopular = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("topics").collect();
    return all.sort((a, b) => b.memberCount - a.memberCount).slice(0, 20);
  },
});

// "For you": topics whose interestId matches one of the user's picked interests.
export const listForYou = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const userInterests = await ctx.db
      .query("userInterests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const interestIds = new Set(userInterests.map((r) => r.interestId));
    if (interestIds.size === 0) return [];

    const all = await ctx.db.query("topics").collect();
    return all.filter((t) => t.interestId && interestIds.has(t.interestId));
  },
});

export const get = query({
  args: { topicId: v.id("topics") },
  handler: async (ctx, { topicId }) => {
    return await ctx.db.get(topicId);
  },
});

// --- Membership --------------------------------------------------------

export const getMembership = query({
  args: { topicId: v.id("topics"), userId: v.id("users") },
  handler: async (ctx, { topicId, userId }) => {
    return await ctx.db
      .query("topicMembers")
      .withIndex("by_topic_and_user", (q) => q.eq("topicId", topicId).eq("userId", userId))
      .unique();
  },
});

export const listMembers = query({
  args: { topicId: v.id("topics") },
  handler: async (ctx, { topicId }) => {
    const rows = await ctx.db
      .query("topicMembers")
      .withIndex("by_topic", (q) => q.eq("topicId", topicId))
      .collect();
    const users = await Promise.all(
      rows.map(async (r) => ({ ...(await ctx.db.get(r.userId)), role: r.role }))
    );
    return users;
  },
});

export const join = mutation({
  args: { topicId: v.id("topics"), userId: v.id("users") },
  handler: async (ctx, { topicId, userId }) => {
    const existing = await ctx.db
      .query("topicMembers")
      .withIndex("by_topic_and_user", (q) => q.eq("topicId", topicId).eq("userId", userId))
      .unique();
    if (existing) return existing._id;

    const topic = await ctx.db.get(topicId);
    if (!topic) throw new Error("Topic not found");

    await ctx.db.patch(topicId, { memberCount: topic.memberCount + 1 });

    return await ctx.db.insert("topicMembers", {
      topicId,
      userId,
      role: "member",
      joinedAt: Date.now(),
    });
  },
});

export const leave = mutation({
  args: { topicId: v.id("topics"), userId: v.id("users") },
  handler: async (ctx, { topicId, userId }) => {
    const membership = await ctx.db
      .query("topicMembers")
      .withIndex("by_topic_and_user", (q) => q.eq("topicId", topicId).eq("userId", userId))
      .unique();
    if (!membership) return;
    if (membership.role === "owner") {
      throw new Error("Owners can't leave their own topic yet — transfer ownership first.");
    }

    const topic = await ctx.db.get(topicId);
    if (topic) await ctx.db.patch(topicId, { memberCount: Math.max(0, topic.memberCount - 1) });

    await ctx.db.delete(membership._id);
  },
});

// --- Create a topic ------------------------------------------------------
// Any logged-in student can create a topic. Creating it also provisions a
// default #general text channel and a "Hangout" voice channel, and makes
// the creator the owner (full permission management rights).

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    interestId: v.optional(v.id("interests")),
    createdBy: v.id("users"),
  },
  handler: async (ctx, { name, description, interestId, createdBy }) => {
    const topicId = await ctx.db.insert("topics", {
      name: name.trim(),
      description: description.trim(),
      interestId,
      createdBy,
      memberCount: 1,
      createdAt: Date.now(),
    });

    await ctx.db.insert("topicMembers", {
      topicId,
      userId: createdBy,
      role: "owner",
      joinedAt: Date.now(),
    });

    await ctx.db.insert("channels", {
      topicId,
      name: "general",
      type: "text",
      order: 0,
    });

    await ctx.db.insert("channels", {
      topicId,
      name: "Hangout",
      type: "voice",
      order: 1,
      // voiceRoomName gets set once LiveKit (or similar) provisioning is wired up.
    });

    return topicId;
  },
});
