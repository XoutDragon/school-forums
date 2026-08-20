import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { requireAdmin } from './lib/auth';
import { logAudit } from './lib/audit';
import { newResetCode } from './lib/password';

/**
 * Campus administration.
 *
 * Every function here starts with `requireAdmin`. The boundary is deliberately at
 * the module level rather than at a route prefix, because Convex has no routes —
 * a function is reachable by anyone who knows its name, so the check has to be
 * inside each one.
 *
 * Two things an administrator explicitly cannot do, and the reasons are worth
 * stating because they are product decisions rather than technical limits:
 *
 *  - **Set or read a password.** `updateMember` has no password field. Admins mint
 *    a single-use reset code with `issuePasswordReset` and hand it over; the
 *    student chooses their own. An admin who can set a password can impersonate
 *    anyone, and the audit log would show nothing but a password change.
 *
 *  - **Change an avatar.** They can only remove one, via `removeAvatar`. Removal
 *    is moderation; replacement is impersonation.
 */

const RESET_TTL_MS = 1000 * 60 * 60 * 24 * 3;

const yearValidator = v.union(
  v.literal('FRESHMAN'),
  v.literal('SOPHOMORE'),
  v.literal('JUNIOR'),
  v.literal('SENIOR'),
  v.literal('GRAD'),
  v.literal('ALUM'),
);

// ── Overview ───────────────────────────────────────────────────────────────

export const stats = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);

    const [users, spaces, clubs, courses, majors, reports, events] = await Promise.all([
      ctx.db.query('users').collect(),
      ctx.db.query('spaces').collect(),
      ctx.db.query('clubs').collect(),
      ctx.db.query('courses').collect(),
      ctx.db.query('majors').collect(),
      ctx.db
        .query('reports')
        .withIndex('by_status', (q) => q.eq('status', 'OPEN'))
        .collect(),
      ctx.db.query('events').collect(),
    ]);

    const now = Date.now();
    const week = now - 7 * 864e5;

    return {
      users: {
        total: users.filter((u) => !u.deletedAt).length,
        admins: users.filter((u) => u.isAdmin && !u.deletedAt).length,
        suspended: users.filter((u) => u.suspendedAt && !u.deletedAt).length,
        newThisWeek: users.filter((u) => u._creationTime > week).length,
        onboarded: users.filter((u) => u.onboardedAt && !u.deletedAt).length,
      },
      spaces: {
        total: spaces.filter((s) => s.publishedAt !== undefined).length,
        unclaimed: spaces.filter((s) => s.publishedAt === undefined).length,
        studentCreated: spaces.filter((s) => s.type === 'INTEREST' || s.type === 'CLUB').length,
      },
      clubs: clubs.length,
      courses: courses.length,
      majors: majors.length,
      openReports: reports.length,
      upcomingEvents: events.filter((e) => e.startsAt > now).length,
    };
  },
});

// ── Audit log (feature 10) ─────────────────────────────────────────────────

export const logs = query({
  args: {
    token: v.string(),
    action: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);

    const limit = Math.min(args.limit ?? 100, 300);
    const rows =
      args.action && args.action !== 'ALL'
        ? await ctx.db
            .query('auditLogs')
            .withIndex('by_action', (q) => q.eq('action', args.action!))
            .order('desc')
            .take(limit)
        : await ctx.db.query('auditLogs').order('desc').take(limit);

    return rows.map((row) => ({
      id: row._id,
      actorId: row.actorId ?? null,
      actorName: row.actorName,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId ?? null,
      summary: row.summary,
      metadata: row.metadata ?? null,
      at: row._creationTime,
    }));
  },
});

// ── Members (feature 10) ───────────────────────────────────────────────────

function toAdminUser(user: Doc<'users'>, major: Doc<'majors'> | null) {
  return {
    id: user._id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
    hasStoredAvatar: user.avatarStorageId !== undefined,
    bio: user.bio ?? null,
    pronouns: user.pronouns ?? null,
    year: user.year ?? null,
    major: major ? { id: major._id, name: major.name } : null,
    karma: user.karma,
    isAdmin: user.isAdmin,
    suspendedAt: user.suspendedAt ?? null,
    suspendedReason: user.suspendedReason ?? null,
    mustChangePassword: user.mustChangePassword ?? false,
    deletedAt: user.deletedAt ?? null,
    onboardedAt: user.onboardedAt ?? null,
    lastSeenAt: user.lastSeenAt,
    createdAt: user._creationTime,
  };
}

