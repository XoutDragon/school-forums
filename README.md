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
