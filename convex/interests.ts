import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logEvent } from "./log";
import { requireAdminSession } from "./admin";

const CATEGORY = v.union(
  v.literal("major"),
  v.literal("class"),
  v.literal("club"),
  v.literal("hobby"),
  v.literal("other"),
);

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("interests").collect();
  },
});

// --- Admin-managed catalog -------------------------------------------------
// Admins (school IT staff) curate what shows up in onboarding — majors,
// classes, clubs, hobbies — rather than it being hardcoded.

export const adminCreate = mutation({
  args: { adminToken: v.string(), label: v.string(), category: CATEGORY },
  handler: async (ctx, { adminToken, label, category }) => {
    await requireAdminSession(ctx, adminToken);

    const trimmed = label.trim();
    if (!trimmed) throw new Error("Label can't be empty.");

    const id = await ctx.db.insert("interests", { label: trimmed, category });

    await logEvent(ctx, {
      type: "interest_created",
      message: `Admin added ${category} "${trimmed}" to onboarding options`,
      actorLabel: "Admin",
    });

    return id;
  },
});

export const adminUpdate = mutation({
  args: {
    adminToken: v.string(),
    interestId: v.id("interests"),
    label: v.string(),
    category: CATEGORY,
  },
  handler: async (ctx, { adminToken, interestId, label, category }) => {
    await requireAdminSession(ctx, adminToken);
    await ctx.db.patch(interestId, { label: label.trim(), category });
  },
});

export const adminDelete = mutation({
  args: { adminToken: v.string(), interestId: v.id("interests") },
  handler: async (ctx, { adminToken, interestId }) => {
    await requireAdminSession(ctx, adminToken);

    const interest = await ctx.db.get(interestId);
    if (!interest) return;
    await ctx.db.delete(interestId);

    // Note: existing topics/userInterests that reference this id are left
    // as-is for this MVP (their interestId just points at nothing) rather
    // than cascading — revisit if that matters for your use case.
    await logEvent(ctx, {
      type: "interest_deleted",
      message: `Admin removed "${interest.label}" from onboarding options`,
      actorLabel: "Admin",
    });
  },
});

// Run once (e.g. from the Convex dashboard "Run function" panel, or
// `npx convex run interests:seed`) to populate a starter catalog. Admins can
// add/edit/remove from here afterward via the dashboard's Interests tab.
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const already = await ctx.db.query("interests").first();
    if (already) return "already seeded";

    const items: {
      label: string;
      category: "major" | "class" | "club" | "hobby" | "other";
    }[] = [
      { label: "Computer Science", category: "major" },
      { label: "Information Technology", category: "major" },
      { label: "Bioengineering", category: "major" },
      { label: "Art", category: "major" },
      { label: "Music", category: "major" },
      { label: "Business", category: "major" },
      { label: "Robotics Club", category: "club" },
      { label: "Debate Team", category: "club" },
      { label: "Student Government", category: "club" },
      { label: "Photography Club", category: "club" },
      { label: "Gaming", category: "hobby" },
      { label: "Food & Cooking", category: "hobby" },
      { label: "Music Production", category: "hobby" },
      { label: "Fitness & Sports", category: "hobby" },
      { label: "Entrepreneurship", category: "other" },
      { label: "Campus Events", category: "other" },
    ];

    await Promise.all(items.map((item) => ctx.db.insert("interests", item)));
    return "seeded";
  },
});