export const members = query({
  args: {
    token: v.string(),
    search: v.optional(v.string()),
    filter: v.optional(
      v.union(
        v.literal('ALL'),
        v.literal('ADMINS'),
        v.literal('SUSPENDED'),
        v.literal('PENDING_ONBOARDING'),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);

    const term = args.search?.trim().toLowerCase();
    let rows = await ctx.db.query('users').take(1000);

    if (term) {
      rows = rows.filter(
        (u) =>
          u.displayName.toLowerCase().includes(term) ||
          u.username.includes(term) ||
          u.email.includes(term),
      );
    }
    switch (args.filter) {
      case 'ADMINS':
        rows = rows.filter((u) => u.isAdmin);
        break;
      case 'SUSPENDED':
        rows = rows.filter((u) => u.suspendedAt);
        break;
      case 'PENDING_ONBOARDING':
        rows = rows.filter((u) => !u.onboardedAt);
        break;
      default:
        break;
    }

    return Promise.all(
      rows
        .sort((a, b) => b._creationTime - a._creationTime)
        .slice(0, Math.min(args.limit ?? 60, 200))
        .map(async (user) =>
          toAdminUser(user, user.majorId ? await ctx.db.get(user.majorId) : null),
        ),
    );
  },
});

export const member = query({
  args: { token: v.string(), userId: v.id('users') },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('NOT_FOUND: No account there');

    const major = user.majorId ? await ctx.db.get(user.majorId) : null;
    const spaces = await ctx.db
      .query('spaceMembers')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();

    const openResets = (
      await ctx.db
        .query('passwordResets')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .collect()
    )
      .filter((r) => !r.usedAt && r.expiresAt > Date.now())
      .map((r) => ({ code: r.token, expiresAt: r.expiresAt }));

    return {
      ...toAdminUser(user, major),
      spaceCount: spaces.length,
      openResets,
    };
  },
});

/**
 * Edit an account.
 *
 * Everything except the password and the avatar image, per the brief. Email and
 * username changes re-check uniqueness by hand, since Convex has no UNIQUE.
 */
export const updateMember = mutation({
  args: {
    token: v.string(),
    userId: v.id('users'),
    email: v.optional(v.string()),
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    pronouns: v.optional(v.string()),
    year: v.optional(yearValidator),
    majorId: v.optional(v.union(v.id('majors'), v.null())),
    karma: v.optional(v.number()),
    isAdmin: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error('NOT_FOUND: No account there');

    const patch: Record<string, unknown> = {};

    if (args.email !== undefined) {
      const email = args.email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        throw new Error('BAD_REQUEST: That does not look like an email');
      }
      if (email !== target.email) {
        const taken = await ctx.db
          .query('users')
          .withIndex('by_email', (q) => q.eq('email', email))
          .unique();
        if (taken) throw new Error('CONFLICT: Another account already uses that email');
        patch.email = email;
      }
    }

    if (args.username !== undefined) {
      const username = args.username.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,24}$/.test(username)) {
        throw new Error(
          'BAD_REQUEST: Username must be 3-24 lowercase letters, numbers or underscores',
        );
      }
      if (username !== target.username) {
        const taken = await ctx.db
          .query('users')
          .withIndex('by_username', (q) => q.eq('username', username))
          .unique();
        if (taken) throw new Error('CONFLICT: That username is taken');
        patch.username = username;
      }
    }

    if (args.displayName !== undefined) patch.displayName = args.displayName.trim();
    if (args.bio !== undefined) patch.bio = args.bio.trim() || undefined;
    if (args.pronouns !== undefined) patch.pronouns = args.pronouns.trim() || undefined;
    if (args.year !== undefined) patch.year = args.year;
    if (args.majorId !== undefined) patch.majorId = args.majorId ?? undefined;
    if (args.karma !== undefined) patch.karma = Math.max(0, Math.round(args.karma));

    if (args.isAdmin !== undefined && args.isAdmin !== target.isAdmin) {
      // Removing the last administrator locks everyone out of the dashboard,
      // including whoever is doing it.
      if (!args.isAdmin) {
        const admins = (await ctx.db.query('users').collect()).filter(
          (u) => u.isAdmin && !u.deletedAt,
        );
        if (admins.length <= 1) {
          throw new Error(
            'BAD_REQUEST: This is the last administrator. Promote someone else first.',
          );
        }
      }
      patch.isAdmin = args.isAdmin;
      await logAudit(ctx, admin, args.isAdmin ? 'ADMIN_GRANTED' : 'ADMIN_REVOKED', {
        targetType: 'USER',
        targetId: args.userId,
        summary: `${admin.displayName} ${args.isAdmin ? 'granted' : 'revoked'} administrator access ${
          args.isAdmin ? 'to' : 'from'
        } ${target.displayName}`,
      });
    }

    await ctx.db.patch(args.userId, patch);
    await logAudit(ctx, admin, 'USER_UPDATED', {
      targetType: 'USER',
      targetId: args.userId,
      summary: `${admin.displayName} edited ${target.displayName}'s account`,
      metadata: { changed: Object.keys(patch) },
    });
    return null;
  },
});

