# CLAUDE.md — CampusConnect

> A student-centered social platform. Think Discord's real-time community structure, rebuilt from the ground up around campus life: finding clubs, connecting with people in your major, sharing course knowledge, forming study groups, and generally helping students succeed and feel less alone at university.

This file is the single source of truth for building the app. Read it fully before writing code. The app runs **entirely locally** — no cloud services, no external APIs, no deployment. Everything must work offline on `localhost`.

---

## 1. Product Vision

### The problem

- New students don't know how to find clubs, events, or people like them.
- Course knowledge (which prof to take, what the midterm is like, good study resources) lives in scattered group chats and dies every semester.
- Discord servers for schools exist but are generic — they aren't structured around majors, courses, or campus life, and useful info gets buried in chat scroll.

### The solution

CampusConnect organizes an entire campus into a structured, searchable, real-time community:

- **Chat like Discord** (servers → we call them _Spaces_; channels, DMs, threads, reactions, presence).
- **Structured knowledge like a wiki/forum** (course pages, resource libraries, pinned guides that persist across semesters).
- **Discovery like a directory** (club finder, study-buddy matching, event calendar, major communities).

### Design principles

1. **Persistent > ephemeral.** Anything useful (course tips, club info, guides) should live in structured pages, not just chat scroll.
2. **Opt-in identity.** Students choose what to show: real name, major, year, courses. Anonymous posting is allowed in designated channels only.
3. **Low social pressure.** Features should make it easy for shy students to connect (interest matching, small study groups, icebreaker prompts) without requiring them to cold-DM strangers.
4. **Campus-scoped.** One instance = one campus. All data is scoped to the campus. (Local dev seeds one fictional campus: "Lakeshore University".)

---

## 2. Tech Stack (local-only)

| Layer        | Choice                                                                  | Notes                                                                                                               |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Frontend     | React 18 + TypeScript + Vite                                            | SPA at `http://localhost:5173`                                                                                      |
| Styling      | Tailwind CSS + shadcn/ui                                                | Dark mode default, light mode toggle                                                                                |
| State        | Zustand (client state) + TanStack Query (server state)                  |                                                                                                                     |
| Routing      | React Router v6                                                         |                                                                                                                     |
| Backend      | Node.js + Express + TypeScript                                          | REST API at `http://localhost:3001`                                                                                 |
| Real-time    | Socket.IO                                                               | Chat, presence, typing indicators, notifications                                                                    |
| Database     | SQLite via Prisma ORM                                                   | File: `server/dev.db`. Zero setup.                                                                                  |
| Auth         | Email + password with bcrypt, JWT (httpOnly cookie)                     | No email verification service — auto-verify locally, but keep a `verifiedAt` field so the flow could be added later |
| File uploads | Local disk (`server/uploads/`), served statically                       | Avatars, images, PDFs/notes. Max 10 MB.                                                                             |
| Search       | SQLite FTS5 virtual tables                                              | Full-text search across courses, clubs, posts, resources                                                            |
| Validation   | Zod (shared schemas in `/shared`)                                       |                                                                                                                     |
| Testing      | Vitest + React Testing Library (frontend), Vitest + Supertest (backend) |                                                                                                                     |
| Monorepo     | npm workspaces: `client/`, `server/`, `shared/`                         |                                                                                                                     |

**Do not** introduce Docker, Redis, Postgres, S3, external email/SMS providers, or any paid API. If a feature seems to need one, build a local stand-in (e.g., in-memory queue, disk storage).

### Run commands

```bash
npm install            # root, installs all workspaces
npm run dev            # concurrently runs client (5173) + server (3001)
npm run db:migrate     # prisma migrate dev
npm run db:seed        # seed Lakeshore University demo data
npm run test           # all workspaces
npm run lint           # eslint + prettier check
```

---

## 3. Project Structure

