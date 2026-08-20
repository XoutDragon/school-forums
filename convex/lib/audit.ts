import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

/**
 * Audit logging.
 *
 * The admin dashboard needs a feed of "what happened", and reconstructing that
 * from the live tables does not work: a deleted Space leaves nothing to read. So
 * each entry carries its own rendered sentence and the actor's name at the time,
 * and the rows are never mutated afterwards.
 *
 * This is deliberately not a general activity stream. Only actions an
 * administrator would be asked to account for get logged — creation and deletion
 * of Spaces, changes to accounts, changes to the instance itself.
 */

export type AuditAction =
  | 'SPACE_CREATED'
  | 'SPACE_DELETED'
  | 'SPACE_OWNER_ASSIGNED'
  | 'SPACE_PUBLISHED'
  | 'SPACE_UPDATED'
  | 'USER_UPDATED'
  | 'USER_SUSPENDED'
  | 'USER_REINSTATED'
  | 'USER_AVATAR_REMOVED'
  | 'USER_PASSWORD_RESET_SENT'
  | 'MAJOR_CREATED'
  | 'MAJOR_UPDATED'
  | 'INSTANCE_INITIALIZED'
  | 'INSTANCE_UPDATED'
  | 'ADMIN_GRANTED'
  | 'ADMIN_REVOKED';

export async function logAudit(
  ctx: MutationCtx,
  actor: Doc<'users'> | null,
  action: AuditAction,
  entry: {
    targetType: string;
    targetId?: string;
    summary: string;
    metadata?: Record<string, unknown>;
  },
): Promise<Id<'auditLogs'>> {
  return ctx.db.insert('auditLogs', {
    actorId: actor?._id,
    // Stored rather than joined: the actor may be deleted before anyone reads this.
    actorName: actor?.displayName ?? 'System',
    action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    summary: entry.summary,
    metadata: entry.metadata,
  });
}
