import { v } from "convex/values";
import { QueryCtx, mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getMembership, requireModOrOwner } from "./permissions";
import { deleteImages, imageUrl, requireValidImage } from "./files";
import { imageArgs } from "./messages";

// `score` is optional on the table (threads predating voting don't have it),
// so every read path funnels through this instead of touching t.score.
const scoreOf = (thread: Doc<"threads">) => thread.score ?? 0;

// Reddit's "hot": score decayed by age so a busy thread from this morning
// outranks a slightly-higher-scored one from last week.
function hotRank(thread: Doc<"threads">, now: number) {
  const hours = Math.max(0, (now - thread.createdAt) / 3_600_000);
  return (scoreOf(thread) + thread.replyCount) / Math.pow(hours + 2, 1.5);
}

// Decorates threads with their author and (if a userId is given) which way the
// viewer voted, which is what the forum feed renders.
async function decorate(
  ctx: QueryCtx,
  threads: Doc<"threads">[],
  userId?: Id<"users">,
) {
  return await Promise.all(
    threads.map(async (thread) => {
      const [author, vote, opening] = await Promise.all([
        ctx.db.get(thread.authorId),
        userId
          ? ctx.db
              .query("threadVotes")
              .withIndex("by_thread_and_user", (q) =>
                q.eq("threadId", thread._id).eq("userId", userId),
              )
              .unique()
          : null,
        // The thread's body lives in its first post; the feed shows that
        // post's image as the card thumbnail.
        ctx.db
          .query("posts")
          .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
          .first(),
      ]);
      return {
        ...thread,
        score: scoreOf(thread),
        author,
        myVote: vote?.value ?? 0,
        imageUrl: await imageUrl(ctx, opening?.imageId),
        imageWidth: opening?.imageWidth,
        imageHeight: opening?.imageHeight,
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

// The reddit-style front page: every thread in the topic. Backs the "Forum"
// entry pinned above the channel list. Chat channels have no threads — their
// messages live in convex/messages.ts.
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
    topicId: v.id("topics"),
    title: v.string(),
    authorId: v.id("users"),
    body: v.string(),
    ...imageArgs,
  },
  handler: async (
    ctx,
    { topicId, title, authorId, body, imageId, imageWidth, imageHeight },
  ) => {
    const topic = await ctx.db.get(topicId);
    if (!topic) throw new Error("Topic not found");

    const membership = await getMembership(ctx, topicId, authorId);
    if (!membership) throw new Error("Join this topic before posting in it.");

    if (imageId) await requireValidImage(ctx, imageId);

    const threadId = await ctx.db.insert("threads", {
      topicId,
      title: title.trim(),
      authorId,
      createdAt: Date.now(),
      pinned: false,
      replyCount: 0,
      score: 1,
    });

    // The thread's own body (and image) is stored as its first post.
    await ctx.db.insert("posts", {
      threadId,
      authorId,
      body,
      createdAt: Date.now(),
      imageId,
      imageWidth,
      imageHeight,
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
    await deleteImages(ctx, posts);
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
      posts.map(async (p) => {
        const [author, url] = await Promise.all([
          ctx.db.get(p.authorId),
          imageUrl(ctx, p.imageId),
        ]);
        return { ...p, author, imageUrl: url };
      }),
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
    ...imageArgs,
  },
  handler: async (
    ctx,
    { threadId, authorId, body, parentPostId, imageId, imageWidth, imageHeight },
  ) => {
    const thread = await ctx.db.get(threadId);
    if (!thread) throw new Error("Thread not found");

    const trimmed = body.trim();
    if (!trimmed && !imageId) return;

    const membership = await getMembership(ctx, thread.topicId, authorId);
    if (!membership) throw new Error("Join this topic before replying in it.");

    if (imageId) await requireValidImage(ctx, imageId);

    await ctx.db.insert("posts", {
      threadId,
      authorId,
      body: trimmed,
      createdAt: Date.now(),
      parentPostId,
      imageId,
      imageWidth,
      imageHeight,
    });
    await ctx.db.patch(threadId, { replyCount: thread.replyCount + 1 });
  },
});
