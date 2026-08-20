import { ConvexReactClient } from 'convex/react';

/**
 * Convex client.
 *
 * `VITE_CONVEX_URL` mirrors the `NEXT_PUBLIC_CONVEX_URL` in .env.local — the value
 * is identical, but Vite only exposes variables prefixed with VITE_ to browser
 * code, so the NEXT_PUBLIC_ name is invisible here.
 */
const url = import.meta.env.VITE_CONVEX_URL as string | undefined;

if (!url) {
  throw new Error(
    'VITE_CONVEX_URL is not set. Copy it from .env.local, or run `npx convex dev` to create one.',
  );
}

export const convex = new ConvexReactClient(url);

/**
 * Session token.
 *
 * Convex has no cookie jar, so the httpOnly cookie the Express build used is
 * replaced by a token in localStorage that is passed as an argument to every
 * function needing identity. See the security note in convex/lib/auth.ts.
 */
const TOKEN_KEY = 'cc-session';

export function getSessionToken(): string | undefined {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function setSessionToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private browsing. The session simply will not persist across reloads.
  }
}
