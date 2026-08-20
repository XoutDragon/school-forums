import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { requireUser } from './lib/auth';
import { KARMA, grantKarma, reevaluateBadges } from './lib/karma';
import { toPublicUser } from './lib/serialize';

/** Events and the campus calendar — ported from routes/events.ts. */

async function hostName(ctx: QueryCtx, hostType: string, hostId: string): Promise<string> {
  if (hostType === 'CLUB') {
    const club = await ctx.db.get(hostId as Id<'clubs'>).catch(() => null);
    return club?.name ?? 'A club';
  }
  if (hostType === 'SPACE') {
    const space = await ctx.db.get(hostId as Id<'spaces'>).catch(() => null);
    return space?.name ?? 'A space';
  }
  if (hostType === 'USER') {
    const user = await ctx.db.get(hostId as Id<'users'>).catch(() => null);
    return user?.displayName ?? 'A student';
  }
  // CAMPUS events have no host row — the campus itself is the host.
  return 'Lakeshore University';
}

/** "3 people from your major are going" (section 5.7). Null rather than "0 people". */
async function socialProof(
  ctx: QueryCtx,
  eventId: Id<'events'>,
  viewer: Doc<'users'>,
): Promise<string | null> {
  if (!viewer.majorId) return null;

  const going = await ctx.db
    .query('eventRsvps')
    .withIndex('by_event_status', (q) => q.eq('eventId', eventId).eq('status', 'GOING'))
    .collect();

  let count = 0;
  for (const rsvp of going) {
    if (rsvp.userId === viewer._id) continue;
    const attendee = await ctx.db.get(rsvp.userId);
    if (attendee?.majorId === viewer.majorId) count++;
  }
  if (count === 0) return null;

  const major = await ctx.db.get(viewer.majorId);
  const noun = count === 1 ? 'person' : 'people';
  const verb = count === 1 ? 'is' : 'are';
  return `${count} ${noun} from ${major?.name ?? 'your major'} ${verb} going`;
}

async function toEventDto(ctx: QueryCtx, event: Doc<'events'>, viewer: Doc<'users'>) {
  const rsvps = await ctx.db
    .query('eventRsvps')
    .withIndex('by_event', (q) => q.eq('eventId', event._id))
    .collect();

  return {
    id: event._id,
    title: event.title,
    description: event.description ?? null,
    hostType: event.hostType,
    hostId: event.hostId,
    hostName: await hostName(ctx, event.hostType, event.hostId),
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: event.location,
    locationDetail: event.locationDetail ?? null,
    capacity: event.capacity ?? null,
    coverUrl: event.coverUrl ?? null,
    tags: event.tags,
    goingCount: rsvps.filter((r) => r.status === 'GOING').length,
    interestedCount: rsvps.filter((r) => r.status === 'INTERESTED').length,
    myRsvp: rsvps.find((r) => r.userId === viewer._id)?.status ?? null,
    socialProof: await socialProof(ctx, event._id, viewer),
  };
}

export const list = query({
  args: {
    token: v.string(),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    mine: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const from = args.from ?? Date.now();
    const to = args.to ?? Date.now() + 42 * 864e5;

    let rows = await ctx.db
      .query('events')
      .withIndex('by_start', (q) => q.gte('startsAt', from).lte('startsAt', to))
      .collect();

    if (args.mine) {
      const clubIds = new Set(
        (
          await ctx.db
            .query('clubMemberships')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .collect()
        ).map((m) => m.clubId as string),
      );
      rows = rows.filter((e) => e.hostType === 'CLUB' && clubIds.has(e.hostId));
    }

    return Promise.all(
      rows.sort((a, b) => a.startsAt - b.startsAt).map((event) => toEventDto(ctx, event, user)),
    );
  },
});

export const get = query({
  args: { token: v.string(), eventId: v.id('events') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error('NOT_FOUND: No event there');

    const rsvps = await ctx.db
      .query('eventRsvps')
      .withIndex('by_event_status', (q) => q.eq('eventId', args.eventId).eq('status', 'GOING'))
      .collect();

    const attendees = (
      await Promise.all(
        rsvps.slice(0, 30).map(async (rsvp) => {
          const attendee = await ctx.db.get(rsvp.userId);
          if (!attendee) return null;
          const major = attendee.majorId ? await ctx.db.get(attendee.majorId) : null;
          return toPublicUser(attendee, major);
        }),
      )
    ).filter((a): a is NonNullable<typeof a> => a !== null);

    return { ...(await toEventDto(ctx, event, user)), attendees };
  },
});

/** Home-page digest: events from clubs you're in, your major's space, and campus-wide. */
export const thisWeek = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const now = Date.now();
    const weekOut = now + 7 * 864e5;

    const clubIds = new Set(
      (
        await ctx.db
          .query('clubMemberships')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .collect()
      ).map((m) => m.clubId as string),
    );

    const spaceIds = new Set(
      (
        await ctx.db
          .query('spaceMembers')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .collect()
      ).map((m) => m.spaceId as string),
    );

    const rows = await ctx.db
      .query('events')
      .withIndex('by_start', (q) => q.gte('startsAt', now).lte('startsAt', weekOut))
      .collect();

    const relevant = rows.filter(
      (e) =>
        e.hostType === 'CAMPUS' ||
        (e.hostType === 'CLUB' && clubIds.has(e.hostId)) ||
        (e.hostType === 'SPACE' && spaceIds.has(e.hostId)),
    );

    return Promise.all(
      relevant
        .sort((a, b) => a.startsAt - b.startsAt)
        .slice(0, 12)
        .map((event) => toEventDto(ctx, event, user)),
    );
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    hostType: v.union(
      v.literal('CLUB'),
      v.literal('SPACE'),
      v.literal('USER'),
      v.literal('CAMPUS'),
    ),
    hostId: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
    location: v.string(),
    locationDetail: v.optional(v.string()),
    capacity: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    if (args.endsAt <= args.startsAt) {
      throw new Error('BAD_REQUEST: The event has to end after it starts');
    }

    const eventId = await ctx.db.insert('events', {
      title: args.title,
      description: args.description,
      hostType: args.hostType,
      hostId: args.hostId,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      location: args.location,
      locationDetail: args.locationDetail,
      capacity: args.capacity,
      tags: args.tags ?? [],
    });

    await grantKarma(ctx, user._id, KARMA.EVENT_HOSTED);
    await reevaluateBadges(ctx, user._id);
    return eventId;
  },
});

export const rsvp = mutation({
  args: {
    token: v.string(),
    eventId: v.id('events'),
    status: v.union(v.literal('GOING'), v.literal('INTERESTED'), v.literal('DECLINED')),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error('NOT_FOUND: No event there');

    if (args.status === 'GOING' && event.capacity) {
      const going = (
        await ctx.db
          .query('eventRsvps')
          .withIndex('by_event_status', (q) => q.eq('eventId', args.eventId).eq('status', 'GOING'))
          .collect()
      ).filter((r) => r.userId !== user._id).length;
      if (going >= event.capacity) throw new Error('CONFLICT: This event is full');
    }

    const existing = await ctx.db
      .query('eventRsvps')
      .withIndex('by_event_user', (q) => q.eq('eventId', args.eventId).eq('userId', user._id))
      .unique();

    if (existing) await ctx.db.patch(existing._id, { status: args.status });
    else
      await ctx.db.insert('eventRsvps', {
        eventId: args.eventId,
        userId: user._id,
        status: args.status,
      });

    await reevaluateBadges(ctx, user._id);
    return { status: args.status };
  },
});