/** Removal only — never replacement. See the note at the top of this file. */
export const removeAvatar = mutation({
  args: { token: v.string(), userId: v.id('users'), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error('NOT_FOUND: No account there');
    if (!target.avatarUrl && !target.avatarStorageId) {
      throw new Error('BAD_REQUEST: They have no picture to remove');
    }

    if (target.avatarStorageId) {
      await ctx.storage.delete(target.avatarStorageId).catch(() => undefined);
    }
    await ctx.db.patch(args.userId, { avatarUrl: undefined, avatarStorageId: undefined });

    await logAudit(ctx, admin, 'USER_AVATAR_REMOVED', {
      targetType: 'USER',
      targetId: args.userId,
      summary: `${admin.displayName} removed ${target.displayName}'s profile picture`,
      metadata: { reason: args.reason ?? null },
    });
    return null;
  },
});

/**
 * Mint a single-use reset code.
 *
 * This is the "send a forgot password" of the brief. No mail service runs here, so
 * "send" means the code is returned to the dashboard for the administrator to
 * deliver — which is exactly what an email would have contained, minus the
 * delivery. Swapping in a real mailer is one call at the end of this function.
 */
export const issuePasswordReset = mutation({
  args: { token: v.string(), userId: v.id('users') },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const target = await ctx.db.get(args.userId);
    if (!target || target.deletedAt) throw new Error('NOT_FOUND: No account there');

    // Invalidate outstanding codes, so "issue another" cannot leave two live.
    const existing = await ctx.db
      .query('passwordResets')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();
    for (const row of existing) {
      if (!row.usedAt) await ctx.db.patch(row._id, { usedAt: Date.now() });
    }

    const code = newResetCode();
    await ctx.db.insert('passwordResets', {
      userId: args.userId,
      token: code,
      issuedById: admin._id,
      expiresAt: Date.now() + RESET_TTL_MS,
    });
    await ctx.db.patch(args.userId, { mustChangePassword: true });

    await logAudit(ctx, admin, 'USER_PASSWORD_RESET_SENT', {
      targetType: 'USER',
      targetId: args.userId,
      summary: `${admin.displayName} issued a password reset for ${target.displayName}`,
    });

    return { code, email: target.email, expiresAt: Date.now() + RESET_TTL_MS };
  },
});

