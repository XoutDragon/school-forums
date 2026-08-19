import type { MessageAuthor, MessageDto, PublicUser } from '@campusconnect/shared';
import { userSettingsSchema, type UserSettings } from '@campusconnect/shared';
import { anonAlias } from '../lib/anon.js';

/** The single choke point between Prisma rows and the wire. If a field isn't listed here
 *  it doesn't leave the server — which is how the anonymity guarantee in §8 is enforced
 *  structurally rather than by remembering to omit it at every call site. */

type UserRow = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  pronouns: string | null;
  year: string | null;
  karma: number;
  deletedAt?: Date | null;
  major?: { id: string; name: string } | null;
};

export function parseSettings(raw: string): UserSettings {
  try {
    return userSettingsSchema.parse(JSON.parse(raw));
  } catch {
    return userSettingsSchema.parse({});
  }
}

export function toPublicUser(user: UserRow, isOnline = false): PublicUser {
  if (user.deletedAt) {
    return {
      id: user.id,
      username: `deleted-user-${user.id.slice(-6)}`,
      displayName: 'Deleted account',
      avatarUrl: null,
      pronouns: null,
      year: null,
      karma: 0,
      major: null,
      isOnline: false,
    };
  }
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    pronouns: user.pronouns,
    year: (user.year as PublicUser['year']) ?? null,
    karma: user.karma,
    major: user.major ?? null,
    isOnline,
  };
}

type MessageRow = {
  id: string;
  channelId: string;
  content: string;
  attachments: string;
  replyToId: string | null;
  threadRootId: string | null;
  isAnonymous: boolean;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  authorId: string | null;
  author: UserRow | null;
  reactions?: { emoji: string; userId: string }[];
  replyTo?: {
    id: string;
    content: string;
    author: { displayName: string } | null;
    isAnonymous: boolean;
  } | null;
  pin?: { id: string } | null;
  _count?: { replies: number };
};

export interface SerializeMessageOptions {
  viewerId?: string;
  onlineIds?: Set<string>;
  threadReplyCount?: number;
}

export function toMessageDto(row: MessageRow, opts: SerializeMessageOptions = {}): MessageDto {
  const { viewerId, onlineIds } = opts;

  let author: MessageAuthor;
  if (row.isAnonymous) {
    // Deliberately built from authorId without ever placing it on the result.
    author = { kind: 'anonymous', anon: anonAlias(row.authorId ?? 'ghost', row.channelId) };
  } else if (row.author) {
    author = {
      kind: 'user',
      user: toPublicUser(row.author, onlineIds?.has(row.author.id) ?? false),
    };
  } else {
    author = { kind: 'deleted' };
  }

  const grouped = new Map<string, { count: number; mine: boolean }>();
  for (const r of row.reactions ?? []) {
    const entry = grouped.get(r.emoji) ?? { count: 0, mine: false };
    entry.count += 1;
    if (viewerId && r.userId === viewerId) entry.mine = true;
    grouped.set(r.emoji, entry);
  }

  return {
    id: row.id,
    channelId: row.channelId,
    content: row.deletedAt ? '' : row.content,
    author,
    attachments: row.deletedAt ? [] : safeJson(row.attachments, []),
    replyToId: row.replyToId,
    replyTo: row.replyTo
      ? {
          id: row.replyTo.id,
          excerpt: row.replyTo.content.slice(0, 120),
          authorName: row.replyTo.isAnonymous
            ? 'Anonymous'
            : (row.replyTo.author?.displayName ?? 'Deleted account'),
        }
      : null,
    threadRootId: row.threadRootId,
    threadReplyCount: opts.threadReplyCount ?? row._count?.replies ?? 0,
    reactions: [...grouped.entries()].map(([emoji, v]) => ({ emoji, ...v })),
    isPinned: Boolean(row.pin),
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Prisma `select` for a user wherever it's embedded in another payload. */
export const publicUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  pronouns: true,
  year: true,
  karma: true,
  deletedAt: true,
  major: { select: { id: true, name: true } },
} as const;