```
campusconnect/
├── CLAUDE.md
├── package.json                 # workspaces root
├── shared/
│   └── src/
│       ├── types.ts             # shared TS types (derive from Zod schemas)
│       └── schemas/             # Zod schemas per domain (auth, chat, clubs, courses...)
├── server/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── uploads/                 # gitignored
│   └── src/
│       ├── index.ts             # express + socket.io bootstrap
│       ├── middleware/          # auth, rateLimit, errorHandler, upload
│       ├── routes/              # one router file per domain
│       ├── services/            # business logic, no express types here
│       ├── sockets/             # socket.io event handlers
│       └── lib/                 # prisma client, jwt, fts helpers
└── client/
    └── src/
        ├── main.tsx
        ├── app/                 # router, layout shells
        ├── features/            # one folder per feature (chat, clubs, courses, ...)
        │   └── <feature>/
        │       ├── components/
        │       ├── hooks/
        │       └── api.ts       # TanStack Query hooks
        ├── components/ui/       # shadcn primitives
        ├── stores/              # zustand stores (auth, socket, ui)
        └── lib/                 # socket client, fetch wrapper, utils
```

---

## 4. Core Domain Model

Prisma schema — build exactly these models (fields may be extended, not removed). All models get `id` (cuid), `createdAt`, `updatedAt` unless noted.

### Identity

- **User**: email, passwordHash, username (unique), displayName, avatarUrl?, bio?, pronouns?, year (`FRESHMAN|SOPHOMORE|JUNIOR|SENIOR|GRAD|ALUM`), majorId?, minorId?, interests (join table), karma (int, default 0), settings (JSON: theme, DM privacy, discoverability), lastSeenAt, verifiedAt
- **Major**: name, faculty (e.g., "Faculty of Science"), description
- **Interest**: name, category (`ACADEMIC|HOBBY|SPORT|CREATIVE|SOCIAL|CAREER`)
- **UserCourse**: userId, courseId, term (e.g., `2026FA`), status (`TAKING|COMPLETED|PLANNED`) — powers "classmates" features

### Spaces & Chat (the Discord layer)

- **Space**: name, slug, description, iconUrl?, bannerUrl?, type (`MAJOR|CLUB|COURSE|RESIDENCE|GENERAL|STUDY_GROUP`), visibility (`PUBLIC|PRIVATE`), ownerId, linkedClubId?, linkedCourseId?, linkedMajorId?
- **SpaceMember**: spaceId, userId, role (`OWNER|ADMIN|MOD|MEMBER`), nickname?, joinedAt
- **Channel**: spaceId, name, topic?, type (`TEXT|ANNOUNCEMENT|RESOURCES|QA|ANONYMOUS|VOICE_STUB`), position, isDefault
- **Message**: channelId, authorId?, content (markdown), attachments (JSON array of upload refs), replyToId?, threadRootId?, isAnonymous (bool — authorId still stored for moderation, never exposed to clients when true), editedAt?, deletedAt? (soft delete)
- **Reaction**: messageId, userId, emoji
- **DirectConversation** + **DirectMessage**: 1:1 and small group DMs (max 10 people)
- **PinnedMessage**: channelId, messageId, pinnedById

`VOICE_STUB` channels render a UI showing who has "joined" (presence only, via sockets) but do **not** implement actual audio. Leave a clean interface (`VoiceProvider`) so WebRTC could be added later.

### Clubs

- **Club**: name, slug, description, category (`ACADEMIC|CULTURAL|SPORTS|ARTS|VOLUNTEER|PROFESSIONAL|GAMING|RELIGIOUS|OTHER`), logoUrl?, meetingInfo?, socialLinks (JSON), memberCountEstimate, isRecruiting (bool), spaceId? (auto-created Space)
- **ClubMembership**: clubId, userId, role (`PRESIDENT|EXEC|MEMBER|FOLLOWER`) — `FOLLOWER` = gets updates without joining
- **ClubEvent** → see Events

### Courses & Knowledge

- **Course**: code (e.g., `CS 2210`), title, description, majorId?, level (1000–9000), avgDifficulty (computed), avgWorkload (computed)
- **CourseReview**: courseId, authorId, term, profName, difficulty (1–5), workload (1–5), rating (1–5), tips (text), wouldRecommend (bool). One review per user per course per term. Displayed anonymized by default (author can opt to show name).
- **Resource**: courseId? | spaceId?, uploaderId, title, description?, type (`NOTES|PRACTICE_EXAM|CHEAT_SHEET|LINK|GUIDE|OTHER`), fileUrl? | linkUrl?, term?, upvotes (via ResourceVote), downloadCount
- **ResourceVote**: resourceId, userId, value (+1/-1)
- **QAPost** / **QAAnswer**: StackOverflow-lite scoped to a course or space; accepted answer flag; upvotes

### Study & Social Matching

