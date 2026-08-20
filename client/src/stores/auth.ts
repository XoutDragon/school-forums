import { create } from 'zustand';
import { convex, setSessionToken } from '@/lib/convex';
import { api } from '@/lib/convexApi';

/**
 * Auth state.
 *
 * The Express build restored a session by calling /auth/me and relied on an
 * httpOnly cookie. Here the token lives in localStorage and `useMe()` subscribes
 * reactively, so this store only holds what a component tree needs synchronously —
 * mostly the sign-in and sign-out actions.
 */

export interface MeUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  pronouns: string | null;
  year: string | null;
  karma: number;
  major: { id: string; name: string } | null;
  isOnline?: boolean;
  email: string;
  bio: string | null;
  settings: {
    theme: 'dark' | 'light';
    dmPrivacy: 'EVERYONE' | 'SHARED_SPACE_ONLY' | 'NOBODY';
    discoverable: boolean;
    showCourses: boolean;
    showRealName: boolean;
  };
  onboardedAt: number | null;
  isAdmin: boolean;
}

interface AuthState {
  /** Bumped on sign-in/out so subscribed queries re-read the new token. */
  epoch: number;
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    username: string;
    displayName: string;
    password: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  epoch: 0,

  async signIn(email, password) {
    const result = await convex.mutation(api.auth.login, { email, password });
    setSessionToken(result.token);
    set({ epoch: get().epoch + 1 });
  },

  async register(input) {
    const result = await convex.mutation(api.auth.register, input);
    setSessionToken(result.token);
    set({ epoch: get().epoch + 1 });
  },

  async signOut() {
    await convex.mutation(api.auth.logout, {}).catch(() => undefined);
    setSessionToken(null);
    set({ epoch: get().epoch + 1 });
  },
}));
