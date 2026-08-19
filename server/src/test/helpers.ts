import request from 'supertest';
import type { Express } from 'express';
import { prisma } from '../lib/prisma.js';

let counter = 0;

export interface TestUser {
  id: string;
  email: string;
  username: string;
  cookie: string;
}

/** Registers a fresh account and returns its session cookie, ready to hand to
 *  `.set('Cookie', user.cookie)`. */
export async function makeUser(app: Express, overrides: Partial<{ isAdmin: boolean }> = {}) {
  counter += 1;
  const username = `tester${counter}${Date.now().toString(36)}`.slice(0, 24);
  const email = `${username}@lakeshore.edu`;

  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, username, displayName: `Tester ${counter}`, password: 'password123' })
    .expect(201);

  const raw = res.headers['set-cookie'];
  const cookie = Array.isArray(raw) ? raw.join('; ') : String(raw ?? '');

  if (overrides.isAdmin) {
    await prisma.user.update({ where: { id: res.body.id }, data: { isAdmin: true } });
  }

  return { id: res.body.id as string, email, username, cookie } satisfies TestUser;
}

/** A public space with one text channel and one anonymous channel, owned by `owner`. */
export async function makeSpace(ownerId: string) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return prisma.space.create({
    data: {
      name: `Test Space ${suffix}`,
      slug: `test-space-${suffix}`,
      type: 'GENERAL',
      visibility: 'PUBLIC',
      ownerId,
      members: { create: { userId: ownerId, role: 'OWNER' } },
      channels: {
        create: [
          { name: 'general', type: 'TEXT', position: 0, isDefault: true },
          { name: 'anonymous', type: 'ANONYMOUS', position: 1 },
          { name: 'announcements', type: 'ANNOUNCEMENT', position: 2 },
        ],
      },
    },
    include: { channels: true },
  });
}

export async function joinSpace(spaceId: string, userId: string, role = 'MEMBER') {
  await prisma.spaceMember.upsert({
    where: { spaceId_userId: { spaceId, userId } },
    create: { spaceId, userId, role },
    update: { role },
  });
}
