import type { Server } from 'socket.io';

/** Set once at boot. Services emit through this rather than importing the socket module
 *  directly, which keeps the REST path and the socket path calling the same services (§8). */
let io: Server | null = null;

export function setIO(server: Server) {
  io = server;
}

export function getIO(): Server | null {
  return io;
}
