# PROGRESS

Tracks §5 features and records deviations from `CLAUDE.md`, per §8.

Verified on Windows 11 / Node 24.18 / npm 11.16.

```
npm install
npm run db:migrate     # migrate + build the FTS5 index
npm run db:seed        # Lakeshore University, logs demo credentials
npm run dev            # client :5173  ·  api :3001
```

Sign in with any seeded account — `admin@lakeshore.edu` / `password123`.

---

## Milestones

|     | Milestone                                                                   | State                 |
| --- | --------------------------------------------------------------------------- | --------------------- |
| M1  | Skeleton — monorepo, schema, auth, seed, app shell                          | **Done**              |
| M2  | Chat core — spaces, channels, real-time, threads, reactions, DMs, presence  | **Done**              |
| M3  | Campus graph — onboarding, majors, courses, profiles, waves                 | **Done**              |
| M4  | Knowledge — course hub, reviews, resources, Q&A, search                     | **Done** (see gaps)   |
| M5  | Community — clubs, quiz, events, study groups, buddy matching               | **Done** (see gaps)   |
| M6  | Utility & polish — marketplace, lost & found, mentorship, karma, moderation | **Mostly** (see gaps) |

## §5 Features

### 5.1 Auth & Onboarding — done

- [x] Register / login / logout / session restore (bcrypt + JWT in an httpOnly cookie)
- [x] Onboarding wizard: major → year → 3+ interests → courses → one-click join suggestions
- [x] Skippable but insistent — every route redirects to it until completed or skipped
- [x] Profile page with editable fields, privacy switches, badges, courses, clubs

### 5.2 Spaces & Real-Time Chat — done

- [x] Three-pane layout (space rail → channels → chat → collapsible members)
- [x] Markdown subset, attachments, reactions, reply-to, edit/delete own, 50/page upward pagination
- [x] Threads in a side panel; replies stay out of the main channel flow
- [x] Typing indicators, presence dots, per-channel unread badges, @mention notifications
- [x] Announcement channels (ADMIN+ posts, everyone reacts)
- [x] Anonymous channels with deterministic per-user-per-channel animal aliases, 5/hour
- [x] DMs 1:1 and group (max 10), honouring `EVERYONE | SHARED_SPACE_ONLY | NOBODY`
- [x] Socket events exactly as specified; rooms per channel plus `user:{id}`

### 5.3 Major Communities — done

- [x] Auto-created public Space per major with all six specified channels
- [x] Landing page: members by year, tagged events, top resources, people-in-your-year grid
- [x] Wave 👋 with mutual-wave detection that prompts both sides to open a DM

### 5.4 Club Discovery & Club Spaces — done

- [x] Directory: card grid, category/recruiting filters, search, sort by members/newest
- [x] Club page: about, meeting info, execs, events, photo strip from the space, Join/Follow
- [x] Joining auto-joins the space; followers get announcements only
- [x] Six-question quiz ranking clubs by tag overlap, showing what matched
- [x] Exec announcement composer (cross-posts to the space + notifies followers)

### 5.5 Course Hub — done

- [x] Overview with difficulty/workload/rating gauges and textbook-listing count
- [x] Reviews: structured sliders + tips, one per user per course per term, anonymous by default
- [x] Resources: upvotes, term/type tags, inline PDF preview, downloads grant +2 karma
- [x] Q&A: ask/answer/upvote/accept, accepted answer grants +10 karma
- [x] Classmates grid with wave, respecting discoverability
- [x] FTS5 search across code + title from the ⌘K palette
- [x] Term-over-term persistence — last year's reviews and resources stay, labelled by term

### 5.6 Study Groups & Buddy Matching — done

- [x] Study group board, request-to-join, owner approves in place, auto-FULL at capacity
- [x] 7×5 availability grid stored as a flat 35-slot array
- [x] Scoring exactly per spec (3× shared courses, 2× major, 1× year, 1× interest capped at 5, 2× availability ≥3 slots, 1× overlapping goal)
- [x] Explanation string generated from the scoring components — **required**, never rendered without one
- [x] Connect opens a DM with an icebreaker; Dismiss never resurfaces
- [x] Nightly `node-cron` refresh

### 5.7 Events & Campus Calendar — done

- [x] Month and list views, filter by "my clubs only"
- [x] Event page: RSVP, attendee avatars, capacity, "N people from your major are going"
- [x] This Week digest on the home page

### 5.8 Campus Utility Suite — done

