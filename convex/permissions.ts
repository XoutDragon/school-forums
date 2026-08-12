import { Doc, Id } from "./_generated/dataModel";
import { QueryCtx } from "./_generated/server";

// Plain helpers (not Convex functions) shared by topics.ts / channels.ts /
// threads.ts so "who is allowed to do this" lives in exactly one place.
//
// Role model, mirroring Discord:
//   owner     — everything, including topic settings, deleting the topic,
//               promoting/demoting moderators and transferring ownership.
//   moderator — channel + content moderation (create/rename/delete channels,
//               pin/delete threads, remove plain members).
//   member    — read/write content only.

export type TopicRole = Doc<"topicMembers">["role"];

export async function getMembership(
  ctx: QueryCtx,
  topicId: Id<"topics">,
  userId: Id<"users">,
) {
  return await ctx.db
    .query("topicMembers")
    .withIndex("by_topic_and_user", (q) =>
      q.eq("topicId", topicId).eq("userId", userId),
    )
    .unique();
}

export async function requireOwner(
  ctx: QueryCtx,
  topicId: Id<"topics">,
  userId: Id<"users">,
) {
  const membership = await getMembership(ctx, topicId, userId);
  if (!membership || membership.role !== "owner") {
    throw new Error("Only the topic owner can do that.");
  }
  return membership;
}

export async function requireModOrOwner(
  ctx: QueryCtx,
  topicId: Id<"topics">,
  userId: Id<"users">,
) {
  const membership = await getMembership(ctx, topicId, userId);
  if (
    !membership ||
    (membership.role !== "owner" && membership.role !== "moderator")
  ) {
    throw new Error("Only the topic owner or a moderator can do that.");
  }
  return membership;
}
