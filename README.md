# Campus Hub — MVP base

Stack: **Next.js (App Router) + Convex + Tailwind**, TypeScript throughout. Voice channels are
stubbed for **LiveKit** but not wired up yet (see `components/VoiceChannelView.tsx`).

## What's built

- **Mock login** (`app/login`) — collects name + school/alumni email, restricted to
  `@student.edu` / `@alumni.edu` for now. Creates/looks up a `users` row. Swap for real SSO
  later — everything downstream only depends on a `users` doc id (`lib/session.ts`).
- **Onboarding** (`app/onboarding`) — pick interests (classes/clubs/hobbies) from a seeded
  catalog. Stored in `userInterests`.
- **Discover** (`app/discover`) — three tabs: **For you** (topics matching your interests),
  **New**, **Popular** (by member count).
- **Create topic** (`app/topics/create`) — any logged-in user can create one. Creating a topic
  auto-provisions a `#general` text channel and a `Hangout` voice channel, and makes the creator
  the `owner`.
- **Topic page** (`app/topics/[topicId]`) — Discord-style layout: channel sidebar (text + voice),
  text channels show Reddit-style threads, voice channels show a placeholder panel.
- **Roles**: `owner` / `moderator` / `member` per topic (`topicMembers` table). Only
  owners/moderators can create channels right now (`convex/channels.ts`) — extend
  `requireModOrOwner` for more granular permissions (e.g. per-channel read/write, kick/ban).

## Setup

```bash
npm install
npx convex dev        # spins up your Convex dev deployment, generates convex/_generated/*
```

`npx convex dev` will print a deployment URL — copy `.env.local.example` to `.env.local` and
paste it in as `NEXT_PUBLIC_CONVEX_URL`.

Seed the interests catalog once (from a second terminal, or the Convex dashboard's "Run
function" panel):

```bash
npx convex run interests:seed
```

Then in a separate terminal:

```bash
npm run dev
```

Visit `http://localhost:3000` — it'll route you to `/login` first.

## What I'd tackle next (not in this base)

1. **Real auth** — school SSO (Google Workspace for Education / SAML) instead of the mock email
   check in `app/login/page.tsx`, plus a verification step for alumni accounts.
2. **Voice channels** — wire up LiveKit: a Convex `action` that calls LiveKit's server SDK to
   create a room + mint a join token, then use `@livekit/components-react` in
   `VoiceChannelView.tsx` to actually connect and render participant tiles.
3. **Thread detail page** — right now threads list in the channel but don't have their own page
   with replies rendered (the `threads.listPosts` / `threads.reply` functions already exist in
   `convex/threads.ts`, just need a `app/topics/[topicId]/threads/[threadId]/page.tsx`).
4. **Permissions granularity** — per-channel visibility (e.g. mod-only channels), banning/kicking,
   transferring ownership.
5. **Private/invite-only topics** — right now `topics.join` auto-joins anyone who visits a topic
   page; add a `isPublic` gate + join request flow for restricted topics.
6. **Search** — search across topics/threads.
7. **Notifications** — new thread/reply notifications for topics you've joined.

## File map

```
convex/
  schema.ts       tables: users, interests, userInterests, topics, topicMembers, channels, threads, posts
  users.ts        mock login, onboarding
  interests.ts    seed + list catalog
  topics.ts       create, discover feeds (new/popular/forYou), join/leave, membership
  channels.ts     list/create/delete channels (owner/mod only)
  threads.ts      create thread, list threads, list/add posts (replies)
app/
  login/          mock login screen
  onboarding/     interest picker
  discover/       tabbed topic feed + create-topic button
  topics/create/  create topic form
  topics/[topicId]/  channel sidebar + text/voice channel views
components/       ChannelSidebar, TextChannelView, VoiceChannelView, TopicCard
lib/session.ts    localStorage-based mock session hook
```
