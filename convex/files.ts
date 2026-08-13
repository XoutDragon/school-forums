import { v } from "convex/values";
import { MutationCtx, QueryCtx, internalMutation, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Image attachments for chat messages and forum posts, backed by Convex file
// storage. The client uploads straight to the returned URL, then hands the
// resulting storageId to messages.send / threads.create / threads.reply.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

export const generateUploadUrl = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    // Mock-auth stand-in: the caller has to be a real user. Swap for a check
    // against the authenticated identity once SSO lands.
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Log in before uploading files.");
    return await ctx.storage.generateUploadUrl();
  },
});

// The upload URL accepts anything, so type/size are enforced here — after the
// bytes land but before the storageId is attached to a message or post.
//
// Note: this deliberately does NOT delete the offending file. Throwing rolls
// the whole mutation back, storage deletes included, so cleanup here would be
// undone. Orphaned uploads (rejected ones, and ones abandoned between upload
// and send) are swept by `sweepOrphanedUploads` below instead.
export async function requireValidImage(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
) {
  const metadata = await ctx.db.system.get("_storage", storageId);
  if (!metadata) throw new Error("That upload didn't finish — try again.");

  if (!metadata.contentType || !ALLOWED_IMAGE_TYPES.includes(metadata.contentType)) {
    throw new Error("Only PNG, JPEG, GIF and WebP images can be attached.");
  }
  if (metadata.size > MAX_IMAGE_BYTES) {
    throw new Error("Images have to be 5 MB or smaller.");
  }
}

// Deletes stored files nothing references any more. Runs on a cron (see
// convex/crons.ts) because a rejected or abandoned upload leaves bytes behind
// that no row points at.
//
// The grace period matters: a file is briefly unreferenced between the client
// uploading it and the send mutation attaching it, so anything recent is left
// alone. Scans all messages and posts, which is fine at campus scale — swap for
// a "pending uploads" table if this ever gets big.
const ORPHAN_GRACE_MS = 60 * 60 * 1000; // 1 hour

export const sweepOrphanedUploads = internalMutation({
  // graceMs is only for forcing an immediate sweep (e.g. from the dashboard);
  // the cron leaves it unset and gets the default hour.
  args: { graceMs: v.optional(v.number()) },
  handler: async (ctx, { graceMs }) => {
    const [files, messages, posts] = await Promise.all([
      ctx.db.system.query("_storage").collect(),
      ctx.db.query("messages").collect(),
      ctx.db.query("posts").collect(),
    ]);

    const referenced = new Set<string>();
    for (const row of [...messages, ...posts]) {
      if (row.imageId) referenced.add(row.imageId);
    }

    const cutoff = Date.now() - (graceMs ?? ORPHAN_GRACE_MS);
    const orphans = files.filter(
      (file) => !referenced.has(file._id) && file._creationTime < cutoff,
    );

    await Promise.all(
      orphans.map((file) => ctx.storage.delete(file._id).catch(() => undefined)),
    );

    return { scanned: files.length, deleted: orphans.length };
  },
});

// Storage is separate from the database, so deleting a row that references an
// image has to delete the image too or the bytes linger forever.
export async function deleteImages(
  ctx: MutationCtx,
  rows: { imageId?: Id<"_storage"> }[],
) {
  await Promise.all(
    rows
      .map((row) => row.imageId)
      .filter((id): id is Id<"_storage"> => id !== undefined)
      // A file can already be gone if it was deleted elsewhere; ignore that.
      .map((id) => ctx.storage.delete(id).catch(() => undefined)),
  );
}

// Resolves a stored image to a servable URL for the client. Returns null when
// the row has no attachment or the file has since been deleted.
export async function imageUrl(
  ctx: QueryCtx,
  imageId: Id<"_storage"> | undefined,
) {
  if (!imageId) return null;
  return await ctx.storage.getUrl(imageId);
}
