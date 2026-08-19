import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/errors.js';
import { isTest } from '../lib/env.js';

/** In-memory fixed-window counter. A local stand-in for Redis, per §2's "build a local
 *  stand-in" rule — process memory is fine when there is exactly one process. */
const buckets = new Map<string, { count: number; resetAt: number }>();

let sweeper: NodeJS.Timeout | undefined;
function startSweeper() {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }, 60_000);
  sweeper.unref();
}

export interface LimitOptions {
  name: string;
  limit: number;
  windowMs: number;
  message: string;
}

export function rateLimit({ name, limit, windowMs, message }: LimitOptions) {
  startSweeper();
  return (req: Request, res: Response, next: NextFunction) => {
    if (isTest) return next(); // limits are asserted directly in rateLimit.test.ts

    const identity = req.user?.id ?? req.ip ?? 'anon';
    const key = `${name}:${identity}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return next(ApiError.tooMany(message));
    }
    next();
  };
}

/** §5.10 limits, in one place so they're auditable. */
export const limits = {
  messages: rateLimit({
    name: 'messages',
    limit: 20,
    windowMs: 60_000,
    message: "You're sending messages faster than we can keep up. Wait a moment.",
  }),
  anonymousPosts: rateLimit({
    name: 'anon',
    limit: 5,
    windowMs: 60 * 60_000,
    message: 'Anonymous posting is capped at 5 an hour. Try again later.',
  }),
  uploads: rateLimit({
    name: 'uploads',
    limit: 10,
    windowMs: 24 * 60 * 60_000,
    message: "You've hit today's upload limit of 10 files.",
  }),
  reports: rateLimit({
    name: 'reports',
    limit: 3,
    windowMs: 60 * 60_000,
    message: 'You can file 3 reports an hour. Existing reports are still being reviewed.',
  }),
  auth: rateLimit({
    name: 'auth',
    limit: 20,
    windowMs: 15 * 60_000,
    message: 'Too many attempts. Wait 15 minutes.',
  }),
};

export function resetRateLimits() {
  buckets.clear();
}
