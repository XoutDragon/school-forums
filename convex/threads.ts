import { v } from "convex/values";
import { QueryCtx, mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getMembership, requireModOrOwner } from "./permissions";

// `score` is optional on the table (threads predating voting don't have it),
// so every read path funnels through this instead of touching t.score.
const scoreOf = (thread: Doc<"threads">) => thread.score ?? 0;

// Reddit's "hot": score decayed by age so a busy thread from this morning
// outranks a slightly-higher-scored one from last week.
function hotRank(thread: Doc<"threads">, now: number) {
  const hours = Math.max(0, (now - thread.createdAt) / 3_600_000);
  return (scoreOf(thread) + thread.replyCount) / Math.pow(hours + 2, 1.5);
}

// Decorates threads with author, channel, and (if a userId is given) which way
// the viewer voted, which is what the forum feed renders.
async function decorate(
  ctx: QueryCtx,
  threads: Doc<"threads">[],
  userId?: Id<"users">,
) {
  return await Promise.all(
    threads.map(async (thread) => {
      const [author, channel, vote] = await Promise.all([
        ctx.db.get(thread.authorId),
        ctx.db.get(thread.channelId),
        userId
          ? ctx.db
              .query("threadVotes")
              .withIndex("by_thread_and_user", (q) =>
                q.eq("threadId", thread._id).eq("userId", userId),
              )
              .unique()
          : null,
      ]);
      return {
        ...thread,
        score: scoreOf(thread),
        author,
        channelName: channel?.name ?? "deleted",
        myVote: vote?.value ?? 0,
      };
    }),
  );
}

export const sortOrder = v.union(
  v.literal("hot"),
  v.literal("new"),
  v.literal("top"),
);

function sortThreads<T extends Doc<"threads">>(
  threads: T[],
  sort: "hot" | "new" | "top",
  now: number,
): T[] {
  return [...threads].sort((a, b) => {
    // Pinned threads always ride at the top, whatever the sort.
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sort === "new") return b.createdAt - a.createdAt;
    if (sort === "top") return scoreOf(b) - scoreOf(a) || b.createdAt - a.createdAt;
    return hotRank(b, now) - hotRank(a, now);
  });
}

// The reddit-style front page: every thread in the topic, across all of its
// text channels. Backs the "Forum" entry pinned above the channel list.
export const listByTopic = query({
  args: {
    topicId: v.id("topics"),
    userId: v.optional(v.id("users")),
    sort: v.optional(sortOrder),
  },
  handler: async (ctx, { topicId, userId, sort }) => {
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_topic", (q) => q.eq("topicId", topicId))
      .collect();

    const decorated = await decorate(ctx, threads, userId);
    return sortThreads(decorated, sort ?? "hot", Date.now());
  },
});

export const listByChannel = query({
  args: {
    channelId: v.id("channels"),
    userId: v.optional(v.id("users")),
    sort: v.optional(sortOrder),
  },
  handler: async (ctx, { channelId, userId, sort }) => {
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .collect();

    const decorated = await decorate(ctx, threads, userId);
    return sortThreads(decorated, sort ?? "new", Date.now());
  },
});

export const get = query({
  args: { threadId: v.id("threads"), userId: v.optional(v.id("users")) },
  handler: async (ctx, { threadId, userId }) => {
    const thread = await ctx.db.get(threadId);
    if (!thread) return null;
    const [decorated] = await decorate(ctx, [thread], userId);
    return decorated;
  },
});

