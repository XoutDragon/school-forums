import { Router } from 'express';
import { authRouter } from './auth.js';
import { spacesRouter } from './spaces.js';
import { channelsRouter, messagesRouter } from './messages.js';
import { usersRouter } from './users.js';
import { coursesRouter, qaRouter, resourcesRouter } from './courses.js';
import { clubsRouter } from './clubs.js';
import { eventsRouter } from './events.js';
import { dmsRouter } from './dms.js';
import { studyRouter } from './study.js';
import {
  campusRouter,
  catalogRouter,
  moderationRouter,
  notificationsRouter,
  searchRouter,
  uploadsRouter,
} from './misc.js';
import { homeRouter } from './home.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/home', homeRouter);
apiRouter.use('/spaces', spacesRouter);
apiRouter.use('/channels', channelsRouter);
apiRouter.use('/messages', messagesRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/courses', coursesRouter);
apiRouter.use('/resources', resourcesRouter);
apiRouter.use('/qa', qaRouter);
apiRouter.use('/clubs', clubsRouter);
apiRouter.use('/events', eventsRouter);
apiRouter.use('/dms', dmsRouter);
apiRouter.use('/study', studyRouter);
apiRouter.use('/catalog', catalogRouter);
apiRouter.use('/search', searchRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/uploads', uploadsRouter);
apiRouter.use('/campus', campusRouter);
apiRouter.use('/moderation', moderationRouter);
