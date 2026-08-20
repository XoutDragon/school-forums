import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface UiState {
  theme: Theme;
  paletteOpen: boolean;
  memberListOpen: boolean;
  /** Admin dashboard rail, remembered between visits. */
  adminSidebarOpen: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setPaletteOpen: (open: boolean) => void;
  toggleMemberList: () => void;
  toggleAdminSidebar: () => void;
}

/**
 * Light is the default now (see the note at the top of index.css), so the class on
 * the root element marks dark rather than light. That is also what Tailwind's
 * `darkMode: 'class'` expects, which is one fewer thing to hold in your head.
 */
function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem('cc-theme', theme);
  } catch {
    // Private browsing — the theme just won't persist. Not worth surfacing.
  }
}

const stored: Theme = (() => {
  try {
    const saved = localStorage.getItem('cc-theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* fall through to the system preference */
  }
  // No stored choice: follow the OS, the way both reference products do.
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
})();

applyTheme(stored);

const storedSidebar = (() => {
  try {
    return localStorage.getItem('cc-admin-rail') !== 'closed';
  } catch {
    return true;
  }
})();

export const useUi = create<UiState>((set, get) => ({
  theme: stored,
  paletteOpen: false,
  memberListOpen: true,
  adminSidebarOpen: storedSidebar,

  toggleTheme() {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    set({ theme: next });
  },

  setTheme(theme) {
    applyTheme(theme);
    set({ theme });
  },

  setPaletteOpen(paletteOpen) {
    set({ paletteOpen });
  },

  toggleMemberList() {
    set({ memberListOpen: !get().memberListOpen });
  },

  toggleAdminSidebar() {
    const next = !get().adminSidebarOpen;
    try {
      localStorage.setItem('cc-admin-rail', next ? 'open' : 'closed');
    } catch {
      /* not worth surfacing */
    }
    set({ adminSidebarOpen: next });
  },
}));
