/** Live presence, held in process. One socket per tab means a student can have several,
 *  so it's a ref-count rather than a set membership toggle. */
const connections = new Map<string, number>();

export function markOnline(userId: string): boolean {
  const next = (connections.get(userId) ?? 0) + 1;
  connections.set(userId, next);
  return next === 1; // first tab — worth broadcasting
}

export function markOffline(userId: string): boolean {
  const next = (connections.get(userId) ?? 1) - 1;
  if (next <= 0) {
    connections.delete(userId);
    return true; // last tab closed
  }
  connections.set(userId, next);
  return false;
}

export function isOnline(userId: string): boolean {
  return connections.has(userId);
}

export function onlineIds(): Set<string> {
  return new Set(connections.keys());
}
