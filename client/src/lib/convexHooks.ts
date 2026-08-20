import { useCallback } from 'react';
import { useMutation as useConvexMutation, useQuery as useConvexQuery } from 'convex/react';
import type { FunctionReference } from 'convex/server';
import { getSessionToken } from '@/lib/convex';

/**
 * Thin wrappers that inject the session token.
 *
 * Every Convex function that needs identity takes a `token` argument, because
 * Convex has no cookie jar (see convex/lib/auth.ts). Threading that through every
 * call site by hand would be noise, so these do it once.
 *
 * `useQ` returns `undefined` while loading — that is Convex's convention, and it
 * is deliberately distinct from `null`, which a query may return as real data.
 */

// The generated `api` object is typed, but wrapping it generically needs a loose
// signature here. Call sites keep full type inference from the `api.x.y` reference.
/* eslint-disable @typescript-eslint/no-explicit-any -- generic passthrough over the
   generated api surface; concrete types are preserved at each call site. */

export function useQ<T = any>(
  fn: FunctionReference<'query'>,
  args: Record<string, any> | 'skip' = {},
): T | undefined {
  const token = getSessionToken();
  return useConvexQuery(fn as any, args === 'skip' ? 'skip' : { token, ...args }) as T | undefined;
}

/** Same, for queries that are meaningful without a session (the catalog, mostly). */
export function usePublicQ<T = any>(
  fn: FunctionReference<'query'>,
  args: Record<string, any> | 'skip' = {},
): T | undefined {
  return useConvexQuery(fn as any, args as any) as T | undefined;
}

export function useM(fn: FunctionReference<'mutation'>) {
  const run = useConvexMutation(fn as any);
  return useCallback(
    (args: Record<string, any> = {}) => run({ token: getSessionToken(), ...args } as any),
    [run],
  );
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/** Convex returns `undefined` while a query is in flight. */
export const isLoading = (value: unknown): boolean => value === undefined;
