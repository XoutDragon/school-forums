# CampusConnect

A student-centred community platform for a single campus. Discord's real-time
structure, rebuilt around campus life: clubs, course knowledge, study groups, and
the people in them.

Seeded demo campus: **Lakeshore University**.

## Running it

```bash
npm install
cp .env.local.example .env.local
npx convex dev        # In one terminal: pushes schema, watches for changes
npm run dev           # In another: client (5173) + Convex backend
```

- Web app: http://localhost:5173

Every seeded account uses the password `password123`. The seed prints demo
credentials when it finishes; `admin@lakeshore.edu` is the campus admin.

Seed data via:
```bash
npm run convex:seed
```

## Commands

| Command             | Does                                   |
| ------------------- | -------------------------------------- |
| `npm run dev`       | Client (5173) + Convex backend together |
| `npm run convex:dev` | Convex schema + functions (watch mode) |
| `npm run convex:seed` | Populate Convex with Lakeshore data    |
| `npm test`          | Vitest for client tests                |
| `npm run lint`      | ESLint + Prettier check                |

## Stack

| Layer      | Choice                              |
| ---------- | ----------------------------------- |
| Frontend   | React 18 + TypeScript + Vite, Tailwind |
| State      | Zustand (client) + Convex subscriptions |
| Backend    | Convex (serverless functions)       |
| Database   | Convex DB (persisted JSON documents) |
| Auth       | PBKDF2-SHA512 + JWT session tokens  |
| Validation | Zod schemas (shared with backend)   |

npm workspaces: `client/`, `shared/`.

## Layout

```
shared/     Zod schemas + TypeScript types, imported by both
client/     React SPA with Vite
convex/     Convex backend functions, schema, seed script
```

## Notes

- **Local-only by design.** No Docker, Redis, Postgres, S3, or external APIs.
  The Convex local backend stores data in-memory during `convex dev`.
- **Session tokens in localStorage.** Convex doesn't support httpOnly cookies.
  See the note in `convex/lib/auth.ts` for security considerations.
- **Anonymous channels** show a deterministic per-user-per-channel animal alias.
  The author ID is stored server-side for moderation and never sent to clients.

See `CLAUDE.md` for the full product and feature specification.
