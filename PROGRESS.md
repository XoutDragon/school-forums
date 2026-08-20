# PROGRESS

Tracks §5 features and records deviations from `CLAUDE.md`, per §8.

```
npm install
cp .env.local.example .env.local
npx convex dev          # one terminal: pushes schema + functions, watches
npm run convex:seed     # populates a demo campus, logs credentials
npm run dev             # client on :5173
```

Nothing runs until `npx convex dev` has been authenticated once — it is what writes
`convex/_generated/`, which the client imports.

---

## The big deviation: this no longer runs locally

`CLAUDE.md` §2 specifies Express + Prisma + SQLite + Socket.IO, entirely offline on
`localhost`, with an explicit instruction not to introduce cloud services. **That is
no longer what this is.** The backend was ported to Convex at the owner's direction,
which changes four things the spec assumed:

- **Data leaves the machine.** Convex is a hosted platform. There is no `dev.db`.
- **The realtime layer is gone.** Convex queries are subscriptions, so Socket.IO,
  its five event handlers and the client-side reducers that folded events into
  local state were all deleted. Presence became a heartbeat row; typing became a
  field on it.
- **Sessions are not httpOnly.** Convex function calls carry no cookies, so the JWT
  cookie became a token in `localStorage`, passed as an argument. This is a real
  security downgrade and is documented in `convex/lib/auth.ts` and in the privacy
  policy rather than papered over.
- **bcrypt became PBKDF2-SHA512.** bcrypt is native and cannot run in Convex's V8
  isolate. Any account hashed with the old scheme must reset its password.

