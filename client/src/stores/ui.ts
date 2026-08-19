import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface UiState {
  theme: Theme;
  paletteOpen: boolean;
  memberListOpen: boolean;
  toggleTheme: () => void;
  setPaletteOpen: (open: boolean) => void;
  toggleMemberList: () => void;
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('light', theme === 'light');
  try {
    localStorage.setItem('cc-theme', theme);
  } catch {
    // Private browsing — the theme just won't persist. Not worth surfacing.
  }
}

const stored = (() => {
  try {
    return localStorage.getItem('cc-theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
})() satisfies Theme;

export const useUi = create<UiState>((set, get) => ({
  theme: stored,
  paletteOpen: false,
  memberListOpen: true,

  toggleTheme() {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    set({ theme: next });
  },

  setPaletteOpen(paletteOpen) {
    set({ paletteOpen });
  },

  toggleMemberList() {
    set({ memberListOpen: !get().memberListOpen });
  },
}));
