import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** One connection for the whole app. The handshake carries the session cookie, which is
 *  why withCredentials is set — without it the server rejects the socket as anonymous. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      withCredentials: true,
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
