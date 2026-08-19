import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { env } from './lib/env.js';
import { attachUser } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { UPLOAD_DIR } from './middleware/upload.js';
import { apiRouter } from './routes/index.js';

/** Built separately from the listen() call so Supertest can drive it without a port. */
export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true, // the session is an httpOnly cookie, so this is load-bearing
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1h' }));

  app.get('/health', (_req, res) => res.json({ ok: true, campus: 'Lakeshore University' }));

  app.use(attachUser);
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
