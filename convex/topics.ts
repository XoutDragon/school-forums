import { v } from "convex/values";
import { MutationCtx, mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { logEvent } from "./log";
import { requireAdminSession } from "./admin";
import {
  getMembership as findMembership,
  requireModOrOwner,
  requireOwner,
} from "./permissions";

// --- Discovery feeds -------------------------------------------------

export const listNew = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("topics")
      .withIndex("by_createdAt")
      .order("desc")
      .take(20);
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
      .withIndex("by_topic_and_user", (q) =>
        q.eq("topicId", topicId).eq("userId", userId),
      )
      .unique();
  },
});

const ROLE_RANK = { owner: 0, moderator: 1, member: 2 } as const;

export const listMembers = query({
  args: { topicId: v.id("topics") },
  handler: async (ctx, { topicId }) => {
    const rows = await ctx.db
      .query("topicMembers")
      .withIndex("by_topic", (q) => q.eq("topicId", topicId))
      .collect();
    const users = await Promise.all(
      rows.map(async (r) => {
        const user = await ctx.db.get(r.userId);
        return user ? { ...user, role: r.role, joinedAt: r.joinedAt } : null;
      }),
    );
    // Drop memberships whose user row is gone so callers get a fully-typed user.
    return users
      .filter((u) => u !== null)
      .sort(
        (a, b) =>
          ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
          a.name.localeCompare(b.name),
      );
  },
});

export const join = mutation({
  args: { topicId: v.id("topics"), userId: v.id("users") },
  handler: async (ctx, { topicId, userId }) => {
    const existing = await ctx.db
      .query("topicMembers")
      .withIndex("by_topic_and_user", (q) =>
        q.eq("topicId", topicId).eq("userId", userId),
      )
      .unique();
    if (existing) return existing._id;

    const topic = await ctx.db.get(topicId);
    if (!topic) throw new Error("Topic not found");

    await ctx.db.patch(topicId, { memberCount: topic.memberCount + 1 });

    const member = await ctx.db.get(userId);
    await logEvent(ctx, {
      type: "member_joined",
      message: `${member?.name ?? "Someone"} joined "${topic.name}"`,
      actorId: userId,
      topicId,
    });

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
      .withIndex("by_topic_and_user", (q) =>
        q.eq("topicId", topicId).eq("userId", userId),
      )
      .unique();
    if (!membership) return;
    if (membership.role === "owner") {
      throw new Error(
        "Owners can't leave their own topic yet — transfer ownership first.",
      );
    }

    const topic = await ctx.db.get(topicId);
    if (topic)
      await ctx.db.patch(topicId, {
        memberCount: Math.max(0, topic.memberCount - 1),
      });

    const member = await ctx.db.get(userId);
    await logEvent(ctx, {
      type: "member_left",
      message: `${member?.name ?? "Someone"} left "${topic?.name ?? "a topic"}"`,
      actorId: userId,
      topicId,
    });

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

    const creator = await ctx.db.get(createdBy);
    await logEvent(ctx, {
      type: "topic_created",
      message: `${creator?.name ?? "A student"} created topic "${name.trim()}"`,
      actorId: createdBy,
      topicId,
    });

    return topicId;
  },
});

// --- Owner / moderator management -------------------------------------------
// These are the in-app equivalents of Discord's "Server Settings" and member
// context menu. They're gated on the acting user's own membership role, so an
// owner can run their topic without needing institution-wide admin rights.

export const updateSettings = mutation({
  args: {
    topicId: v.id("topics"),
    actorId: v.id("users"),
    name: v.string(),
    description: v.string(),
    interestId: v.optional(v.id("interests")),
  },
  handler: async (ctx, { topicId, actorId, name, description, interestId }) => {
    await requireOwner(ctx, topicId, actorId);

    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Topic name can't be empty.");

    const topic = await ctx.db.get(topicId);
    if (!topic) throw new Error("Topic not found");

    await ctx.db.patch(topicId, {
      name: trimmedName,
      description: description.trim(),
      interestId,
    });

    const actor = await ctx.db.get(actorId);
    await logEvent(ctx, {
      type: "topic_updated",
      message:
        topic.name === trimmedName
          ? `${actor?.name ?? "The owner"} updated settings for "${trimmedName}"`
          : `${actor?.name ?? "The owner"} renamed "${topic.name}" to "${trimmedName}"`,
      actorId,
      topicId,
    });
  },
});

