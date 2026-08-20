# CampusConnect

A student-centred community platform for a single campus. Discord's real-time
structure, rebuilt around campus life: clubs, course knowledge, study groups, and
the people in them.

Seeded demo campus: **Lakeshore University**.

## Running it

```bash
npm install
cp server/.env.example server/.env   # then set JWT_SECRET
npm run db:migrate
npm run db:seed
npm run dev
```

- Web app: http://localhost:5173
- API: http://localhost:3001

Every seeded account uses the password `password123`. The seed prints demo
credentials when it finishes; `admin@lakeshore.edu` is the campus admin.

## Commands

| Command             | Does                                      |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Client (5173) + API (3001) together       |
| `npm test`          | Vitest across server and client           |
| `npm run lint`      | ESLint + Prettier check                   |
| `npm run db:reset`  | Drop, re-migrate and re-seed the database |
| `npm run db:studio` | Prisma's table browser                    |

Run a single server test:

```bash
npm run test -w server -- --run src/routes/messages.test.ts -t "anonymous"
```

## Stack

| Layer      | Choice                                       |
| ---------- | -------------------------------------------- |
| Frontend   | React 18 + TypeScript + Vite, Tailwind       |
| State      | Zustand (client) + TanStack Query (server)   |
| Backend    | Node + Express + TypeScript                  |
| Real-time  | Socket.IO                                    |
| Database   | SQLite via Prisma                            |
| Search     | SQLite FTS5                                  |
| Validation | Zod schemas shared between client and server |

npm workspaces: `client/`, `server/`, `shared/`.

## Layout

```
shared/   Zod schemas + wire types, imported by both sides
server/   Express API, Socket.IO, Prisma, seed script
client/   React SPA
```

## Convex backend (in progress)

The Express/Prisma/SQLite backend under `server/` is complete and is what the app
currently runs on. A port to Convex is underway in `convex/`.

**Status:** schema covers all 40 models; auth, spaces/channels and messages are
ported. Courses, clubs, events, study groups, marketplace, moderation, search,
notifications and the seed are not yet — they still only exist in `server/`.

### Setting it up

```bash
cp .env.local.example .env.local
npx convex dev
```

`npx convex dev` prompts for a browser login, generates `convex/_generated/`, and
pushes the schema and functions to the deployment. Leave it running; it redeploys
on save.

`convex/_generated/` is gitignored — it is produced from the schema, so it is
created locally rather than committed.

The functions have not been typechecked against the generated types yet (those
types do not exist until the command above runs), so expect the first run to
report some type errors.

### Things that changed in the port

- **bcrypt → PBKDF2-SHA512** via Web Crypto. bcrypt is a native module and cannot
  run in Convex's V8 isolate. Password hashes from the SQLite database will not
  verify against this; migrated accounts need a reset.
- **httpOnly cookie → session token in localStorage.** Convex has no cookie jar.
  This is a real downgrade — an XSS becomes account takeover where it previously
  could not. The fix is Convex Auth or Clerk rather than anything hand-rolled.
  See the note in `convex/lib/auth.ts`.
- **Socket.IO removed.** Convex queries are reactive, so `messages.list` re-runs
  on every subscriber when the table changes. The socket server, its five event
  handlers and the client-side reducer are all gone.
- **Rate limits, presence and sessions became tables.** All three lived in process
  memory on Express; Convex has no long-lived process to hold them.

## Notes

- **Local-only by design.** No Docker, Redis, Postgres, S3, or external APIs.
  Uploads go to `server/uploads/`, the database is `server/dev.db`.
- **Anonymous channels** show a deterministic per-user-per-channel animal alias.
  The author ID is stored for moderation and never serialised to clients —
  there's a regression test for this in `server/src/routes/messages.test.ts`.
- **Full-text search** uses FTS5 virtual tables, which Prisma can't express.
  They're built by `server/prisma/fts.ts`, which `db:migrate` and `db:seed` both run.
- Rate limits and presence are in-process memory, so they assume a single
  server process.

See `CLAUDE.md` for the full product and feature specification.