export const setSuspended = mutation({
  args: {
    token: v.string(),
    userId: v.id('users'),
    suspended: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error('NOT_FOUND: No account there');
    if (target._id === admin._id) throw new Error('BAD_REQUEST: You cannot suspend yourself');

    if (args.suspended) {
      await ctx.db.patch(args.userId, {
        suspendedAt: Date.now(),
        suspendedReason: args.reason?.trim() || undefined,
      });
      // Suspension that leaves the existing session alive is not a suspension.
      const sessions = await ctx.db
        .query('sessions')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .collect();
      for (const session of sessions) await ctx.db.delete(session._id);
    } else {
      await ctx.db.patch(args.userId, { suspendedAt: undefined, suspendedReason: undefined });
    }

    await logAudit(ctx, admin, args.suspended ? 'USER_SUSPENDED' : 'USER_REINSTATED', {
      targetType: 'USER',
      targetId: args.userId,
      summary: `${admin.displayName} ${args.suspended ? 'suspended' : 'reinstated'} ${target.displayName}`,
      metadata: { reason: args.reason ?? null },
    });
    return null;
  },
});

// ── Spaces (feature 10) ────────────────────────────────────────────────────

export const spaces = query({
  args: { token: v.string(), search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);

    const term = args.search?.trim().toLowerCase();
    const rows = await ctx.db.query('spaces').take(500);

    return Promise.all(
      rows
        .filter((s) => !term || s.name.toLowerCase().includes(term) || s.slug.includes(term))
        .sort((a, b) => {
          // Unclaimed drafts first: they are the ones waiting on the admin.
          const aDraft = a.publishedAt === undefined ? 0 : 1;
          const bDraft = b.publishedAt === undefined ? 0 : 1;
          return aDraft - bDraft || b._creationTime - a._creationTime;
        })
        .slice(0, 200)
        .map(async (space) => {
          const owner = await ctx.db.get(space.ownerId);
          const members = await ctx.db
            .query('spaceMembers')
            .withIndex('by_space', (q) => q.eq('spaceId', space._id))
            .collect();
          const channels = await ctx.db
            .query('channels')
            .withIndex('by_space', (q) => q.eq('spaceId', space._id))
            .collect();

          return {
            id: space._id,
            name: space.name,
            slug: space.slug,
            description: space.description ?? null,
            type: space.type,
            visibility: space.visibility,
            tags: space.tags ?? [],
            isPublished: space.publishedAt !== undefined,
            createdAt: space._creationTime,
            memberCount: members.length,
            channelCount: channels.length,
            owner: owner
              ? { id: owner._id, displayName: owner.displayName, username: owner.username }
              : null,
          };
        }),
    );
  },
});

/**
 * Draft a space on behalf of a club that does not have an owner yet.
 *
 * It is created unpublished, which means no student can see it, join it or find it
 * in search. It becomes real when `assignSpaceOwner` hands it to somebody — which
 * is the behaviour the brief asks for, and also the only sane one: an ownerless
 * space with nobody in it is a dead room students keep wandering into.
 *
 * Until then the admin themself holds OWNER, purely so the space has a valid
 * `ownerId` and somebody can open it to check it looks right.
 */
export const draftSpace = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    type: v.union(
      v.literal('CLUB'),
      v.literal('INTEREST'),
      v.literal('GENERAL'),
      v.literal('RESIDENCE'),
    ),
    visibility: v.union(v.literal('PUBLIC'), v.literal('PRIVATE')),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);

    const name = args.name.trim();
    if (name.length < 3) throw new Error('BAD_REQUEST: Give it a name of at least 3 characters');

    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'space';
    let slug = base;
    for (let i = 1; i < 50; i++) {
      const taken = await ctx.db
        .query('spaces')
        .withIndex('by_slug', (q) => q.eq('slug', slug))
        .unique();
      if (!taken) break;
      slug = `${base}-${i + 1}`;
    }

    const spaceId = await ctx.db.insert('spaces', {
      name,
      slug,
      description: args.description?.trim() || undefined,
      type: args.type,
      visibility: args.visibility,
      ownerId: admin._id,
      createdById: admin._id,
      // Unpublished. This is the whole point of the draft state.
      publishedAt: undefined,
      tags: (args.tags ?? [])
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8),
    });

    await ctx.db.insert('spaceMembers', {
      spaceId,
      userId: admin._id,
      role: 'OWNER',
      joinedAt: Date.now(),
    });

    const starters: {
      name: string;
      type: 'TEXT' | 'ANNOUNCEMENT' | 'RESOURCES' | 'VOICE_STUB';
      topic: string;
      isDefault?: boolean;
    }[] = [
      { name: 'general', type: 'TEXT', topic: 'Anything and everything.', isDefault: true },
      { name: 'announcements', type: 'ANNOUNCEMENT', topic: 'Read-only. Admins post here.' },
      { name: 'resources', type: 'RESOURCES', topic: 'Links, files and things worth keeping.' },
      { name: 'voice-lounge', type: 'VOICE_STUB', topic: 'Drop in and talk.' },
    ];
    await Promise.all(
      starters.map((channel, index) =>
        ctx.db.insert('channels', {
          spaceId,
          name: channel.name,
          topic: channel.topic,
          type: channel.type,
          position: index,
          isDefault: channel.isDefault ?? false,
        }),
      ),
    );

    await logAudit(ctx, admin, 'SPACE_CREATED', {
      targetType: 'SPACE',
      targetId: spaceId,
      summary: `${admin.displayName} drafted the space "${name}" (waiting for an owner)`,
      metadata: { type: args.type, published: false },
    });

    return spaceId;
  },
});

