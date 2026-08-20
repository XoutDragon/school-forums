import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { consumeRateLimit, requireUser } from './lib/auth';

/**
 * File uploads.
 *
 * The Express build wrote to server/uploads/ and served it statically. Convex has
 * its own blob store, and the flow is three steps rather than one multipart POST:
 *
 *   1. the client asks for a short-lived upload URL here,
 *   2. it POSTs the bytes straight to that URL and gets a storage id back,
 *   3. it passes the storage id to whichever mutation owns the record.
 *
 * The bytes never pass through a function, which is why there is no size check in
 * this file — Convex enforces its own limit at the upload URL, and the client
 * refuses anything over 10 MB before it starts (CLAUDE.md section 2).
 *
 * Rate limiting still applies, and it applies here rather than at step 3, because
 * step 1 is the step that costs storage.
 */

export const generateUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    await consumeRateLimit(ctx, 'uploads', user._id);
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * Setup-time upload URL.
 *
 * First-run setup wants a campus logo, and at that moment there is no account to
 * authenticate. Guarded the same way `config.initialize` is: it works only while
 * the instance is unclaimed, and stops existing the moment setup completes.
 */
export const generateSetupUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query('instanceConfig').first();
    if (config) throw new Error('FORBIDDEN: Setup is already complete.');
    return ctx.storage.generateUploadUrl();
  },
});

/** Resolves a storage id to a servable URL. Null when the blob is gone. */
export const url = query({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, args) => ctx.storage.getUrl(args.storageId),
});