export const create = mutation({
  args: {
    channelId: v.id("channels"),
    title: v.string(),
    authorId: v.id("users"),
    body: v.string(),
  },
  handler: async (ctx, { channelId, title, authorId, body }) => {
    const channel = await ctx.db.get(channelId);
    if (!channel) throw new Error("Channel not found");
    if (channel.type !== "text") throw new Error("Threads can only be created in text channels");

    const membership = await getMembership(ctx, channel.topicId, authorId);
    if (!membership) throw new Error("Join this topic before posting in it.");

    const threadId = await ctx.db.insert("threads", {
      channelId,
      topicId: channel.topicId,
      title: title.trim(),
      authorId,
      createdAt: Date.now(),
      pinned: false,
      replyCount: 0,
      score: 1,
    });

    // The thread's own body is stored as its first post.
    await ctx.db.insert("posts", {
      threadId,
      authorId,
      body,
      createdAt: Date.now(),
    });

    // Reddit-style: your own post starts out self-upvoted.
    await ctx.db.insert("threadVotes", { threadId, userId: authorId, value: 1 });

    return threadId;
  },
});

// Up/downvote a thread. Sending the same direction again clears the vote,
// which is how the arrows toggle off.
export const vote = mutation({
  args: {
    threadId: v.id("threads"),
    userId: v.id("users"),
    value: v.union(v.literal(1), v.literal(-1)),
  },
  handler: async (ctx, { threadId, userId, value }) => {
    const thread = await ctx.db.get(threadId);
    if (!thread) throw new Error("Thread not found");

    const existing = await ctx.db
      .query("threadVotes")
      .withIndex("by_thread_and_user", (q) =>
        q.eq("threadId", threadId).eq("userId", userId),
      )
      .unique();

    let delta: number = value;
    if (existing) {
      if (existing.value === value) {
        // Same arrow twice → un-vote.
        await ctx.db.delete(existing._id);
        delta = -value;
      } else {
        await ctx.db.patch(existing._id, { value });
        delta = value * 2; // flip: remove the old vote and apply the new one
      }
    } else {
      await ctx.db.insert("threadVotes", { threadId, userId, value });
    }

    await ctx.db.patch(threadId, { score: scoreOf(thread) + delta });
  },
});

export const setPinned = mutation({
  args: {
    threadId: v.id("threads"),
    userId: v.id("users"),
    pinned: v.boolean(),
  },
  handler: async (ctx, { threadId, userId, pinned }) => {
    const thread = await ctx.db.get(threadId);
    if (!thread) throw new Error("Thread not found");
    await requireModOrOwner(ctx, thread.topicId, userId);
    await ctx.db.patch(threadId, { pinned });
  },
});

// Authors can delete their own thread; owners/moderators can delete any.
export const remove = mutation({
  args: { threadId: v.id("threads"), userId: v.id("users") },
  handler: async (ctx, { threadId, userId }) => {
    const thread = await ctx.db.get(threadId);
    if (!thread) return;

    if (thread.authorId !== userId) {
      await requireModOrOwner(ctx, thread.topicId, userId);
    }

    const [posts, votes] = await Promise.all([
      ctx.db
        .query("posts")
        .withIndex("by_thread", (q) => q.eq("threadId", threadId))
        .collect(),
      ctx.db
        .query("threadVotes")
        .withIndex("by_thread", (q) => q.eq("threadId", threadId))
        .collect(),
    ]);
    await Promise.all([
      ...posts.map((p) => ctx.db.delete(p._id)),
      ...votes.map((vote) => ctx.db.delete(vote._id)),
    ]);
    await ctx.db.delete(threadId);
  },
});

export const listPosts = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    const withAuthors = await Promise.all(
      posts.map(async (p) => ({ ...p, author: await ctx.db.get(p.authorId) }))
    );
    return withAuthors.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const reply = mutation({
  args: {
    threadId: v.id("threads"),
    authorId: v.id("users"),
    body: v.string(),
    parentPostId: v.optional(v.id("posts")),
  },
  handler: async (ctx, { threadId, authorId, body, parentPostId }) => {
    const thread = await ctx.db.get(threadId);
    if (!thread) throw new Error("Thread not found");

    const membership = await getMembership(ctx, thread.topicId, authorId);
    if (!membership) throw new Error("Join this topic before replying in it.");

    await ctx.db.insert("posts", { threadId, authorId, body, createdAt: Date.now(), parentPostId });
    await ctx.db.patch(threadId, { replyCount: thread.replyCount + 1 });
  },
});
