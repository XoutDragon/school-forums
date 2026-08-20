import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { requireAdmin, sessionExpiry } from './lib/auth';
import { assertPasswordOk, hashPassword, newToken } from './lib/password';
import { logAudit } from './lib/audit';

/**
 * Instance configuration and first-run setup.
 *
 * One CampusConnect deployment serves one campus (CLAUDE.md section 1), which means
 * there is exactly one of these rows and it has to exist before anyone can do
 * anything. The first person to reach a fresh deployment is the institution's IT
 * administrator, and this is the door they walk through.
 *
 * The security shape worth naming: `initialize` is unauthenticated, because there
 * is nobody to authenticate against yet. It is guarded by the absence of the config
 * row and nothing else, so on a fresh deployment it is a race — whoever arrives
 * first claims the campus. That is the same trade every self-hosted app makes with
 * its installer, and the mitigation is the same one: do not leave a fresh
 * deployment reachable and unclaimed.
 */

export async function loadConfig(ctx: QueryCtx | MutationCtx) {
  return ctx.db.query('instanceConfig').first();
}

/** Public. Every page load hits this, including the signed-out ones. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const config = await loadConfig(ctx);
    if (!config) return null;

    return {
      id: config._id,
      schoolName: config.schoolName,
      shortName: config.shortName,
      allowedEmailDomains: config.allowedEmailDomains,
      tagline: config.tagline ?? null,
      logoUrl: config.logoUrl ?? null,
      supportEmail: config.supportEmail ?? null,
      currentTerm: config.currentTerm,
      allowStudentSpaces: config.allowStudentSpaces,
      allowSelfRegistration: config.allowSelfRegistration,
      setupCompletedAt: config.setupCompletedAt,
    };
  },
});

/** Cheap boolean for the router, so the app can decide what to render before it
 *  knows anything else. */
export const isInitialized = query({
  args: {},
  handler: async (ctx) => (await loadConfig(ctx)) !== null,
});

function normaliseDomains(input: string[]): string[] {
  return [
    ...new Set(
      input
        .map((d) => d.trim().toLowerCase().replace(/^@+/, ''))
        .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)),
    ),
  ];
}

/**
 * First-run setup. Creates the instance row and its first administrator in one
 * transaction, then signs that administrator in.
 */
export const initialize = mutation({
  args: {
    schoolName: v.string(),
    shortName: v.string(),
    allowedEmailDomains: v.array(v.string()),
    tagline: v.optional(v.string()),
    supportEmail: v.optional(v.string()),
    currentTerm: v.string(),
    allowStudentSpaces: v.boolean(),
    allowSelfRegistration: v.boolean(),
    adminEmail: v.string(),
    adminDisplayName: v.string(),
    adminUsername: v.string(),
    adminPassword: v.string(),
  },
  handler: async (ctx, args) => {
    if (await loadConfig(ctx)) {
      throw new Error('CONFLICT: This campus has already been set up.');
    }

    const schoolName = args.schoolName.trim();
    if (schoolName.length < 2) throw new Error('BAD_REQUEST: Give the school a name');

    const domains = normaliseDomains(args.allowedEmailDomains);
    const email = args.adminEmail.trim().toLowerCase();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error('BAD_REQUEST: That admin email does not look like an email');
    }
    // The administrator has to be inside their own gate, or they lock themselves out
    // of the app they just configured.
    if (domains.length && !domains.includes(email.split('@')[1]!)) {
      throw new Error(
        `BAD_REQUEST: The admin email must be on one of the allowed domains (${domains
          .map((d) => `@${d}`)
          .join(', ')}).`,
      );
    }
    if (!/^[a-z0-9_]{3,24}$/.test(args.adminUsername)) {
      throw new Error(
        'BAD_REQUEST: Username must be 3-24 lowercase letters, numbers or underscores',
      );
    }
    assertPasswordOk(args.adminPassword);

    const emailTaken = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();
    if (emailTaken) throw new Error('CONFLICT: An account already uses that email.');

    const usernameTaken = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', args.adminUsername))
      .unique();
    if (usernameTaken) throw new Error('CONFLICT: That username is taken.');

    const now = Date.now();
    const adminId = await ctx.db.insert('users', {
      email,
      username: args.adminUsername,
      displayName: args.adminDisplayName.trim() || 'Campus Administrator',
      passwordHash: await hashPassword(args.adminPassword),
      karma: 0,
      settings: {
        theme: 'light',
        dmPrivacy: 'EVERYONE',
        discoverable: false,
        showCourses: false,
        showRealName: true,
      },
      isAdmin: true,
      lastSeenAt: now,
      verifiedAt: now,
      // The IT admin is not a student; skipping onboarding keeps them out of the
      // "pick your major" wizard.
      onboardedAt: now,
    });

    await ctx.db.insert('instanceConfig', {
      schoolName,
      shortName: args.shortName.trim() || schoolName.slice(0, 12),
      allowedEmailDomains: domains,
      tagline: args.tagline?.trim() || undefined,
      supportEmail: args.supportEmail?.trim().toLowerCase() || undefined,
      currentTerm: args.currentTerm.trim().toUpperCase(),
      allowStudentSpaces: args.allowStudentSpaces,
      allowSelfRegistration: args.allowSelfRegistration,
      setupCompletedAt: now,
      setupByUserId: adminId,
    });

    const admin = (await ctx.db.get(adminId))!;
    await logAudit(ctx, admin, 'INSTANCE_INITIALIZED', {
      targetType: 'INSTANCE',
      summary: `${schoolName} was set up by ${admin.displayName}`,
      metadata: { domains, currentTerm: args.currentTerm },
    });

    const token = newToken();
    await ctx.db.insert('sessions', { userId: adminId, token, expiresAt: sessionExpiry(now) });

    return { token, adminId };
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    schoolName: v.optional(v.string()),
    shortName: v.optional(v.string()),
    allowedEmailDomains: v.optional(v.array(v.string())),
    tagline: v.optional(v.string()),
    supportEmail: v.optional(v.string()),
    currentTerm: v.optional(v.string()),
    allowStudentSpaces: v.optional(v.boolean()),
    allowSelfRegistration: v.optional(v.boolean()),
    logoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const config = await loadConfig(ctx);
    if (!config) throw new Error('NOT_FOUND: This campus has not been set up yet.');

    const patch: Record<string, unknown> = {};
    if (args.schoolName !== undefined) patch.schoolName = args.schoolName.trim();
    if (args.shortName !== undefined) patch.shortName = args.shortName.trim();
    if (args.allowedEmailDomains !== undefined) {
      patch.allowedEmailDomains = normaliseDomains(args.allowedEmailDomains);
    }
    if (args.tagline !== undefined) patch.tagline = args.tagline.trim() || undefined;
    if (args.supportEmail !== undefined) {
      patch.supportEmail = args.supportEmail.trim().toLowerCase() || undefined;
    }
    if (args.currentTerm !== undefined) patch.currentTerm = args.currentTerm.trim().toUpperCase();
    if (args.allowStudentSpaces !== undefined) patch.allowStudentSpaces = args.allowStudentSpaces;
    if (args.allowSelfRegistration !== undefined) {
      patch.allowSelfRegistration = args.allowSelfRegistration;
    }
    if (args.logoUrl !== undefined) patch.logoUrl = args.logoUrl || undefined;

    await ctx.db.patch(config._id, patch);
    await logAudit(ctx, admin, 'INSTANCE_UPDATED', {
      targetType: 'INSTANCE',
      targetId: config._id,
      summary: `${admin.displayName} changed campus settings`,
      metadata: { changed: Object.keys(patch) },
    });
    return null;
  },
});
