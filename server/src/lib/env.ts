import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().default('file:../dev.db'),
  // No default: a fallback secret in source is a fallback secret in every clone of
  // this repo, and anyone holding it can mint a session cookie for any account.
  JWT_SECRET: z.string().min(16).optional(),
  // Deliberately not `PORT`: that name is set by all sorts of parent processes, and
  // inheriting one silently makes the API try to bind the client's port.
  SERVER_PORT: z.coerce.number().int().default(3001),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
});

const parsed = envSchema.parse(process.env);

/** Local runs stay zero-setup (CLAUDE.md §2), but the throwaway secret is generated
 *  per process rather than shipped in the source, and production has to be explicit. */
function resolveJwtSecret(): string {
  if (parsed.JWT_SECRET) return parsed.JWT_SECRET;
  if (parsed.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET is required in production. Generate one with: ' +
        'node -e "console.log(require(`crypto`).randomBytes(32).toString(`hex`))"',
    );
  }
  // Random per boot: sessions do not survive a restart in dev, which is a fair
  // trade for never having a known secret in the repo.
  return randomBytes(32).toString('hex');
}

export const env = { ...parsed, JWT_SECRET: resolveJwtSecret() };
export const isTest = env.NODE_ENV === 'test';

/** Current academic term. Everything term-scoped reads this rather than hardcoding,
 *  so the seeded campus stays coherent as the calendar moves. */
export function currentTerm(now = new Date()): string {
  const month = now.getMonth(); // 0-indexed
  const year = now.getFullYear();
  if (month <= 3) return `${year}WI`;
  if (month <= 5) return `${year}SP`;
  if (month <= 7) return `${year}SU`;
  return `${year}FA`;
}
