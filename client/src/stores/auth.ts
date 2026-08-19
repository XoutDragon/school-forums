import { create } from 'zustand';
import type { MeUser } from '@campusconnect/shared';
import { api } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';

interface AuthState {
  user: MeUser | null;
  status: 'loading' | 'authed' | 'anon';
  restore: () => Promise<void>;
  setUser: (user: MeUser) => void;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'loading',

  async restore() {
    try {
      const user = await api.get<MeUser>('/auth/me');
      set({ user, status: 'authed' });
    } catch {
      set({ user: null, status: 'anon' });
    }
  },

  setUser(user) {
    set({ user, status: 'authed' });
  },

  async logout() {
    await api.post('/auth/logout').catch(() => undefined);
    disconnectSocket();
    set({ user: null, status: 'anon' });
  },
}));
