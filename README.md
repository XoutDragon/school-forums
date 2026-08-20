# CampusConnect

A student-centred community platform for a single campus. Discord's real-time
structure, rebuilt around campus life: clubs, course knowledge, study groups, and
the people in them.

Seeded demo campus: **Lakeshore University**.

## Running it

```bash
npm install
cp .env.local.example .env.local
npx convex dev        # one terminal: authenticates, pushes schema, watches
npm run dev           # another: client on 5173
```

`npx convex dev` has to run first, and at least once interactively — it opens a
browser to authenticate and it is what writes `convex/_generated/`, which the client
imports. Nothing builds until it has.

- Web app: http://localhost:5173

**First visit on an empty deployment** shows a three-step setup wizard: name the
campus, list the email domains you accept, and create the first administrator
account. Whoever completes it owns the instance, so do not leave a fresh deployment
sitting on a public address unclaimed.

To skip that and get a populated demo campus instead:

```bash
npm run convex:seed
```

That seeds Lakeshore University, configures the instance, and prints credentials.
Every seeded account uses the password `password123`; `admin@lakeshore.edu` is the
campus administrator.

## Commands

| Command               | Does                                    |
| --------------------- | --------------------------------------- |
| `npm run dev`         | Client (5173) + Convex backend together |
| `npm run convex:dev`  | Convex schema + functions (watch mode)  |
| `npm run convex:seed` | Populate Convex with Lakeshore data     |
| `npm test`            | Vitest for client tests                 |
| `npm run lint`        | ESLint + Prettier check                 |

## Stack

| Layer      | Choice                                  |
| ---------- | --------------------------------------- |
| Frontend   | React 18 + TypeScript + Vite, Tailwind  |
| State      | Zustand (client) + Convex subscriptions |
| Backend    | Convex (serverless functions)           |
| Database   | Convex DB (persisted JSON documents)    |
| Auth       | PBKDF2-SHA512 + JWT session tokens      |
| Validation | Zod schemas (shared with backend)       |

npm workspaces: `client/`, `shared/`.

## Layout

```
shared/     Zod schemas + TypeScript types, imported by both
client/     React SPA with Vite
convex/     Convex backend functions, schema, seed script
```

## Notes

- **Not local-only.** `CLAUDE.md` §2 specified an offline SQLite build; this was
  ported to Convex, which is a hosted platform. Data lives with that provider, not
  on the machine running the client. `PROGRESS.md` records what that changed.
- **Session tokens in localStorage.** Convex function calls carry no cookies, so the
  httpOnly cookie became a token passed as an argument. That is a real downgrade —
  an XSS becomes account takeover. See the note in `convex/lib/auth.ts`.
- **Anonymous channels** show a deterministic per-user-per-channel animal alias.
  The author ID is stored server-side for moderation and never sent to clients —
  `convex/lib/serialize.ts` is the single path from document to wire, which is what
  makes that structural rather than a convention.
- **Voice is peer-to-peer.** Audio never touches the backend; Convex carries only
  the WebRTC handshake. It needs a STUN server to cross NAT (Google's by default,
  `VITE_STUN_URL` to change it) and has no TURN fallback, so calls fail behind
  symmetric NAT. Callers can see each other's IP addresses, which is inherent to
  peer-to-peer and is disclosed in the privacy policy.
- **Policies at `/terms` and `/privacy`** describe what this deployment actually
  stores, table by table. They have not been reviewed by a lawyer and say so.

See `CLAUDE.md` for the full product and feature specification.
