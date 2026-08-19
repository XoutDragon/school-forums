import { Router } from 'express';
import {
  SOCKET_EVENTS,
  channelRoom,
  editMessageSchema,
  messageQuerySchema,
  reactionSchema,
  sendMessageSchema,
} from '@campusconnect/shared';
import { prisma } from '../lib/prisma.js';
import { ah } from '../lib/async.js';
import { authed, requireAuth } from '../middleware/auth.js';
import { query, validateBody, validateQuery } from '../middleware/validate.js';
import { limits } from '../middleware/rateLimit.js';
import * as messages from '../services/message.service.js';
import { markChannelRead } from '../services/space.service.js';
import { reevaluateBadges } from '../services/karma.service.js';
import { getIO } from '../sockets/io.js';

export const channelsRouter = Router();
channelsRouter.use(requireAuth);

channelsRouter.get(
  '/:channelId/messages',
  validateQuery(messageQuerySchema),
  ah(async (req, res) => {
    const q = query<{ before?: string; threadRootId?: string; limit: number }>(req);
    res.json(await messages.listMessages(req.params.channelId!, authed(req).id, q));
  }),
);

channelsRouter.post(
  '/:channelId/messages',
  limits.messages,
  validateBody(sendMessageSchema),
  ah(async (req, res) => {
    const channelId = req.params.channelId!;
    const me = authed(req).id;

    // Anonymous posts carry their own, much tighter budget (§5.10).
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { type: true },
    });
    if (channel?.type === 'ANONYMOUS') {
      await new Promise<void>((resolve, reject) =>
        limits.anonymousPosts(req, res, (err?: unknown) => (err ? reject(err) : resolve())),
      );
    }

    const message = await messages.sendMessage(channelId, me, req.body);
    getIO()?.to(channelRoom(channelId)).emit(SOCKET_EVENTS.messageNew, message);
    await markChannelRead(channelId, me);
    void reevaluateBadges(me);
    res.status(201).json(message);
  }),
);

channelsRouter.get(
  '/:channelId/pins',
  ah(async (req, res) => {
    res.json(await messages.listPins(req.params.channelId!, authed(req).id));
  }),
);

channelsRouter.post(
  '/:channelId/read',
  ah(async (req, res) => {
    await markChannelRead(req.params.channelId!, authed(req).id);
    res.status(204).end();
  }),
);

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

messagesRouter.patch(
  '/:messageId',
  validateBody(editMessageSchema),
  ah(async (req, res) => {
    const message = await messages.editMessage(req.params.messageId!, authed(req).id, req.body);
    getIO()?.to(channelRoom(message.channelId)).emit(SOCKET_EVENTS.messageEdit, message);
    res.json(message);
  }),
);

messagesRouter.delete(
  '/:messageId',
  ah(async (req, res) => {
    const user = authed(req);
    const result = await messages.deleteMessage(req.params.messageId!, user.id, user.isAdmin);
    getIO()?.to(channelRoom(result.channelId)).emit(SOCKET_EVENTS.messageDelete, result);
    res.status(204).end();
  }),
);

messagesRouter.get(
  '/:messageId/thread',
  ah(async (req, res) => {
    res.json(await messages.getThread(req.params.messageId!, authed(req).id));
  }),
);

messagesRouter.post(
  '/:messageId/reactions',
  validateBody(reactionSchema),
  ah(async (req, res) => {
    const result = await messages.addReaction(
      req.params.messageId!,
      authed(req).id,
      req.body.emoji,
    );
    getIO()?.to(channelRoom(result.channelId)).emit(SOCKET_EVENTS.reactionAdd, result);
    res.status(201).json(result);
  }),
);

messagesRouter.delete(
  '/:messageId/reactions/:emoji',
  ah(async (req, res) => {
    const result = await messages.removeReaction(
      req.params.messageId!,
      authed(req).id,
      decodeURIComponent(req.params.emoji!),
    );
    getIO()?.to(channelRoom(result.channelId)).emit(SOCKET_EVENTS.reactionRemove, result);
    res.status(204).end();
  }),
);

messagesRouter.post(
  '/:messageId/pin',
  ah(async (req, res) => {
    res.json(await messages.togglePin(req.params.messageId!, authed(req).id));
  }),
);
