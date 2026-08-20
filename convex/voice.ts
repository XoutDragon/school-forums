import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { assertCanView, requireUser, roleIn } from './lib/auth';
import { toPublicUser } from './lib/serialize';

/**
 * Voice rooms.
 *
 * The audio is peer-to-peer WebRTC in a full mesh; Convex is only the signalling
 * channel. Offers, answers and ICE candidates are written here, read by their
 * recipient, and deleted. Nothing about the media touches the backend, which is
 * what makes this affordable — a mesh of N students costs the deployment N rows
 * and some heartbeats, not N audio streams.
 *
 * A mesh is the right shape at this scale and the wrong shape at a large one:
 * every participant sends their audio to every other participant, so upstream
 * bandwidth grows linearly per person. Past roughly eight people in one room the
 * honest answer is an SFU, which is a server that does not exist here. `MAX_ROOM`
 * enforces that ceiling rather than letting a seminar discover it the hard way.
 *
 * `room` is a channel id or a direct-conversation id, held as a string: Convex ids
 * are per-table and one room key has to address both. `scope` says which it is, and
 * every entry point re-derives permission from that pair rather than trusting the
 * key.
 */

const MAX_ROOM = 8;

/** A peer that has not checked in this recently is treated as gone. */
const VOICE_TIMEOUT_MS = 25_000;

const scopeValidator = v.union(v.literal('CHANNEL'), v.literal('DM'));
type Scope = 'CHANNEL' | 'DM';

/**
 * Permission gate for a room key.
 *
 * Channel rooms require membership of the owning space — viewing a public space is
 * not enough to speak in it. DM rooms require membership of the conversation.
 */
async function assertCanJoin(
  ctx: QueryCtx | MutationCtx,
  scope: Scope,
  room: string,
  userId: Id<'users'>,
): Promise<void> {
  if (scope === 'CHANNEL') {
    const channel = await ctx.db.get(room as Id<'channels'>);
    if (!channel) throw new Error('NOT_FOUND: No channel there');
    await assertCanView(ctx, channel.spaceId, userId);
    if (!(await roleIn(ctx, channel.spaceId, userId))) {
      throw new Error('FORBIDDEN: Join the space before joining its voice channel');
    }
    return;
  }

  const membership = await ctx.db
    .query('directMembers')
    .withIndex('by_conversation_user', (q) =>
      q.eq('conversationId', room as Id<'directConversations'>).eq('userId', userId),
    )
    .unique();
  if (!membership) throw new Error('FORBIDDEN: That conversation is not yours');
}

async function liveParticipants(ctx: QueryCtx | MutationCtx, room: string) {
  const cutoff = Date.now() - VOICE_TIMEOUT_MS;
  const rows = await ctx.db
    .query('voiceParticipants')
    .withIndex('by_room', (q) => q.eq('room', room))
    .collect();
  return rows.filter((row) => row.lastSeenAt > cutoff);
}

/**
 * Who is in this room, live.
 *
 * Reactive, so the roster updates on every join, leave and mute without polling —
 * this is the query that replaces what the socket layer used to push.
 */
export const participants = query({
  args: { token: v.string(), room: v.string(), scope: scopeValidator },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    await assertCanJoin(ctx, args.scope, args.room, user._id);

    const rows = await liveParticipants(ctx, args.room);

    return (
      await Promise.all(
        rows
          .sort((a, b) => a.joinedAt - b.joinedAt)
          .map(async (row) => {
            const member = await ctx.db.get(row.userId);
            if (!member) return null;
            const major = member.majorId ? await ctx.db.get(member.majorId) : null;
            return {
              peerId: row.peerId,
              muted: row.muted,
              deafened: row.deafened,
              joinedAt: row.joinedAt,
              isMe: row.userId === user._id,
              user: toPublicUser(member, major, true),
            };
          }),
      )
    ).filter((row): row is NonNullable<typeof row> => row !== null);
  },
});

/**
 * Room occupancy without the permission check, for the channel list.
 *
 * A count is not sensitive the way a roster is — the channel list needs to show
 * "3 in voice" beside every voice channel in the space, and doing that through
 * `participants` would mean one permission-checked subscription per channel.
 */
export const counts = query({
  args: { token: v.string(), spaceId: v.id('spaces') },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    await assertCanView(ctx, args.spaceId, user._id);

    const channels = await ctx.db
      .query('channels')
      .withIndex('by_space_type', (q) => q.eq('spaceId', args.spaceId).eq('type', 'VOICE_STUB'))
      .collect();

    const cutoff = Date.now() - VOICE_TIMEOUT_MS;
    const out: Record<string, number> = {};
    for (const channel of channels) {
      const rows = await ctx.db
        .query('voiceParticipants')
        .withIndex('by_room', (q) => q.eq('room', channel._id))
        .collect();
      out[channel._id] = rows.filter((r) => r.lastSeenAt > cutoff).length;
    }
    return out;
  },
});

