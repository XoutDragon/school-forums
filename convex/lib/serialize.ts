import type { Doc, Id } from '../_generated/dataModel';
import { anonAlias } from './anon';

/**
 * The single choke point between Convex documents and anything a client sees.
 *
 * If a field is not listed here it does not leave the backend. That is how the
 * anonymity guarantee in CLAUDE.md section 8 is enforced structurally, rather than by
 * remembering to omit `authorId` at every call site. The regression test lives in
 * convex/messages.test.ts.
 */

export interface PublicUser {
  id: Id<'users'>;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  pronouns: string | null;
  year: string | null;
  karma: number;
  major: { id: Id<'majors'>; name: string } | null;
  isOnline: boolean;
}

export interface AnonymousAuthor {
  alias: string;
  animal: string;
  colorSeed: number;
}

export type MessageAuthor =
  | { kind: 'user'; user: PublicUser }
  | { kind: 'anonymous'; anon: AnonymousAuthor }
  | { kind: 'deleted' };

export function toPublicUser(
  user: Doc<'users'>,
  major: Doc<'majors'> | null,
  isOnline = false,
): PublicUser {
  if (user.deletedAt) {
    // Anonymise rather than hard-delete, so other people's threads stay readable.
    return {
      id: user._id,
      username: `deleted-user-${user._id.slice(-6)}`,
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
    id: user._id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
    pronouns: user.pronouns ?? null,
    year: user.year ?? null,
    karma: user.karma,
    major: major ? { id: major._id, name: major.name } : null,
    isOnline,
  };
}

export interface MessageDto {
  id: Id<'messages'>;
  channelId: Id<'channels'>;
  content: string;
  author: MessageAuthor;
  attachments: Doc<'messages'>['attachments'];
  replyToId: Id<'messages'> | null;
  replyTo: { id: Id<'messages'>; excerpt: string; authorName: string } | null;
  threadRootId: Id<'messages'> | null;
  threadReplyCount: number;
  reactions: { emoji: string; count: number; mine: boolean }[];
  isPinned: boolean;
  createdAt: number;
  editedAt: number | null;
  deletedAt: number | null;
}

export interface SerializeMessageContext {
  viewerId?: Id<'users'>;
  author: Doc<'users'> | null;
  authorMajor: Doc<'majors'> | null;
  onlineIds?: Set<string>;
  reactions: Doc<'reactions'>[];
  replyTo?: { message: Doc<'messages'>; author: Doc<'users'> | null } | null;
  threadReplyCount?: number;
  isPinned?: boolean;
  attachments?: Doc<'messages'>['attachments'];
}

export function toMessageDto(message: Doc<'messages'>, ctx: SerializeMessageContext): MessageDto {
  let author: MessageAuthor;

  if (message.isAnonymous) {
    // Built from authorId without ever placing authorId on the result. Note the
    // alias is derived here and nowhere near the wire shape above.
    author = {
      kind: 'anonymous',
      anon: anonAlias(message.authorId ?? 'ghost', message.channelId),
    };
  } else if (ctx.author) {
    author = {
      kind: 'user',
      user: toPublicUser(ctx.author, ctx.authorMajor, ctx.onlineIds?.has(ctx.author._id) ?? false),
    };
  } else {
    author = { kind: 'deleted' };
  }

  const grouped = new Map<string, { count: number; mine: boolean }>();
  for (const reaction of ctx.reactions) {
    const entry = grouped.get(reaction.emoji) ?? { count: 0, mine: false };
    entry.count += 1;
    if (ctx.viewerId && reaction.userId === ctx.viewerId) entry.mine = true;
    grouped.set(reaction.emoji, entry);
  }

  return {
    id: message._id,
    channelId: message.channelId,
    content: message.deletedAt ? '' : message.content,
    author,
    attachments: message.deletedAt ? [] : (ctx.attachments ?? message.attachments),
    replyToId: message.replyToId ?? null,
    replyTo: ctx.replyTo
      ? {
          id: ctx.replyTo.message._id,
          excerpt: ctx.replyTo.message.content.slice(0, 120),
          authorName: ctx.replyTo.message.isAnonymous
            ? 'Anonymous'
            : (ctx.replyTo.author?.displayName ?? 'Deleted account'),
        }
      : null,
    threadRootId: message.threadRootId ?? null,
    threadReplyCount: ctx.threadReplyCount ?? 0,
    reactions: [...grouped.entries()].map(([emoji, value]) => ({ emoji, ...value })),
    isPinned: ctx.isPinned ?? false,
    createdAt: message._creationTime,
    editedAt: message.editedAt ?? null,
    deletedAt: message.deletedAt ?? null,
  };
}
