import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { env } from './env.js';

export const AUTH_COOKIE = 'cc_session';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

export interface TokenPayload {
  sub: string;
  username: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === 'string') return null;
    return { sub: String(decoded.sub), username: String(decoded.username) };
  } catch {
    return null;
  }
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // localhost only — no TLS in this app (§2)
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
}
