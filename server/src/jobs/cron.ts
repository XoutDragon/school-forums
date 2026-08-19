import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import { isTest } from '../lib/env.js';
import { notify } from '../services/notification.service.js';
import { refreshAllMatches } from '../services/buddy.service.js';

/** Local cron stands in for a job queue (§2 forbids Redis). Two jobs, both idempotent. */
export function startCrons() {
  if (isTest) return;

  // Event reminders, 1 hour out (§5.11).
  cron.schedule('*/5 * * * *', () => {
    void sendEventReminders();
  });

  // Nightly buddy refresh (§5.6).
  cron.schedule('0 3 * * *', () => {
    void refreshAllMatches();
  });
}

const reminded = new Set<string>();

export async function sendEventReminders() {
  const now = Date.now();
  const events = await prisma.event.findMany({
    where: {
      startsAt: { gte: new Date(now + 55 * 60_000), lte: new Date(now + 65 * 60_000) },
    },
    select: {
      id: true,
      title: true,
      location: true,
      startsAt: true,
      rsvps: { where: { status: 'GOING' }, select: { userId: true } },
    },
  });

  for (const event of events) {
    for (const rsvp of event.rsvps) {
      const key = `${event.id}:${rsvp.userId}`;
      if (reminded.has(key)) continue;
      reminded.add(key);
      await notify(rsvp.userId, 'EVENT_REMINDER', {
        eventId: event.id,
        title: event.title,
        location: event.location,
        startsAt: event.startsAt.toISOString(),
      });
    }
  }
}