- **StudyGroup**: courseId?, name, description, maxSize (default 6), meetingType (`IN_PERSON|ONLINE|HYBRID`), schedule (JSON: weekday/time slots), locationHint?, ownerId, status (`OPEN|FULL|ARCHIVED`)
- **StudyGroupMember**: groupId, userId, status (`MEMBER|REQUESTED`)
- **BuddyProfile**: userId, isActive, lookingFor (`STUDY_PARTNER|FRIENDS|CLUB_BUDDY|GYM_PARTNER|LANGUAGE_EXCHANGE`[]), availability (JSON weekly grid), note?
- **BuddyMatch**: userAId, userBId, score, status (`SUGGESTED|CONNECTED|DISMISSED`) — matching algorithm in §5.6

### Events

- **Event**: title, description, hostType (`CLUB|SPACE|USER|CAMPUS`), hostId, startsAt, endsAt, location, locationDetail?, capacity?, coverUrl?, tags (string[] JSON)
- **EventRSVP**: eventId, userId, status (`GOING|INTERESTED|DECLINED`)

### Campus Utility

- **MarketplaceListing**: sellerId, title, description, price (cents), category (`TEXTBOOK|ELECTRONICS|FURNITURE|TICKETS|OTHER`), courseId? (for textbooks), photos (JSON), status (`ACTIVE|PENDING|SOLD`)
- **LostFoundItem**: reporterId, kind (`LOST|FOUND`), title, description, location, photoUrl?, status (`OPEN|RESOLVED`)
- **MentorProfile**: userId, isMentor, capacity, topics (string[]), blurb — matches upper-years with lower-years in same major
- **MentorLink**: mentorId, menteeId, status (`REQUESTED|ACTIVE|ENDED`)

### Trust & Safety

- **Report**: reporterId, targetType (`MESSAGE|USER|RESOURCE|LISTING|REVIEW|EVENT`), targetId, reason, status (`OPEN|ACTIONED|DISMISSED`), resolvedById?
- **ModerationAction**: moderatorId, targetUserId, type (`WARN|MUTE|KICK|BAN|CONTENT_REMOVED`), scope (spaceId? or global), reason, expiresAt?
- **Notification**: userId, type, payload (JSON), readAt? — delivered live via socket + persisted

---

## 5. Feature Specifications

Build in this order. Each numbered feature should be fully working (API + UI + tests) before moving to the next.

### 5.1 Auth & Onboarding

- Register (email/username/password), login, logout, session restore from cookie.
- **Onboarding wizard** (first login, skippable but nagged once): pick major → pick year → pick 3+ interests → add current courses (searchable multiselect) → auto-suggest Spaces to join (their major Space, Spaces for each course, 3 clubs matching interests). Joining is one click per suggestion.
- Profile page: editable everything, shows badges (§5.9), joined clubs/spaces, courses (respecting privacy settings).

### 5.2 Spaces & Real-Time Chat (the backbone)

Discord-familiar three-pane layout: Space rail (left icon column) → channel list → chat pane → member list (collapsible).

- Text channels: markdown rendering (bold/italic/code/links/lists), image + file attachments, emoji reactions, reply-to, edit/delete own messages, infinite upward scroll pagination (50/page).
- **Threads**: reply "in thread" spawns a side panel; thread activity doesn't clutter the main channel.
- Typing indicators, online presence dots, unread badges per channel/space, @mentions with notification.
- **Announcement channels**: only ADMIN+ can post; members can react but not message.
- **Anonymous channels**: posts show as "Anonymous Raccoon", "Anonymous Heron" etc. (deterministic per-user-per-channel animal alias so conversations are followable); real identity stored server-side for moderation only. Rate-limited to 5 posts/hour/user.
- DMs: 1:1 and group. Respect DM privacy setting (`EVERYONE|SHARED_SPACE_ONLY|NOBODY`).
- Socket events namespace plan: `message:new|edit|delete`, `reaction:add|remove`, `typing:start|stop`, `presence:update`, `notification:push`. Client joins socket rooms per open channel + a personal room `user:{id}`.

### 5.3 Major Communities (auto-generated)

- Every Major gets an auto-created public Space on seed: channels `#general`, `#course-help`, `#internships-careers`, `#memes`, `#anonymous` (anonymous type), `#resources` (resources type).
- Major landing page shows: member count by year, upcoming events tagged to the major, top resources this term, "People in your year" grid (discoverable users only) with a one-click **wave** 👋 (sends a lightweight notification — lower pressure than a DM; if both wave, prompt both to start a DM).

