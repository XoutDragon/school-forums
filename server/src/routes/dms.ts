import { Router } from 'express';
import { z } from 'zod';
import { SOCKET_EVENTS, userRoom } from '@campusconnect/shared';
import { ah } from '../lib/async.js';
import { authed, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { limits } from '../middleware/rateLimit.js';
import * as dms from '../services/dm.service.js';
import { getIO } from '../sockets/io.js';

export const dmsRouter = Router();
dmsRouter.use(requireAuth);

dmsRouter.get(
  '/',
  ah(async (req, res) => {
    res.json(await dms.listConversations(authed(req).id));
  }),
);

dmsRouter.post(
  '/',
  validateBody(
    z.object({
      userIds: z.array(z.string()).min(1).max(9),
      title: z.string().max(60).optional(),
      /** Buddy connections and mentor links open a DM pre-seeded with a prompt (§5.6). */
      icebreaker: z.string().max(280).optional(),
    }),
  ),
  ah(async (req, res) => {
    const me = authed(req).id;
    const conversation = await dms.openConversation(me, req.body.userIds, req.body.title);
    if (req.body.icebreaker) {
      await dms.sendDirectMessage(conversation.id, me, req.body.icebreaker);
    }
    res.status(201).json(conversation);
  }),
);

dmsRouter.get(
  '/:id',
  ah(async (req, res) => {
    res.json(await dms.getConversation(req.params.id!, authed(req).id));
  }),
);

dmsRouter.get(
  '/:id/messages',
  ah(async (req, res) => {
    res.json(await dms.listDirectMessages(req.params.id!, authed(req).id));
  }),
);

dmsRouter.post(
  '/:id/messages',
  limits.messages,
  validateBody(z.object({ content: z.string().min(1).max(4000) })),
  ah(async (req, res) => {
    const me = authed(req).id;
    const conversationId = req.params.id!;
    const message = await dms.sendDirectMessage(conversationId, me, req.body.content);

    // DMs have no channel room — deliver to each member's personal room instead.
    const io = getIO();
    for (const userId of await dms.memberIdsOf(conversationId)) {
      io?.to(userRoom(userId)).emit(SOCKET_EVENTS.messageNew, { ...message, isDirect: true });
    }
    res.status(201).json(message);
  }),
);
