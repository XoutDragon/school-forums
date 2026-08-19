import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { joinSpace, makeSpace, makeUser, type TestUser } from '../test/helpers.js';
import { anonAlias } from '../lib/anon.js';

let app: Express;
let owner: TestUser;
let member: TestUser;
let outsider: TestUser;
let textChannel: string;
let anonChannel: string;
let announceChannel: string;

beforeAll(async () => {
  app = createApp();
  owner = await makeUser(app);
  member = await makeUser(app);
  outsider = await makeUser(app);

  const space = await makeSpace(owner.id);
  await joinSpace(space.id, member.id, 'MEMBER');

  textChannel = space.channels.find((c) => c.type === 'TEXT')!.id;
  anonChannel = space.channels.find((c) => c.type === 'ANONYMOUS')!.id;
  announceChannel = space.channels.find((c) => c.type === 'ANNOUNCEMENT')!.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('messages — happy path', () => {
  it('posts, lists, edits and soft-deletes a message', async () => {
    const posted = await request(app)
      .post(`/api/channels/${textChannel}/messages`)
      .set('Cookie', member.cookie)
      .send({ content: 'Is the library open late tonight?' })
      .expect(201);

    expect(posted.body.author.kind).toBe('user');
    expect(posted.body.author.user.id).toBe(member.id);

    const listed = await request(app)
      .get(`/api/channels/${textChannel}/messages`)
      .set('Cookie', member.cookie)
      .expect(200);
    expect(listed.body.map((m: { id: string }) => m.id)).toContain(posted.body.id);

    const edited = await request(app)
      .patch(`/api/messages/${posted.body.id}`)
      .set('Cookie', member.cookie)
      .send({ content: 'Is the library open past midnight tonight?' })
      .expect(200);
    expect(edited.body.editedAt).not.toBeNull();

    await request(app)
      .delete(`/api/messages/${posted.body.id}`)
      .set('Cookie', member.cookie)
      .expect(204);

    // Soft delete (§8): the row survives so moderation can still trace it.
    const row = await prisma.message.findUnique({ where: { id: posted.body.id } });
    expect(row).not.toBeNull();
    expect(row!.deletedAt).not.toBeNull();
  });

  it("groups reactions and marks the viewer's own", async () => {
    const posted = await request(app)
      .post(`/api/channels/${textChannel}/messages`)
      .set('Cookie', owner.cookie)
      .send({ content: 'Found a good study spot on the 4th floor.' })
      .expect(201);

    await request(app)
      .post(`/api/messages/${posted.body.id}/reactions`)
      .set('Cookie', member.cookie)
      .send({ emoji: '👍' })
      .expect(201);

    const listed = await request(app)
      .get(`/api/channels/${textChannel}/messages`)
      .set('Cookie', member.cookie)
      .expect(200);

    const found = listed.body.find((m: { id: string }) => m.id === posted.body.id);
    expect(found.reactions).toEqual([{ emoji: '👍', count: 1, mine: true }]);
  });
});

describe('messages — permissions', () => {
  it('refuses a non-member posting into the space', async () => {
    const res = await request(app)
      .post(`/api/channels/${textChannel}/messages`)
      .set('Cookie', outsider.cookie)
      .send({ content: 'Let me in' })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('refuses a plain member posting in an announcement channel', async () => {
    const res = await request(app)
      .post(`/api/channels/${announceChannel}/messages`)
      .set('Cookie', member.cookie)
      .send({ content: 'Can I announce something' })
      .expect(403);
    expect(res.body.error.message).toMatch(/admins/i);

    // …but the owner can.
    await request(app)
      .post(`/api/channels/${announceChannel}/messages`)
      .set('Cookie', owner.cookie)
      .send({ content: 'Meeting moved to Wednesday.' })
      .expect(201);
  });

  it("refuses editing someone else's message", async () => {
    const posted = await request(app)
      .post(`/api/channels/${textChannel}/messages`)
      .set('Cookie', member.cookie)
      .send({ content: 'My own message' })
      .expect(201);

    await request(app)
      .patch(`/api/messages/${posted.body.id}`)
      .set('Cookie', outsider.cookie)
      .send({ content: 'Not my message' })
      .expect(403);
  });
});

/** §8: "Never expose authorId for anonymous messages in any API/socket payload.
 *  Write a test proving this." This is that test. */
describe('anonymous channels never leak authorship', () => {
  it('omits the author id from the create response and the listing', async () => {
    const posted = await request(app)
      .post(`/api/channels/${anonChannel}/messages`)
      .set('Cookie', member.cookie)
      .send({ content: 'Does anyone else feel behind this term?', isAnonymous: true })
      .expect(201);

    expect(posted.body.author.kind).toBe('anonymous');
    expect(posted.body.author).not.toHaveProperty('user');
    expect(posted.body.author.anon.alias).toMatch(/^Anonymous /);

    // The strongest form of the assertion: the id must not appear anywhere in the
    // serialised payload, however nested.
    expect(JSON.stringify(posted.body)).not.toContain(member.id);
    expect(JSON.stringify(posted.body)).not.toContain(member.username);

    const listed = await request(app)
      .get(`/api/channels/${anonChannel}/messages`)
      .set('Cookie', owner.cookie)
      .expect(200);

    expect(JSON.stringify(listed.body)).not.toContain(member.id);
    expect(JSON.stringify(listed.body)).not.toContain(member.username);
  });

  it('still stores the real author server-side for moderation', async () => {
    const posted = await request(app)
      .post(`/api/channels/${anonChannel}/messages`)
      .set('Cookie', member.cookie)
      .send({ content: 'Second anonymous post for the moderation trail.', isAnonymous: true })
      .expect(201);

    const row = await prisma.message.findUnique({ where: { id: posted.body.id } });
    expect(row!.authorId).toBe(member.id);
    expect(row!.isAnonymous).toBe(true);
  });

  it('gives one student a stable alias within a channel, and a different one elsewhere', async () => {
    const first = anonAlias(member.id, anonChannel);
    const again = anonAlias(member.id, anonChannel);
    const otherChannel = anonAlias(member.id, textChannel);

    expect(first.alias).toBe(again.alias); // conversations stay followable
    expect(first.alias).not.toBe(otherChannel.alias); // and don't correlate across channels
  });

  it('forces anonymity in an anonymous channel even when the client asks not to', async () => {
    const posted = await request(app)
      .post(`/api/channels/${anonChannel}/messages`)
      .set('Cookie', member.cookie)
      .send({ content: 'Posting without the anonymous flag set.', isAnonymous: false })
      .expect(201);

    // A named post in an anonymous channel would out everyone else by contrast.
    expect(posted.body.author.kind).toBe('anonymous');
    expect(JSON.stringify(posted.body)).not.toContain(member.id);
  });

  it('refuses anonymous posting in a normal channel', async () => {
    await request(app)
      .post(`/api/channels/${textChannel}/messages`)
      .set('Cookie', member.cookie)
      .send({ content: 'Trying to hide in a normal channel', isAnonymous: true })
      .expect(400);
  });
});

describe('threads', () => {
  it('keeps thread replies out of the main channel flow', async () => {
    const root = await request(app)
      .post(`/api/channels/${textChannel}/messages`)
      .set('Cookie', owner.cookie)
      .send({ content: 'Anyone want to split a textbook?' })
      .expect(201);

    await request(app)
      .post(`/api/channels/${textChannel}/messages`)
      .set('Cookie', member.cookie)
      .send({ content: 'I only need the first half', threadRootId: root.body.id })
      .expect(201);

    const main = await request(app)
      .get(`/api/channels/${textChannel}/messages`)
      .set('Cookie', member.cookie)
      .expect(200);
    expect(
      main.body.some((m: { content: string }) => m.content === 'I only need the first half'),
    ).toBe(false);

    const thread = await request(app)
      .get(`/api/messages/${root.body.id}/thread`)
      .set('Cookie', member.cookie)
      .expect(200);
    expect(thread.body).toHaveLength(2);
  });
});
