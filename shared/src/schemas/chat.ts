import { z } from 'zod';

export const attachmentSchema = z.object({
  url: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const sendMessageSchema = z.object({
  content: z.string().min(1, 'Say something').max(4000),
  attachments: z.array(attachmentSchema).max(5).default([]),
  replyToId: z.string().nullish(),
  threadRootId: z.string().nullish(),
  isAnonymous: z.boolean().default(false),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});
export type EditMessageInput = z.infer<typeof editMessageSchema>;

export const reactionSchema = z.object({
  emoji: z.string().min(1).max(16),
});
export type ReactionInput = z.infer<typeof reactionSchema>;

export const messageQuerySchema = z.object({
  before: z.string().optional(),
  threadRootId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type MessageQuery = z.infer<typeof messageQuerySchema>;

/** Socket contract. Client and server both import these names so a rename breaks
 *  the build rather than silently dropping events. */
export const SOCKET_EVENTS = {
  messageNew: 'message:new',
  messageEdit: 'message:edit',
  messageDelete: 'message:delete',
  reactionAdd: 'reaction:add',
  reactionRemove: 'reaction:remove',
  typingStart: 'typing:start',
  typingStop: 'typing:stop',
  presenceUpdate: 'presence:update',
  notificationPush: 'notification:push',
  channelJoin: 'channel:join',
  channelLeave: 'channel:leave',
} as const;

export const channelRoom = (channelId: string) => `channel:${channelId}`;
export const userRoom = (userId: string) => `user:${userId}`;
export const spaceRoom = (spaceId: string) => `space:${spaceId}`;
