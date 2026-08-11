import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function bytesToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password: string, salt: string) {
  const data = new TextEncoder().encode(salt + password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(digest);
}

function randomHex(byteLength: number) {
  const arr = crypto.getRandomValues(new Uint8Array(byteLength));
  return bytesToHex(arr.buffer);
}

// Exported so topics.ts / channels.ts can gate admin-only mutations
// (delete topic, change role, remove member) without duplicating this logic.
export async function requireAdminSession(ctx: { db: any }, token: string) {
  const session = await ctx.db
    .query("adminSessions")
    .withIndex("by_token", (q: any) => q.eq("token", token))
    .unique();
  if (!session || session.expiresAt < Date.now()) {
    throw new Error("Admin session expired or invalid. Please log in again.");
  }
}

// --- Public: has this instance been set up yet? -------------------------
// Safe to call before any auth exists — never returns the password hash/salt.
export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query("institutionConfig").first();
    if (!config) return null;
    return {
      institutionName: config.institutionName,
      allowedDomains: config.allowedDomains,
      setupComplete: config.setupComplete,
    };
  },
});

// --- First-run setup wizard ----------------------------------------------
export const setup = mutation({
  args: {
    institutionName: v.string(),
    allowedDomains: v.array(v.string()),
    password: v.string(),
  },
  handler: async (ctx, { institutionName, allowedDomains, password }) => {
    const existing = await ctx.db.query("institutionConfig").first();
    if (existing) {
      throw new Error("This instance has already been set up.");
    }
    if (password.length < 8) {
      throw new Error("Master password must be at least 8 characters.");
    }

    const cleanDomains = allowedDomains
      .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);
    if (cleanDomains.length === 0) {
      throw new Error("Add at least one allowed email domain.");
    }

    const salt = randomHex(16);
    const hash = await hashPassword(password, salt);

    await ctx.db.insert("institutionConfig", {
      institutionName: institutionName.trim(),
      allowedDomains: cleanDomains,
      adminPasswordSalt: salt,
      adminPasswordHash: hash,
      setupComplete: true,
      createdAt: Date.now(),
    });

    const token = randomHex(24);
    await ctx.db.insert("adminSessions", {
      token,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    });

    return token;
  },
});

// --- Admin login -----------------------------------------------------------
export const login = mutation({
  args: { password: v.string() },
  handler: async (ctx, { password }) => {
    const config = await ctx.db.query("institutionConfig").first();
    if (!config) throw new Error("This instance hasn't been set up yet.");

    const hash = await hashPassword(password, config.adminPasswordSalt);
    if (hash !== config.adminPasswordHash) {
      throw new Error("Incorrect master password.");
    }

    const token = randomHex(24);
    await ctx.db.insert("adminSessions", {
      token,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return token;
  },
});

export const validateSession = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await ctx.db
      .query("adminSessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    return !!session && session.expiresAt > Date.now();
  },
});

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await ctx.db
      .query("adminSessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (session) await ctx.db.delete(session._id);
  },
});

// --- Dashboard data ---------------------------------------------------------

export const listLogs = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAdminSession(ctx, token);
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_createdAt")
      .order("desc")
      .take(200);

    return await Promise.all(
      logs.map(async (log) => ({
        ...log,
        actorName: log.actorId
          ? (await ctx.db.get(log.actorId))?.name
          : log.actorLabel,
      })),
    );
  },
});

export const overviewStats = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAdminSession(ctx, token);
    const [users, topics, channels, threads] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("topics").collect(),
      ctx.db.query("channels").collect(),
      ctx.db.query("threads").collect(),
    ]);
    return {
      userCount: users.length,
      topicCount: topics.length,
      channelCount: channels.length,
      threadCount: threads.length,
    };
  },
});

export const listTopicsOverview = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAdminSession(ctx, token);
    const topics = await ctx.db.query("topics").collect();

    return await Promise.all(
      topics.map(async (topic) => {
        const [creator, channels] = await Promise.all([
          ctx.db.get(topic.createdBy),
          ctx.db
            .query("channels")
            .withIndex("by_topic", (q: any) => q.eq("topicId", topic._id))
            .collect(),
        ]);
        return {
          ...topic,
          creatorName: creator?.name ?? "Unknown",
          channelCount: channels.length,
        };
      }),
    );
  },
});
