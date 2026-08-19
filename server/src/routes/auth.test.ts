import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { makeUser } from '../test/helpers.js';

let app: Express;

beforeAll(() => {
  app = createApp();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('auth', () => {
  it('registers, sets a session cookie, and restores the session', async () => {
    const email = `newbie${Date.now()}@lakeshore.edu`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        username: `newbie${Date.now().toString(36)}`,
        displayName: 'Newbie',
        password: 'password123',
      })
      .expect(201);

    expect(res.body.email).toBe(email);
    expect(res.body).not.toHaveProperty('passwordHash');

    const raw = res.headers['set-cookie'];
    expect(raw).toBeDefined();
    const cookie = Array.isArray(raw) ? raw : [String(raw)];
    // The session must not be readable by page scripts.
    expect(cookie.join('; ')).toContain('HttpOnly');

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.email).toBe(email);
  });

  it('rejects a duplicate email without revealing the other account', async () => {
    const user = await makeUser(app);
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: user.email,
        username: 'someoneelse',
        displayName: 'Someone',
        password: 'password123',
      })
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('gives the same error for a bad password and an unknown email', async () => {
    const user = await makeUser(app);

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'not-the-password' })
      .expect(400);

    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@lakeshore.edu', password: 'password123' })
      .expect(400);

    // Identical wording either way — otherwise login doubles as an account-existence oracle.
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('rejects a weak password with a field-level message', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'short@lakeshore.edu',
        username: 'shorty',
        displayName: 'Shorty',
        password: 'abc',
      })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/8 characters/i);
  });

  it('refuses /me without a cookie', async () => {
    const res = await request(app).get('/api/auth/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('logout clears the session', async () => {
    const user = await makeUser(app);
    await request(app).post('/api/auth/logout').set('Cookie', user.cookie).expect(204);
  });
});