/** Hand a drafted space to a student, which is also what publishes it. */
export const assignSpaceOwner = mutation({
  args: { token: v.string(), spaceId: v.id('spaces'), username: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const space = await ctx.db.get(args.spaceId);
    if (!space) throw new Error('NOT_FOUND: No space there');

    const target = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', args.username.trim().toLowerCase()))
      .unique();
    if (!target || target.deletedAt) throw new Error('NOT_FOUND: No student with that username');
    if (target.suspendedAt) throw new Error('BAD_REQUEST: That account is suspended');

    const existing = await ctx.db
      .query('spaceMembers')
      .withIndex('by_space_user', (q) => q.eq('spaceId', args.spaceId).eq('userId', target._id))
      .unique();

    if (existing) await ctx.db.patch(existing._id, { role: 'OWNER' });
    else {
      await ctx.db.insert('spaceMembers', {
        spaceId: args.spaceId,
        userId: target._id,
        role: 'OWNER',
        joinedAt: Date.now(),
      });
    }

    // The admin steps back to ADMIN if they were holding the space, and out of it
    // entirely if they were only there as a placeholder on a draft.
    const adminMembership = await ctx.db
      .query('spaceMembers')
      .withIndex('by_space_user', (q) => q.eq('spaceId', args.spaceId).eq('userId', admin._id))
      .unique();
    if (adminMembership && adminMembership.userId !== target._id) {
      if (space.publishedAt === undefined) await ctx.db.delete(adminMembership._id);
      else await ctx.db.patch(adminMembership._id, { role: 'ADMIN' });
    }

    const wasDraft = space.publishedAt === undefined;
    await ctx.db.patch(args.spaceId, {
      ownerId: target._id,
      publishedAt: space.publishedAt ?? Date.now(),
    });

    await ctx.db.insert('notifications', {
      userId: target._id,
      type: 'ANNOUNCEMENT',
      payload: {
        spaceId: args.spaceId,
        from: admin.displayName,
        excerpt: `You are now the owner of ${space.name}.`,
      },
    });

    await logAudit(ctx, admin, wasDraft ? 'SPACE_PUBLISHED' : 'SPACE_OWNER_ASSIGNED', {
      targetType: 'SPACE',
      targetId: args.spaceId,
      summary: wasDraft
        ? `${admin.displayName} published "${space.name}" and made ${target.displayName} its owner`
        : `${admin.displayName} made ${target.displayName} owner of "${space.name}"`,
    });
    return null;
  },
});

// ── Majors (feature 10) ────────────────────────────────────────────────────

export const majors = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);

    const rows = await ctx.db.query('majors').collect();
    return Promise.all(
      rows
        .sort((a, b) => a.faculty.localeCompare(b.faculty) || a.name.localeCompare(b.name))
        .map(async (major) => {
          const students = await ctx.db
            .query('users')
            .withIndex('by_major', (q) => q.eq('majorId', major._id))
            .collect();
          const space = await ctx.db
            .query('spaces')
            .withIndex('by_major', (q) => q.eq('linkedMajorId', major._id))
            .unique();

          return {
            id: major._id,
            name: major.name,
            faculty: major.faculty,
            description: major.description,
            studentCount: students.filter((s) => !s.deletedAt).length,
            spaceId: space?._id ?? null,
          };
        }),
    );
  },
});