export const setRole = mutation({
  args: {
    topicId: v.id("topics"),
    actorId: v.id("users"),
    userId: v.id("users"),
    role: v.union(v.literal("moderator"), v.literal("member")),
  },
  handler: async (ctx, { topicId, actorId, userId, role }) => {
    // Only the owner can hand out or take away moderator. Transferring the
    // owner role itself goes through transferOwnership so there's always
    // exactly one owner.
    await requireOwner(ctx, topicId, actorId);

    const membership = await findMembership(ctx, topicId, userId);
    if (!membership) throw new Error("That user isn't a member of this topic.");
    if (membership.role === "owner") {
      throw new Error("Use 'Transfer ownership' to change the owner's role.");
    }
    if (membership.role === role) return;

    await ctx.db.patch(membership._id, { role });

    const [actor, user, topic] = await Promise.all([
      ctx.db.get(actorId),
      ctx.db.get(userId),
      ctx.db.get(topicId),
    ]);
    await logEvent(ctx, {
      type: "role_changed",
      message: `${actor?.name ?? "The owner"} set ${user?.name ?? "a member"}'s role to "${role}" in "${topic?.name ?? "a topic"}"`,
      actorId,
      topicId,
    });
  },
});

export const removeMember = mutation({
  args: {
    topicId: v.id("topics"),
    actorId: v.id("users"),
    userId: v.id("users"),
  },
  handler: async (ctx, { topicId, actorId, userId }) => {
    const actorMembership = await requireModOrOwner(ctx, topicId, actorId);
    if (actorId === userId) {
      throw new Error("Use 'Leave topic' to remove yourself.");
    }

    const membership = await findMembership(ctx, topicId, userId);
    if (!membership) return;
    if (membership.role === "owner") {
      throw new Error("The owner can't be removed from their own topic.");
    }
    // Moderators police members; only the owner can kick another moderator.
    if (membership.role === "moderator" && actorMembership.role !== "owner") {
      throw new Error("Only the owner can remove a moderator.");
    }

    const topic = await ctx.db.get(topicId);
    if (topic) {
      await ctx.db.patch(topicId, {
        memberCount: Math.max(0, topic.memberCount - 1),
      });
    }
    await ctx.db.delete(membership._id);

    const [actor, user] = await Promise.all([
      ctx.db.get(actorId),
      ctx.db.get(userId),
    ]);
    await logEvent(ctx, {
      type: "member_removed",
      message: `${actor?.name ?? "A moderator"} removed ${user?.name ?? "a member"} from "${topic?.name ?? "a topic"}"`,
      actorId,
      topicId,
    });
  },
});

export const transferOwnership = mutation({
  args: {
    topicId: v.id("topics"),
    actorId: v.id("users"),
    newOwnerId: v.id("users"),
  },
  handler: async (ctx, { topicId, actorId, newOwnerId }) => {
    const current = await requireOwner(ctx, topicId, actorId);
    if (actorId === newOwnerId) return;

    const next = await findMembership(ctx, topicId, newOwnerId);
    if (!next) throw new Error("That user isn't a member of this topic.");

    // Outgoing owner keeps moderator so they don't lock themselves out of
    // the channels they built.
    await ctx.db.patch(current._id, { role: "moderator" });
    await ctx.db.patch(next._id, { role: "owner" });
    await ctx.db.patch(topicId, { createdBy: newOwnerId });

    const [actor, newOwner, topic] = await Promise.all([
      ctx.db.get(actorId),
      ctx.db.get(newOwnerId),
      ctx.db.get(topicId),
    ]);
    await logEvent(ctx, {
      type: "ownership_transferred",
      message: `${actor?.name ?? "The owner"} transferred ownership of "${topic?.name ?? "a topic"}" to ${newOwner?.name ?? "another member"}`,
      actorId,
      topicId,
    });
  },
});

export const remove = mutation({
  args: { topicId: v.id("topics"), actorId: v.id("users") },
  handler: async (ctx, { topicId, actorId }) => {
    await requireOwner(ctx, topicId, actorId);

    const topic = await ctx.db.get(topicId);
    if (!topic) return;

    await cascadeDeleteTopic(ctx, topicId);

    const actor = await ctx.db.get(actorId);
    await logEvent(ctx, {
      type: "topic_deleted",
      message: `${actor?.name ?? "The owner"} deleted topic "${topic.name}"`,
      actorId,
    });
  },
});

