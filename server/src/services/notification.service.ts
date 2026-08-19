import type { NotificationDto } from '@campusconnect/shared';
import { SOCKET_EVENTS, userRoom } from '@campusconnect/shared';
import { prisma } from '../lib/prisma.js';
import { getIO } from '../sockets/io.js';
import { safeJson } from './serialize.js';

export type NotificationType =
  | 'MENTION'
  | 'WAVE'
  | 'WAVE_MUTUAL'
  | 'DM_REQUEST'
  | 'STUDY_GROUP_REQUEST'
  | 'STUDY_GROUP_APPROVED'
  | 'EVENT_REMINDER'
  | 'MENTOR_REQUEST'
  | 'MENTOR_ACCEPTED'
  | 'BADGE_EARNED'
  | 'ANNOUNCEMENT'
  | 'BUDDY_CONNECTED';

/** Persist first, then push. A notification that only ever existed in a socket frame is
 *  a notification the student misses by being offline. */
export async function notify(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<NotificationDto> {
  const row = await prisma.notification.create({
    data: { userId, type, payload: JSON.stringify(payload) },
  });

  const dto: NotificationDto = {
    id: row.id,
    type: row.type,
    payload,
    readAt: null,
    createdAt: row.createdAt.toISOString(),
  };

  getIO()?.to(userRoom(userId)).emit(SOCKET_EVENTS.notificationPush, dto);
  return dto;
}

export async function listNotifications(userId: string, limit = 40): Promise<NotificationDto[]> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    payload: safeJson<Record<string, unknown>>(r.payload, {}),
    readAt: r.readAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markRead(userId: string, id: string) {
  await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
