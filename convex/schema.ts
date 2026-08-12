import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Singleton row created by the first-run setup wizard. Its existence (and
  // setupComplete flag) is what decides whether new visitors get sent to
  // /admin/setup or the normal student login.
  institutionConfig: defineTable({
    institutionName: v.string(),
    // Email domains allowed to sign in, e.g. ["student.edu", "alumni.edu"].
    // Stored without the "@".
    allowedDomains: v.array(v.string()),
    adminPasswordSalt: v.string(),
    adminPasswordHash: v.string(),
    setupComplete: v.boolean(),
    createdAt: v.number(),
  }),

  // Lightweight admin session tokens (separate from student mock-auth).
  // Client stores the token and passes it back on every admin
  // query/mutation; the server validates it hasn't expired.
  adminSessions: defineTable({
    token: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),

  // Institution-wide audit trail: role/topic/channel lifecycle events.
  // Deliberately does NOT log message/thread content — that stays the
  // responsibility of individual topic owners/moderators.
  auditLogs: defineTable({
    type: v.string(), // "topic_created" | "topic_deleted" | "channel_created" | ...
    message: v.string(), // human-readable summary shown in the dashboard
    actorId: v.optional(v.id("users")),
    actorLabel: v.optional(v.string()), // e.g. "Admin" for admin-initiated actions
    topicId: v.optional(v.id("topics")),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  // Students / alumni. In the mock-auth MVP this is created on "login"
  // by email lookup. Swap for real SSO later without changing the shape.
  users: defineTable({
    name: v.string(),
    email: v.string(),
    isAlumni: v.boolean(),
    avatarColor: v.string(), // simple generated color, no upload needed for MVP
    onboarded: v.boolean(), // has picked interests
  }).index("by_email", ["email"]),

  // Fixed catalog of interests shown during onboarding (classes/clubs/hobbies).
  interests: defineTable({
    label: v.string(),
    category: v.union(
      v.literal("major"),
      v.literal("class"),
      v.literal("club"),
      v.literal("hobby"),
      v.literal("other"),
    ),
  }),

  userInterests: defineTable({
    userId: v.id("users"),
    interestId: v.id("interests"),
  })
    .index("by_user", ["userId"])
    .index("by_interest", ["interestId"]),

  // A "topic" is the Discord-server / subreddit equivalent.
  topics: defineTable({
    name: v.string(),
    description: v.string(),
    interestId: v.optional(v.id("interests")), // what it's related to, for recommendations
    createdBy: v.id("users"),
    memberCount: v.number(),
    createdAt: v.number(),
  })
    .index("by_interest", ["interestId"])
    .index("by_creator", ["createdBy"])
    .index("by_createdAt", ["createdAt"]),

  topicMembers: defineTable({
    topicId: v.id("topics"),
    userId: v.id("users"),
    role: v.union(
      v.literal("owner"),
      v.literal("moderator"),
      v.literal("member"),
    ),
    joinedAt: v.number(),
  })
    .index("by_topic", ["topicId"])
    .index("by_user", ["userId"])
    .index("by_topic_and_user", ["topicId", "userId"]),

  // Text and voice channels that belong to a topic.
  channels: defineTable({
    topicId: v.id("topics"),
    name: v.string(),
    type: v.union(v.literal("text"), v.literal("voice")),
    order: v.number(),
    // Populated when voice provisioning (e.g. LiveKit) is wired up.
    voiceRoomName: v.optional(v.string()),
  }).index("by_topic", ["topicId"]),

  // Reddit-style threads live inside a text channel.
  threads: defineTable({
    channelId: v.id("channels"),
    topicId: v.id("topics"),
    title: v.string(),
    authorId: v.id("users"),
    createdAt: v.number(),
    pinned: v.boolean(),
    replyCount: v.number(),
    // Cached upvotes-minus-downvotes so the forum feed can sort without
    // reading every vote row. Optional because threads created before
    // voting existed don't have it — treat missing as 0.
    score: v.optional(v.number()),
  })
    .index("by_channel", ["channelId"])
    .index("by_topic", ["topicId"]),

  // One row per (thread, user) vote. value is +1 or -1; removing a vote
  // deletes the row rather than storing 0.
  threadVotes: defineTable({
    threadId: v.id("threads"),
    userId: v.id("users"),
    value: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_user", ["userId"])
    .index("by_thread_and_user", ["threadId", "userId"]),

  posts: defineTable({
    threadId: v.id("threads"),
    authorId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
    parentPostId: v.optional(v.id("posts")), // for nested replies
  }).index("by_thread", ["threadId"]),
});
