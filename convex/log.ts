import { Id } from "./_generated/dataModel";

// Plain helper (not a Convex function itself) — imported directly into
// mutations in topics.ts / channels.ts so every role/topic/channel change
// gets recorded. Intentionally never logs message/thread content.
export async function logEvent(
  ctx: { db: any },
  args: {
    type: string;
    message: string;
    actorId?: Id<"users">;
    actorLabel?: string;
    topicId?: Id<"topics">;
  }
) {
  await ctx.db.insert("auditLogs", {
    type: args.type,
    message: args.message,
    actorId: args.actorId,
    actorLabel: args.actorLabel,
    topicId: args.topicId,
    createdAt: Date.now(),
  });
}
