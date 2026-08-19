import { createHash } from 'node:crypto';

/** Deterministic per-user-per-channel alias (§5.2). The same student is the same animal
 *  for the life of a channel, so a thread is followable, but nothing links that animal
 *  back to them anywhere outside this module and the moderation log. */

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

function digest(userId: string, channelId: string): number {
  const hash = createHash('sha256').update(`${channelId}:${userId}`).digest();
  return hash.readUInt32BE(0);
}

export interface AnonAlias {
  alias: string;
  animal: string;
  colorSeed: number;
}

export function anonAlias(userId: string, channelId: string): AnonAlias {
  const n = digest(userId, channelId);
  const animal = ANIMALS[n % ANIMALS.length]!;
  // Only reach for an adjective when the raw animal pool would likely collide; a channel
  // with 30+ anonymous posters gets "Restless Otter" alongside "Otter".
  const adjective = ADJECTIVES[(n >>> 8) % ADJECTIVES.length]!;
  const useAdjective = (n >>> 16) % 3 === 0;
  return {
    animal,
    alias: useAdjective ? `Anonymous ${adjective} ${animal}` : `Anonymous ${animal}`,
    colorSeed: n % 360,
  };
}
