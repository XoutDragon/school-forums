import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listByChannel = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, { channelId }) => {
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .collect();

    const withAuthors = await Promise.all(
      threads.map(async (t) => ({ ...t, author: await ctx.db.get(t.authorId) }))
    );

    return withAuthors.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
  },
});

export const get = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    const thread = await ctx.db.get(threadId);
    if (!thread) return null;
    const author = await ctx.db.get(thread.authorId);
    return { ...thread, author };
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

    const threadId = await ctx.db.insert("threads", {
      channelId,
      topicId: channel.topicId,
      title: title.trim(),
      authorId,
      createdAt: Date.now(),
      pinned: false,
      replyCount: 0,
    });

    // The thread's own body is stored as its first post.
    await ctx.db.insert("posts", {
      threadId,
      authorId,
      body,
      createdAt: Date.now(),
    });

    return threadId;
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
    await ctx.db.insert("posts", { threadId, authorId, body, createdAt: Date.now(), parentPostId });

    const thread = await ctx.db.get(threadId);
    if (thread) await ctx.db.patch(threadId, { replyCount: thread.replyCount + 1 });
  },
});