// --- Admin-only management --------------------------------------------------
// Gated by admin session token (see convex/admin.ts) rather than a user id,
// since IT staff managing this aren't necessarily topic members themselves.

export const adminChangeRole = mutation({
  args: {
    adminToken: v.string(),
    topicId: v.id("topics"),
    userId: v.id("users"),
    role: v.union(
      v.literal("owner"),
      v.literal("moderator"),
      v.literal("member"),
    ),
  },
  handler: async (ctx, { adminToken, topicId, userId, role }) => {
    await requireAdminSession(ctx, adminToken);

    const membership = await ctx.db
      .query("topicMembers")
      .withIndex("by_topic_and_user", (q) =>
        q.eq("topicId", topicId).eq("userId", userId),
      )
      .unique();
    if (!membership) throw new Error("That user isn't a member of this topic.");

    await ctx.db.patch(membership._id, { role });

    const [user, topic] = await Promise.all([
      ctx.db.get(userId),
      ctx.db.get(topicId),
    ]);
    await logEvent(ctx, {
      type: "role_changed",
      message: `Admin set ${user?.name ?? "a member"}'s role to "${role}" in "${topic?.name ?? "a topic"}"`,
      actorLabel: "Admin",
      topicId,
    });
  },
});

export const adminRemoveMember = mutation({
  args: {
    adminToken: v.string(),
    topicId: v.id("topics"),
    userId: v.id("users"),
  },
  handler: async (ctx, { adminToken, topicId, userId }) => {
    await requireAdminSession(ctx, adminToken);

    const membership = await ctx.db
      .query("topicMembers")
      .withIndex("by_topic_and_user", (q) =>
        q.eq("topicId", topicId).eq("userId", userId),
      )
      .unique();
    if (!membership) return;

    const topic = await ctx.db.get(topicId);
    if (topic)
      await ctx.db.patch(topicId, {
        memberCount: Math.max(0, topic.memberCount - 1),
      });
    await ctx.db.delete(membership._id);

    const user = await ctx.db.get(userId);
    await logEvent(ctx, {
      type: "member_removed",
      message: `Admin removed ${user?.name ?? "a member"} from "${topic?.name ?? "a topic"}"`,
      actorLabel: "Admin",
      topicId,
    });
  },
});

export const adminDeleteTopic = mutation({
  args: { adminToken: v.string(), topicId: v.id("topics") },
  handler: async (ctx, { adminToken, topicId }) => {
    await requireAdminSession(ctx, adminToken);

    const topic = await ctx.db.get(topicId);
    if (!topic) return;

    await cascadeDeleteTopic(ctx, topicId);

    await logEvent(ctx, {
      type: "topic_deleted",
      message: `Admin deleted topic "${topic.name}"`,
      actorLabel: "Admin",
    });
  },
});

// Deletes a topic and everything hanging off it: memberships, channels,
// threads, the threads' posts and votes. Shared by the owner-initiated
// `remove` and the admin-initiated `adminDeleteTopic` so the two can't
// drift apart and leave orphaned rows behind.
async function cascadeDeleteTopic(ctx: MutationCtx, topicId: Id<"topics">) {
  const [members, channels] = await Promise.all([
    ctx.db
      .query("topicMembers")
      .withIndex("by_topic", (q) => q.eq("topicId", topicId))
      .collect(),
    ctx.db
      .query("channels")
      .withIndex("by_topic", (q) => q.eq("topicId", topicId))
      .collect(),
  ]);

  for (const channel of channels) {
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_channel", (q) => q.eq("channelId", channel._id))
      .collect();
    for (const thread of threads) {
      const [posts, votes] = await Promise.all([
        ctx.db
          .query("posts")
          .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
          .collect(),
        ctx.db
          .query("threadVotes")
          .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
          .collect(),
      ]);
      await Promise.all([
        ...posts.map((p) => ctx.db.delete(p._id)),
        ...votes.map((vote) => ctx.db.delete(vote._id)),
      ]);
      await ctx.db.delete(thread._id);
    }
    await ctx.db.delete(channel._id);
  }

  await Promise.all(members.map((m) => ctx.db.delete(m._id)));
  await ctx.db.delete(topicId);
}
