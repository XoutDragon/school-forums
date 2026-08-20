/**
 * Deterministic per-user-per-channel alias (CLAUDE.md section 5.2).
 *
 * The Express version used SHA-256 from node:crypto. Convex queries and mutations
 * run in a V8 isolate where the only hash is `crypto.subtle`, which is async and
 * therefore unusable inside a synchronous serializer. FNV-1a is used instead: it
 * is not cryptographic, but nothing here depends on that. What matters is that the
 * mapping is stable for a given (channel, user) pair and that the output reveals
 * nothing without already knowing the user id — and a 32-bit hash of a cuid is not
 * reversible by inspection.
 *
 * Aliases assigned by this function will differ from the ones the SQLite build
 * produced. That only matters if both run against the same conversation.
 */

const ANIMALS = [
  'Raccoon',
  'Heron',
  'Otter',
  'Marten',
  'Kestrel',
  'Badger',
  'Lynx',
  'Grebe',
  'Vole',
  'Osprey',
  'Ermine',
  'Puffin',
  'Fisher',
  'Loon',
  'Shrew',
  'Pika',
  'Gannet',
  'Weasel',
  'Bittern',
  'Marmot',
  'Sandpiper',
  'Wolverine',
  'Coot',
  'Chickadee',
  'Muskrat',
  'Godwit',
  'Porcupine',
  'Nuthatch',
  'Mink',
  'Curlew',
] as const;

const ADJECTIVES = [
  'Quiet',
  'Restless',
  'Nocturnal',
  'Studious',
  'Caffeinated',
  'Overdue',
  'Punctual',
  'Wandering',
  'Diligent',
  'Sleepless',
] as const;

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash * 16777619, kept in 32-bit range without overflowing to a float.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export interface AnonAlias {
  alias: string;
  animal: string;
  colorSeed: number;
}

export function anonAlias(userId: string, channelId: string): AnonAlias {
  const n = fnv1a(`${channelId}:${userId}`);
  const animal = ANIMALS[n % ANIMALS.length]!;
  // Only reach for an adjective when the raw pool would likely collide; a channel
  // with 30+ anonymous posters gets "Restless Otter" alongside "Otter".
  const adjective = ADJECTIVES[(n >>> 8) % ADJECTIVES.length]!;
  const useAdjective = (n >>> 16) % 3 === 0;

  return {
    animal,
    alias: useAdjective ? `Anonymous ${adjective} ${animal}` : `Anonymous ${animal}`,
    colorSeed: n % 360,
  };
}