- [x] Marketplace with textbook↔course linking and "Message seller" opening a DM
- [x] Lost & Found feed with resolve
- [x] Mentorship with topics, capacity caps, and accepted requests opening a DM

### 5.9 Gamification & Karma — done

- [x] All five karma sources; karma on profile; no leaderboards
- [x] All seven badges, awarded from real activity (idempotent re-evaluation)
- [x] Weekly home feed: announcements, This Week, suggested buddies, trending resources, one club

### 5.10 Moderation & Safety — mostly

- [x] Report button targets, admin report queue, resolve
- [x] Mod delete + pin; admin unmasking of anonymous authors, logged as a ModerationAction
- [x] Word filter — soft client-side "rephrase?" nudge, hard server-side block
- [x] Rate limits: 20 msg/min, 5 anon/hr, 10 uploads/day, 3 reports/hr
- [ ] **Timed mute / kick / ban** — `ModerationAction` records them but no enforcement middleware reads them yet, and there's no admin UI to issue them
- [ ] The seeded `blocked` word list is empty (see deviations)

### 5.11 Search & Notifications — done

- [x] ⌘K palette, 6 scopes, keyboard navigable (arrows / Tab / Enter / Esc)
- [x] FTS5 over courses, clubs, resources, Q&A; LIKE for people/spaces/events
- [x] Notification centre with live socket delivery, persistence, mark-all-read
- [x] Event reminders 1 hour out via local cron

---

## Deviations from CLAUDE.md, and why

1. **FTS5 lives in `prisma/fts.ts`, not a migration.** §2 asks for FTS5 virtual tables. Prisma has no syntax for them, and putting the raw SQL in a migration makes `prisma migrate dev` detect permanent drift — it tries to drop the fts shadow tables on every run. The index is instead rebuilt idempotently by a script that both `db:migrate` and `db:seed` call. `search.service.ts` falls back to `LIKE` if the tables are missing, so search degrades rather than 500s.

2. **`SERVER_PORT`, not `PORT`.** §2 pins the API to 3001. Reading the generic `PORT` variable meant any parent process exporting `PORT=5173` made the API try to bind the client's port — which happened in practice during development. The variable is named `SERVER_PORT` so it can't be inherited by accident.

3. **Prisma enums are `String` columns.** SQLite supports neither enums nor scalar lists. Every `@shared enum` field is a String validated by the matching Zod enum in `shared/src/schemas/common.ts`, which is the source of truth. Arrays and the availability grid are JSON strings parsed in the service layer.

4. **~77 course reviews instead of §6's 30.** Sampling 30 of 40 courses left the rest with dead gauges and an empty Reviews tab — including CS 2210, the course this spec uses as its own example. Every course now gets at least one review; courses with their own Space get 3–5.

5. **16 events instead of §6's 14, and a third are `CAMPUS`-hosted.** With every event hosted by a club, a student whose clubs happen not to be hosting saw an empty week strip — the one screen that has to look alive on a fresh seed. Two events are also anchored to today and tomorrow so the strip is populated whichever weekday the seed runs on.

6. **The word filter ships with an empty `blocked` list.** §5.10 wants slurs hard-blocked server-side. The mechanism is built and tested; the list is empty because shipping a slur list in the repo is worse than leaving it configurable. `server/src/lib/wordfilter.json` is the drop-in point. The `flagged` list is populated so the "rephrase?" nudge is demonstrable.

7. **No `Space` creation UI.** The API (`POST /api/spaces`) and permissions exist and are used by the seed, but the only client path into a new Space is via a club. Not required by §5, so it was left out rather than half-built.

8. **Group DM for study groups is created but not wired to the group page.** §5.6 says each group "auto-gets a private group DM". The conversation is created on group creation; the study-group card doesn't yet link to it.

## Known gaps

- Voice channels render presence only, as §4 specifies. `VoiceProvider` was not extracted as a named interface — the stub is a component, so WebRTC would need that seam introduced first.
- Mute/kick/ban enforcement (see §5.10 above).
- Resource upload happens through the generic `/api/uploads` endpoint; the Course Hub resource tab lists and votes but has no in-page upload form yet.
- Client test coverage is thin — the Markdown renderer is covered (including that it never interprets HTML). §8 asks for a component test per feature; most features have API and permission tests but no component test.

## Test coverage

```
npm run test        # server 17 + client 5
npm run lint        # eslint + prettier, both clean
```

Server suites cover the auth happy path, the "same error for bad password and unknown email" property, message CRUD, reactions, threads, three permission cases, and five separate assertions that **anonymous channels never serialize `authorId`** — the regression test §8 explicitly requires.
