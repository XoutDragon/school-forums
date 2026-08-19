import { Router } from 'express';
import { loginSchema, registerSchema, updateProfileSchema } from '@campusconnect/shared';
import { authed, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { limits } from '../middleware/rateLimit.js';
import { clearAuthCookie, setAuthCookie, signToken } from '../lib/jwt.js';
import { ah } from '../lib/async.js';
import * as authService from '../services/auth.service.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  limits.auth,
  validateBody(registerSchema),
  ah(async (req, res) => {
    const user = await authService.register(req.body);
    setAuthCookie(res, signToken({ sub: user.id, username: user.username }));
    res.status(201).json(user);
  }),
);

authRouter.post(
  '/login',
  limits.auth,
  validateBody(loginSchema),
  ah(async (req, res) => {
    const user = await authService.login(req.body);
    setAuthCookie(res, signToken({ sub: user.id, username: user.username }));
    res.json(user);
  }),
);

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

authRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    res.json(await authService.getMe(authed(req).id));
  }),
);

authRouter.patch(
  '/me',
  requireAuth,
  validateBody(updateProfileSchema),
  ah(async (req, res) => {
    res.json(await authService.updateProfile(authed(req).id, req.body));
  }),
);
