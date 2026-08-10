import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const COLORS = ["#5865f2", "#eb459e", "#57f287", "#fee75c", "#ed4245", "#3ba55d"];

// MOCK AUTH: looks up a user by email, creating one if it doesn't exist.
// Replace this with real school SSO / magic-link verification later —
// everything downstream just needs a `users` doc id, so the rest of the
// app doesn't have to change.
export const loginOrCreate = mutation({
  args: { name: v.string(), email: v.string() },
  handler: async (ctx, { name, email }) => {
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .unique();

    if (existing) return existing._id;

    const userId = await ctx.db.insert("users", {
      name,
      email: normalizedEmail,
      isAlumni: false,
      avatarColor: COLORS[Math.floor(Math.random() * COLORS.length)],
      onboarded: false,
    });
    return userId;
  },
});

export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

export const completeOnboarding = mutation({
  args: { userId: v.id("users"), interestIds: v.array(v.id("interests")) },
  handler: async (ctx, { userId, interestIds }) => {
    // Replace any existing selections (in case they redo onboarding).
    const existing = await ctx.db
      .query("userInterests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    await Promise.all(existing.map((row) => ctx.db.delete(row._id)));

    await Promise.all(
      interestIds.map((interestId) =>
        ctx.db.insert("userInterests", { userId, interestId })
      )
    );

    await ctx.db.patch(userId, { onboarded: true });
  },
});

export const getUserInterests = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("userInterests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const interests = await Promise.all(rows.map((r) => ctx.db.get(r.interestId)));
    return interests.filter(Boolean);
  },
});
