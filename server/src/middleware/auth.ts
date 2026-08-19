import type { NextFunction, Request, Response } from 'express';
import { AUTH_COOKIE, verifyToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';

export interface AuthedUser {
  id: string;
  username: string;
  isAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- express augmentation
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

/** Populates req.user when a valid cookie is present. Never rejects — routes decide. */
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = (req.cookies as Record<string, string | undefined>)[AUTH_COOKIE];
  if (!token) return next();

  const payload = verifyToken(token);
  if (!payload) return next();

  const user = await prisma.user.findFirst({
    where: { id: payload.sub, deletedAt: null },
    select: { id: true, username: true, isAdmin: true },
  });
  if (user) {
    req.user = user;
    // Cheap presence signal; the socket layer keeps the live version.
    void prisma.user
      .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.unauthorized());
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.unauthorized());
  if (!req.user.isAdmin) return next(ApiError.forbidden('Campus admins only'));
  next();
}

/** Narrowed accessor so route handlers don't repeat the non-null assertion. */
export function authed(req: Request): AuthedUser {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}
