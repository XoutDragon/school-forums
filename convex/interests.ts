import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("interests").collect();
  },
});

// Run once (e.g. from the Convex dashboard "Run function" panel, or
// `npx convex run interests:seed`) to populate the onboarding catalog.
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const already = await ctx.db.query("interests").first();
    if (already) return "already seeded";

    const items: { label: string; category: "class" | "club" | "hobby" | "other" }[] = [
      { label: "Computer Science", category: "class" },
      { label: "Biology", category: "class" },
      { label: "Calculus", category: "class" },
      { label: "Art History", category: "class" },
      { label: "Robotics Club", category: "club" },
      { label: "Debate Team", category: "club" },
      { label: "Student Government", category: "club" },
      { label: "Photography Club", category: "club" },
      { label: "Gaming", category: "hobby" },
      { label: "Food & Cooking", category: "hobby" },
      { label: "Music Production", category: "hobby" },
      { label: "Fitness & Sports", category: "hobby" },
      { label: "Anime & Manga", category: "hobby" },
      { label: "Entrepreneurship", category: "other" },
      { label: "Campus Events", category: "other" },
    ];

    await Promise.all(items.map((item) => ctx.db.insert("interests", item)));
    return "seeded";
  },
});