One further external dependency, added with voice: a public **STUN server**
(Google's by default, `VITE_STUN_URL` to change it). WebRTC cannot traverse NAT
without one. There is no TURN server, so calls fail behind symmetric NAT.

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

## §5 features

All eleven sections are implemented. Notes below cover only where the build differs
from the spec or extends it.

- **5.1 Auth & onboarding** — plus a first-run setup wizard, a separate administrator
  sign-in, and admin-issued password reset codes (see "Beyond the spec").
- **5.2 Spaces & chat** — plus student-created spaces, custom roles, channel
  management, message pinning, and real voice.
- **5.3 Major communities** — unchanged. Majors can now be added from the dashboard,
  which creates the community Space and its six channels with them.
- **5.4 Clubs** — unchanged.
- **5.5 Course hub** — unchanged.
- **5.6 Study & buddy matching** — unchanged.
- **5.7 Events** — unchanged.
- **5.8 Campus utility** — marketplace listings now have a creation form and optional
  photos (up to four).
- **5.9 Karma & badges** — unchanged.
- **5.10 Moderation** — plus an append-only audit log and account suspension.
- **5.11 Search & notifications** — unchanged.

---

## Beyond the spec

Eleven additions on top of `CLAUDE.md`, requested after the port.

1. **Student-created spaces.** `spaces.create`, gated on an instance setting. Types
   are limited to CLUB / INTEREST / GENERAL — MAJOR and COURSE spaces come from the
   catalogue, and a second "CS 2210" would split the conversation the catalogue
   exists to gather. Capped at five owned interest spaces per student.
2. **Profile pictures.** Convex file storage, 10 MB, image types whitelisted. The
   resolved URL is denormalised onto the user document because avatars are read on
   every message row.
3. **Space management.** Owners get channel CRUD, member ranks, removal, nicknames,
   ownership transfer, and custom roles with eight permissions.
   `manageRoles` is deliberately **not** grantable by a role — a role that can edit
   roles can grant itself everything, which makes every other restriction
   decorative. See `convex/lib/permissions.ts`.
4. **Voice.** WebRTC full mesh, Convex as the signalling channel only. Audio is peer
   to peer and never touches the backend. Capped at 8 per room, because mesh
   upstream bandwidth grows linearly per participant and past that the honest answer
   is an SFU, which does not exist here. Works in voice channels and in DMs.
5. **Marketplace photos.** Optional, up to four, uploaded as picked rather than on
   submit so a slow connection blocks the picker and not the form.
6. **First-run setup.** A deployment with no `instanceConfig` row renders a
   three-step wizard and nothing else. It creates the campus and its first
   administrator in one transaction. **`config.initialize` is unauthenticated** —
   it has to be, since there is nobody to authenticate against yet — and is guarded
   only by the absence of that row. A fresh deployment left reachable and unclaimed
   can be taken by whoever arrives first. Same trade as any self-hosted installer.
7. **Administrator sign-in.** Small text under the student form. Same credentials,
   different door: it refuses non-admin accounts rather than silently signing them
   into the student app. Not a second factor — the note in the brief about possibly
   adding PKI later is where that would go.
8. **Theme.** Retargeted from Discord to Teams/Apple: light default, neutral grey
   surfaces instead of blue-black, `#5B5FC7` accent, looser display tracking,
   softer corners, shadow-defined cards. One token table in `client/src/index.css`.
9. **Pinned messages.** Per channel, side panel, 50 cap. Requires the `pinMessages`
   permission, which MOD and above hold and a custom role can grant to anyone.
10. **Admin dashboard.** shadcn sidebar-block shape — collapsible labelled rail,
    tenant header, sticky breadcrumb. Six sections: overview, activity log, members,
    spaces, majors, settings. Two capabilities are withheld on purpose:
    - **No password field.** Admins mint a single-use reset code; the student sets
      their own password. An admin who can set a password can be that person, and
      the log would show only "password changed".
    - **No avatar replacement, only removal.** Removal is moderation; replacement is
      impersonation.
      Admins can also draft a Space for a club with no student running it yet. It
      stays invisible until an owner is assigned — an ownerless space students can
      wander into is a dead room.
11. **Terms of service and privacy policy.** Written against `convex/schema.ts`
    rather than from a template, and they name the tables. Four disclosures a
    generic policy would omit: anonymous posts are pseudonymous and admins can
    unmask them; voice exposes IP addresses between callers; the deployment is on a
    third-party cloud; deletion anonymises rather than erases. **Not lawyer
    reviewed**, and the pages say so at the top.

---

## Earlier deviations, still standing

1. **The word filter ships with an empty `blocked` list.** §5.10 wants slurs
   hard-blocked. The mechanism exists; the list is empty because shipping a slur
   list in the repo is worse than leaving it configurable.
2. **~77 course reviews instead of §6's 30.** Sampling 30 of 40 courses left the
   rest with dead gauges — including CS 2210, the spec's own example. Every course
   now gets at least one.
3. **16 events instead of §6's 14, a third `CAMPUS`-hosted.** With every event hosted
   by a club, a student whose clubs are not hosting saw an empty week strip. Two are
   anchored to today and tomorrow so it is populated whichever day the seed runs.
4. **Study groups' auto-created group DM is not linked from the group card.** The
   conversation is created; the UI path to it is missing.

---

## Known gaps

- **Nothing in this change set has been run against a live deployment.** See
  "Verification" below. This is the largest gap and it is not a small one.
- **Voice needs TURN for reliability.** STUN-only fails behind symmetric NAT.
- **Mute and kick are recorded but not enforced** at the message-send path.
- **Course Hub resource tab has no in-page upload form** — resources list and vote,
  but uploading goes through the generic path.
- **Client test coverage is thin.** Five tests, all on the Markdown renderer. §8 asks
  for a component test per feature; none of the eleven additions has one, and the
  server suite that covered the anonymity guarantee did not survive the port.
- **The anonymity regression test is gone.** §8 explicitly requires a test proving
  `authorId` never leaves the backend for anonymous messages. The guarantee is still
  structurally enforced in `convex/lib/serialize.ts` — it is the only path from
  document to wire — but nothing asserts it any more.

---

## Verification

What was actually checked, and what was not.

**Passing:**

```
npx eslint .                       clean
npx prettier --check .             clean
npx tsc -p client/tsconfig.json    0 errors
npm run build                      154 modules, bundles
npm test                           5 passed
esbuild parse of all 25 convex modules   clean
```

**Not checked, and why.** `convex/_generated/` is produced by `npx convex dev`,
which needs an authenticated Convex login through a browser. Without it:

- The client typecheck above ran against a **loose local stub** of the generated
  API, so React and TypeScript errors were caught but **Convex argument and return
  types were not verified**. Expect type errors on the first real `convex dev`.
- No Convex function has been executed. The schema has not been applied.
- Only screens that make no queries could be rendered: the design system and the
  setup wizard were verified visually in both themes. Everything else stops at a
  loading state.

The deployment named in `.env.local` responds but reports
`Could not find public function for 'auth:me'`, i.e. these functions are not on it
yet.

**Next person to run this should expect:** first-run type errors from the generated
API, and a schema push that may conflict with whatever documents that deployment
already holds.