### 5.4 Club Discovery & Club Spaces

- **Club directory**: card grid, filter by category/recruiting status, full-text search, sort by members/newest. Each card: logo, one-liner, category chip, "Recruiting now" badge.
- Club page: about, meeting info, exec list, upcoming events, photo strip (recent image attachments from their space), Join / Follow buttons.
- Joining a club auto-joins its Space. Followers see announcements only.
- **Club quiz**: 6-question interest quiz ("Weeknights or weekends?", "Build things / debate things / perform things?"...) → ranks clubs by tag overlap and shows top 5. Fun, shareable result card.
- Club execs (PRESIDENT/EXEC) get a mini dashboard: member list, announcement composer (cross-posts to space + follower notifications), event creator.

### 5.5 Course Hub (the knowledge layer — this is the killer feature)

Every Course gets a page with tabs:

1. **Overview**: description, difficulty/workload/rating gauges (aggregated from reviews), "X students taking this term", current-term Space join button.
2. **Reviews**: filter by term/prof, sorted by helpfulness. Write-review form enforces one per term. Reviews are structured (sliders + tips textarea) so aggregates stay meaningful.
3. **Resources**: upvotable library of notes/practice exams/guides. Upload flow tags term + type. Sort by top/new. Preview PDFs inline (iframe of served file). Downloading increments counter and grants uploader +2 karma.
4. **Q&A**: ask/answer, upvote, accept answer (asker only). Accepted answer grants +10 karma.
5. **Classmates**: users with `UserCourse` this term who are discoverable — grid with wave button, plus "Find a study group" CTA.

- Course search bar in the top nav from anywhere (FTS across code + title).
- Term-over-term persistence is the point: last year's resources and reviews remain visible, clearly labeled by term.

### 5.6 Study Groups & Buddy Matching

- Study group board per course + global board. Create/browse/request-to-join; owner approves. When full → status FULL. Each group auto-gets a private group DM.
- **Availability grid**: 7×5 weekly checkbox grid (Mon–Sun × morning/midday/afternoon/evening/night) stored on BuddyProfile; study group creation suggests times where members overlap.
- **Buddy matching algorithm** (run on demand, "Find matches" button, plus nightly local cron via `node-cron`):
  - Candidate pool: active BuddyProfiles, discoverable, not already matched/dismissed.
  - Score = 3×(shared current courses) + 2×(same major) + 1×(same year) + 1×(each shared interest, cap 5) + 2×(availability overlap ≥ 3 slots) + 1×(overlapping `lookingFor`).
  - Show top 5 as cards ("You and Maya are both in CS 2210 and both play badminton"). Explain _why_ matched — the explanation string is required, generated from the scoring components. Connect → creates DM with an auto-inserted icebreaker prompt; Dismiss → never resurface.

### 5.7 Events & Campus Calendar

- Unified calendar (month + list views) of club events, space events, campus-wide events. Filter by tag/category/"my clubs only".
- Event page: RSVP (going/interested), attendee avatars, add-to-space announcement, "3 people from your major are going" social proof line.
- **This Week digest**: home-page widget summarizing this week's events from clubs the user joined/followed + their major.

### 5.8 Campus Utility Suite

- **Marketplace**: listings grid with photos, textbook listings link to Course pages ("2 used copies available" on the course Overview tab). In-app "Message seller" opens a DM. No payments — buyers/sellers arrange in person; seller marks SOLD.
- **Lost & Found**: simple feed with photos and locations, resolve button.
- **Mentorship**: upper-years opt in as mentors with topics ("first-year survival", "co-op applications", "research"); lower-years browse mentors in their major and request; accepted link opens a DM. Cap requests at mentor capacity.

### 5.9 Gamification & Karma (light touch)