/**
 * Add a major, and its community Space with it.
 *
 * Section 5.3 says every major gets an auto-created Space with a fixed channel
 * set, so creating one without the other would leave a major that is a dropdown
 * entry and nothing else.
 */
export const createMajor = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    faculty: v.string(),
    description: v.string(),
    createSpace: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);

    const name = args.name.trim();
    if (name.length < 2) throw new Error('BAD_REQUEST: Give the major a name');

    const existing = await ctx.db
      .query('majors')
      .withIndex('by_name', (q) => q.eq('name', name))
      .unique();
    if (existing) throw new Error('CONFLICT: That major already exists');

    const majorId = await ctx.db.insert('majors', {
      name,
      faculty: args.faculty.trim(),
      description: args.description.trim(),
    });

    let spaceId = null;
    if (args.createSpace !== false) {
      const base =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 44) || 'major';
      let slug = base;
      for (let i = 1; i < 50; i++) {
        const taken = await ctx.db
          .query('spaces')
          .withIndex('by_slug', (q) => q.eq('slug', slug))
          .unique();
        if (!taken) break;
        slug = `${base}-${i + 1}`;
      }

      spaceId = await ctx.db.insert('spaces', {
        name,
        slug,
        description: args.description.trim(),
        type: 'MAJOR',
        visibility: 'PUBLIC',
        ownerId: admin._id,
        createdById: admin._id,
        publishedAt: Date.now(),
        linkedMajorId: majorId,
      });

      // The channel set section 5.3 specifies, in that order.
      const channels: {
        name: string;
        type: 'TEXT' | 'ANONYMOUS' | 'RESOURCES';
        topic: string;
        isDefault?: boolean;
      }[] = [
        { name: 'general', type: 'TEXT', topic: `Everything ${name}.`, isDefault: true },
        { name: 'course-help', type: 'TEXT', topic: 'Stuck on something? Ask here.' },
        {
          name: 'internships-careers',
          type: 'TEXT',
          topic: 'Postings, referrals, interview notes.',
        },
        { name: 'memes', type: 'TEXT', topic: 'The important channel.' },
        { name: 'anonymous', type: 'ANONYMOUS', topic: 'Names hidden. Say the awkward thing.' },
        { name: 'resources', type: 'RESOURCES', topic: 'Notes and guides worth keeping.' },
      ];
      await Promise.all(
        channels.map((channel, index) =>
          ctx.db.insert('channels', {
            spaceId: spaceId!,
            name: channel.name,
            topic: channel.topic,
            type: channel.type,
            position: index,
            isDefault: channel.isDefault ?? false,
          }),
        ),
      );
      await ctx.db.insert('spaceMembers', {
        spaceId,
        userId: admin._id,
        role: 'OWNER',
        joinedAt: Date.now(),
      });
    }

    await logAudit(ctx, admin, 'MAJOR_CREATED', {
      targetType: 'MAJOR',
      targetId: majorId,
      summary: `${admin.displayName} added the major "${name}"`,
      metadata: { faculty: args.faculty, spaceCreated: spaceId !== null },
    });

    return { majorId, spaceId };
  },
});

export const updateMajor = mutation({
  args: {
    token: v.string(),
    majorId: v.id('majors'),
    name: v.optional(v.string()),
    faculty: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const major = await ctx.db.get(args.majorId);
    if (!major) throw new Error('NOT_FOUND: No major there');

    await ctx.db.patch(args.majorId, {
      ...(args.name?.trim() ? { name: args.name.trim() } : {}),
      ...(args.faculty?.trim() ? { faculty: args.faculty.trim() } : {}),
      ...(args.description !== undefined ? { description: args.description.trim() } : {}),
    });

    await logAudit(ctx, admin, 'MAJOR_UPDATED', {
      targetType: 'MAJOR',
      targetId: args.majorId,
      summary: `${admin.displayName} edited the major "${major.name}"`,
    });
    return null;
  },
});
