# Campus Hub — MVP base

Stack: **Next.js (App Router) + Convex + Tailwind**, TypeScript throughout. Voice channels are
stubbed for **LiveKit** but not wired up yet (see `components/VoiceChannelView.tsx`).

## What's built

- **First-run admin setup** (`app/admin/setup`) — the very first visitor to a fresh instance
  gets sent here (checked via `admin.getConfig` in `app/page.tsx` and `app/login`). Configures
  the institution name, the allowed sign-in email domain(s), and a master admin password. Nothing
  else in the app works until this is completed.
- **Admin login** (`app/admin/login`) — separate from student login; IT staff log back in with
  just the master password. Sessions are short-lived tokens (`adminSessions` table, 12h expiry),
  not just a client-side flag — every admin mutation re-checks the token server-side
  (`requireAdminSession` in `convex/admin.ts`).
- **Admin dashboard** (`app/admin/dashboard`) — three tabs:
  - **Overview** — counts (users/topics/channels/threads) + current instance settings.
  - **Logs** — audit trail of topic/channel creation & deletion, members joining/leaving,
    role changes, and admin removals (`auditLogs` table, written via `convex/log.ts`).
    Deliberately does **not** log message/thread content — that's the topic owner's
    responsibility, per your call.
  - **Topics & members** — expand any topic to see its members, change their role
    (owner/moderator/member), remove them, or delete the topic entirely (cascades to its
    channels/threads/posts).
  - **Majors & interests** — admins curate the catalog students pick from during onboarding
    (majors like Computer Science/Bioengineering/Art/Music, plus classes/clubs/hobbies/other).
    Add or remove options here; changes show up in onboarding immediately since it's the same
    `interests` table read by `interests.list`.
- **Mock login** (`app/login`) — collects name + school/alumni email, validated against
  whichever domains were set during admin setup (no longer hardcoded). Creates/looks up a
  `users` row. Swap for real SSO later — everything downstream only depends on a `users` doc id
  (`lib/session.ts`).
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

Visit `http://localhost:3000` on a **fresh** deployment — it'll route you to `/admin/setup`
first. Fill that out (institution name, allowed domains, master password) and you'll land in the
admin dashboard. From there, open a normal/incognito window and go to `/login` to try the
student flow with an email on one of the domains you just configured.

## What I'd tackle next (not in this base)

1. **Real auth** — school SSO (Google Workspace for Education / SAML) for students, instead of
   the mock email check in `app/login/page.tsx`; and consider 2FA or a stronger credential than a
   single shared password for the admin account in `convex/admin.ts`.
2. **Voice channels** — wire up LiveKit: a Convex `action` that calls LiveKit's server SDK to
   create a room + mint a join token, then use `@livekit/components-react` in
   `VoiceChannelView.tsx` to actually connect and render participant tiles.
3. **Thread detail page** — right now threads list in the channel but don't have their own page
   with replies rendered (the `threads.listPosts` / `threads.reply` functions already exist in
   `convex/threads.ts`, just need a `app/topics/[topicId]/threads/[threadId]/page.tsx`).
4. **Permissions granularity** — per-channel visibility (e.g. mod-only channels), transferring
   ownership before an owner leaves.
5. **Private/invite-only topics** — right now `topics.join` auto-joins anyone who visits a topic
   page; add an `isPublic` gate + join request flow for restricted topics.
6. **Editable instance settings** — the Overview tab shows institution name/domains read-only;
   add a mutation + form to edit them (and to rotate the admin password) after setup.
7. **Multiple admin accounts** — right now it's one shared master password; consider named admin
   accounts if more than one staff member needs dashboard access, so log entries can attribute
   admin actions to a specific person instead of just "Admin".
8. **Search** and **notifications** across topics/threads.

## File map

```
convex/
  schema.ts       tables: institutionConfig, adminSessions, auditLogs, users, interests,
                   userInterests, topics, topicMembers, channels, threads, posts
  admin.ts        setup wizard, admin login/session validation, logs, institution-wide stats
  log.ts          logEvent() helper used by topics.ts / channels.ts to write audit entries
  users.ts        mock login, onboarding
  interests.ts    seed + list catalog
  topics.ts       create, discover feeds (new/popular/forYou), join/leave, membership,
                   admin-only changeRole/removeMember/deleteTopic
  channels.ts     list/create/delete channels (owner/mod only)
  threads.ts      create thread, list threads, list/add posts (replies)
app/
  admin/setup/      first-run institution setup wizard
  admin/login/      admin (IT staff) login, separate from student login
  admin/dashboard/  Overview / Logs / Topics & members tabs
  login/            mock student login screen (domain-checked against admin setup)
  onboarding/       interest picker
  discover/         tabbed topic feed + create-topic button
  topics/create/    create topic form
  topics/[topicId]/ channel sidebar + text/voice channel views
components/       ChannelSidebar, TextChannelView, VoiceChannelView, TopicCard,
                  AdminLogsPanel, AdminTopicsManager
lib/session.ts       localStorage-based mock student session hook
lib/adminSession.ts  localStorage-based admin session token hook
```