export const join = mutation({
  args: {
    token: v.string(),
    room: v.string(),
    scope: scopeValidator,
    peerId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    await assertCanJoin(ctx, args.scope, args.room, user._id);

    const now = Date.now();
    const existing = await ctx.db
      .query('voiceParticipants')
      .withIndex('by_room_peer', (q) => q.eq('room', args.room).eq('peerId', args.peerId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { lastSeenAt: now });
      return { peerId: args.peerId };
    }

    const live = await liveParticipants(ctx, args.room);
    if (live.length >= MAX_ROOM) {
      throw new Error(
        `BAD_REQUEST: This room is full at ${MAX_ROOM}. Peer-to-peer audio stops sounding good past that.`,
      );
    }

    // Sweep this room's dead rows on the way in, so an abandoned tab does not hold
    // a slot forever. Cheap because it only ever touches one room.
    const cutoff = now - VOICE_TIMEOUT_MS;
    const all = await ctx.db
      .query('voiceParticipants')
      .withIndex('by_room', (q) => q.eq('room', args.room))
      .collect();
    for (const row of all) {
      if (row.lastSeenAt <= cutoff) await ctx.db.delete(row._id);
    }

    await ctx.db.insert('voiceParticipants', {
      room: args.room,
      scope: args.scope,
      userId: user._id,
      peerId: args.peerId,
      muted: false,
      deafened: false,
      joinedAt: now,
      lastSeenAt: now,
    });

    return { peerId: args.peerId };
  },
});

/** Keeps the row alive and carries mute state, which is why it is one call. */
export const heartbeat = mutation({
  args: {
    token: v.string(),
    room: v.string(),
    peerId: v.string(),
    muted: v.optional(v.boolean()),
    deafened: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    const row = await ctx.db
      .query('voiceParticipants')
      .withIndex('by_room_peer', (q) => q.eq('room', args.room).eq('peerId', args.peerId))
      .unique();
    if (!row || row.userId !== user._id) return null;

    await ctx.db.patch(row._id, {
      lastSeenAt: Date.now(),
      ...(args.muted !== undefined ? { muted: args.muted } : {}),
      ...(args.deafened !== undefined ? { deafened: args.deafened } : {}),
    });
    return null;
  },
});

export const leave = mutation({
  args: { token: v.string(), room: v.string(), peerId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    const row = await ctx.db
      .query('voiceParticipants')
      .withIndex('by_room_peer', (q) => q.eq('room', args.room).eq('peerId', args.peerId))
      .unique();
    if (row && row.userId === user._id) await ctx.db.delete(row._id);

    // Anything still addressed to a peer that has left is undeliverable.
    const stale = await ctx.db
      .query('voiceSignals')
      .withIndex('by_recipient', (q) => q.eq('room', args.room).eq('toPeerId', args.peerId))
      .collect();
    for (const signal of stale) await ctx.db.delete(signal._id);

    return null;
  },
});

/**
 * Post one signalling message to another peer.
 *
 * `payload` is an opaque string — serialised SDP or an ICE candidate. The backend
 * neither parses nor validates it; both ends are the same client code, and giving
 * the backend an opinion about SDP would mean maintaining one.
 */
export const signal = mutation({
  args: {
    token: v.string(),
    room: v.string(),
    scope: scopeValidator,
    fromPeerId: v.string(),
    toPeerId: v.string(),
    kind: v.union(v.literal('OFFER'), v.literal('ANSWER'), v.literal('ICE')),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    await assertCanJoin(ctx, args.scope, args.room, user._id);

    // You may only send as a peer you own, or the mesh becomes spoofable by anyone
    // else in the room.
    const mine = await ctx.db
      .query('voiceParticipants')
      .withIndex('by_room_peer', (q) => q.eq('room', args.room).eq('peerId', args.fromPeerId))
      .unique();
    if (!mine || mine.userId !== user._id) {
      throw new Error('FORBIDDEN: That is not your peer');
    }

    await ctx.db.insert('voiceSignals', {
      room: args.room,
      fromPeerId: args.fromPeerId,
      toPeerId: args.toPeerId,
      kind: args.kind,
      payload: args.payload,
    });
    return null;
  },
});

/** Everything addressed to this peer, oldest first. Reactive, so arrival is push. */
export const inbox = query({
  args: { token: v.string(), room: v.string(), peerId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    const mine = await ctx.db
      .query('voiceParticipants')
      .withIndex('by_room_peer', (q) => q.eq('room', args.room).eq('peerId', args.peerId))
      .unique();
    if (!mine || mine.userId !== user._id) return [];

    const rows = await ctx.db
      .query('voiceSignals')
      .withIndex('by_recipient', (q) => q.eq('room', args.room).eq('toPeerId', args.peerId))
      .collect();

    return rows
      .sort((a, b) => a._creationTime - b._creationTime)
      .map((row) => ({
        id: row._id,
        fromPeerId: row.fromPeerId,
        kind: row.kind,
        payload: row.payload,
      }));
  },
});

/** Acknowledge signals so the inbox drains. Called after the client applies them. */
export const consume = mutation({
  args: { token: v.string(), signalIds: v.array(v.id('voiceSignals')) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);

    for (const id of args.signalIds) {
      const signal = await ctx.db.get(id);
      if (!signal) continue;
      // Only the addressee may delete it.
      const recipient = await ctx.db
        .query('voiceParticipants')
        .withIndex('by_room_peer', (q) => q.eq('room', signal.room).eq('peerId', signal.toPeerId))
        .unique();
      if (recipient?.userId === user._id) await ctx.db.delete(id);
    }
    return null;
  },
});