- Karma sources: resource upvote +1, resource download +2, accepted answer +10, review posted +5, event hosted +5. Karma shows on profile, no leaderboards (avoid toxic competition).
- **Badges** (auto-awarded, seed the definitions): First Post, Helpful Hand (10 resource upvotes), Scholar (5 reviews), Connector (5 buddy connections), Club Hopper (joined 3 clubs), Early Bird (RSVP'd 5 events), Founder (created a study group that filled).
- Weekly **home feed**: "New in your spaces" (top announcements), This Week events widget, suggested buddies, trending resources in your courses, one suggested club.

### 5.10 Moderation & Safety

- Report button on messages, users, resources, listings, reviews, events.
- Space mods: delete messages, mute (timed), kick, pin. Global admins (seeded account): ban, resolve reports, view anonymous-post authorship (logged in ModerationAction).
- Word-filter (configurable JSON list) that soft-blocks a message client-side with "rephrase?" prompt and hard-blocks slurs server-side.
- Rate limits (middleware): 20 messages/min, 5 anonymous posts/hr, 10 uploads/day, 3 reports/hr.

### 5.11 Search & Notifications

- Global search (⌘K palette): tabs for Courses, Clubs, People, Spaces, Resources, Events. FTS5-backed, keyboard navigable.
- Notification center (bell): mentions, waves, DM requests, study-group approvals, event reminders (1 hr before, via local cron), mentor requests, badge earned. Live via socket, persisted, mark-all-read.

---

## 6. Seed Data (`npm run db:seed`)

Seed a believable "Lakeshore University" so every feature is demonstrable immediately:

- 12 majors across 4 faculties; 40 courses (varied levels) with realistic codes/titles.
- 60 users (varied majors/years/interests; password `password123` for all; one admin `admin@lakeshore.edu`).
- 15 clubs across categories (5 recruiting) with populated Spaces and 20–50 messages each.
- Auto-Spaces for all majors + 10 course Spaces with chat history including threads, reactions, pins, an anonymous-channel exchange.
- 30 course reviews, 25 resources (generate small placeholder PDFs), 12 Q&A posts, 8 study groups (2 full), 14 events across the next 3 weeks with RSVPs, 10 marketplace listings, 4 lost&found items, 6 mentors with 3 active links, badges pre-awarded where earned.
- Log the demo credentials at the end of the seed run.

---

## 7. UI/UX Direction

- **Layout**: persistent left icon rail (Home, Spaces list, Explore, Calendar, Marketplace, DMs, Profile). Chat views use Discord-style three-pane. Everything else uses a centered max-w-6xl content column.
- **Aesthetic**: friendly-but-not-childish. Rounded-xl cards, generous whitespace, one accent color (indigo) + per-feature secondary hues (clubs=amber, courses=emerald, events=rose). Subtle animations only (150ms). Dark mode is the default and must look first-class.
- **Empty states matter**: every list gets a designed empty state with a CTA (e.g., empty study-group board → "Be the founder — groups that exist get joined").
- Fully keyboard-navigable palette (⌘K) and sensible focus rings. Responsive down to 375px (mobile gets a bottom tab bar; chat panes stack).
- Loading: skeletons, not spinners, for lists.

---

## 8. Engineering Conventions

- TypeScript `strict` everywhere. No `any` without an eslint-disable comment explaining why.
- All request/response bodies validated with shared Zod schemas; infer types from them.
- Services layer owns Prisma; routes stay thin. Socket handlers call the same services as REST where logic overlaps.
- Errors: central error middleware; API errors are `{ error: { code, message } }` with proper status codes.
- Soft-delete messages; never hard-delete Users (anonymize instead: `deleted-user-{id}`).
- Never expose `authorId` for anonymous messages in any API/socket payload. Write a test proving this.
- Every feature ships with: happy-path API tests, one auth/permission test, one component test.
- Commits: conventional commits (`feat:`, `fix:`, `chore:`). Small, feature-scoped.
- Keep a `PROGRESS.md` at repo root: check off features from §5 as completed, note deviations from this spec and why.

## 9. Milestones

1. **M1 — Skeleton**: monorepo, Prisma schema migrated, auth, seed script, app shell with routing + dark mode.
2. **M2 — Chat core**: Spaces, channels, real-time messaging, threads, reactions, DMs, presence, notifications plumbing.
3. **M3 — Campus graph**: onboarding wizard, majors, courses + UserCourse, major Spaces, profiles, waves.
4. **M4 — Knowledge**: Course Hub (reviews, resources, Q&A, classmates), global search.
5. **M5 — Community**: club directory + pages + quiz, events + calendar, study groups + buddy matching.
6. **M6 — Utility & polish**: marketplace, lost & found, mentorship, badges/karma, moderation, rate limits, empty states, responsive pass, full seed.

Definition of done for the project: a fresh clone + `npm install && npm run db:migrate && npm run db:seed && npm run dev` yields a fully browsable, chat-working, seeded campus with all §5 features functional locally.
