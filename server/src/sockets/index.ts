import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { parse as parseCookie } from 'cookie';
import { SOCKET_EVENTS, channelRoom, userRoom } from '@campusconnect/shared';
import { AUTH_COOKIE, verifyToken } from '../lib/jwt.js';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';
import { anonAlias } from '../lib/anon.js';
import { assertCanView } from '../services/space.service.js';
import { markChannelRead } from '../services/space.service.js';
import { markOffline, markOnline } from './presence.js';
import { setIO } from './io.js';

interface SocketUser {
  id: string;
  username: string;
  displayName: string;
}

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
  });

  // Same httpOnly cookie as REST — the socket handshake carries it because the client
  // connects with withCredentials.
  io.use(async (socket, next) => {
    const raw = socket.handshake.headers.cookie;
    const token = raw ? parseCookie(raw)[AUTH_COOKIE] : undefined;
    const payload = token ? verifyToken(token) : null;
    if (!payload) return next(new Error('unauthorized'));

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, username: true, displayName: true },
    });
    if (!user) return next(new Error('unauthorized'));

    socket.data.user = user satisfies SocketUser;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as SocketUser;

    void socket.join(userRoom(user.id));
    if (markOnline(user.id)) {
      io.emit(SOCKET_EVENTS.presenceUpdate, { userId: user.id, isOnline: true });
    }

    socket.on(SOCKET_EVENTS.channelJoin, async (channelId: string) => {
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { spaceId: true },
      });
      if (!channel) return;
      try {
        await assertCanView(channel.spaceId, user.id);
      } catch {
        return; // silently ignore — a client asking for a space it can't see gets nothing
      }
      await socket.join(channelRoom(channelId));
      await markChannelRead(channelId, user.id);
    });

    socket.on(SOCKET_EVENTS.channelLeave, (channelId: string) => {
      void socket.leave(channelRoom(channelId));
    });

    socket.on(SOCKET_EVENTS.typingStart, async (channelId: string) => {
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { type: true },
      });
      if (!channel) return;
      // In an anonymous channel even "who is typing" is identifying, so it goes out
      // under the same alias the message will carry.
      const identity =
        channel.type === 'ANONYMOUS'
          ? { name: anonAlias(user.id, channelId).alias, userId: null }
          : { name: user.displayName, userId: user.id };

      socket.to(channelRoom(channelId)).emit(SOCKET_EVENTS.typingStart, { channelId, ...identity });
    });

    socket.on(SOCKET_EVENTS.typingStop, (channelId: string) => {
      socket.to(channelRoom(channelId)).emit(SOCKET_EVENTS.typingStop, {
        channelId,
        userId: user.id,
      });
    });

    socket.on('disconnect', () => {
      if (markOffline(user.id)) {
        io.emit(SOCKET_EVENTS.presenceUpdate, { userId: user.id, isOnline: false });
        void prisma.user
          .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
          .catch(() => undefined);
      }
    });
  });

  setIO(io);
  return io;
}
