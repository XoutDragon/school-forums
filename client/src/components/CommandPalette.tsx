import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useUi } from '@/stores/ui';
import { IconSearch } from '@/components/Icons';
import { api } from '@/lib/convexApi';
import { useQ } from '@/lib/convexHooks';

interface Hit {
  kind: string;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  badge: string | null;
}

const SCOPES = [
  { id: 'all', label: 'Everything' },
  { id: 'courses', label: 'Courses' },
  { id: 'clubs', label: 'Clubs' },
  { id: 'people', label: 'People' },
  { id: 'spaces', label: 'Spaces' },
  { id: 'resources', label: 'Resources' },
  { id: 'events', label: 'Events' },
] as const;

const KIND_TONE: Record<string, string> = {
  course: 'text-courses',
  club: 'text-clubs',
  event: 'text-events',
  person: 'text-accent-lift',
  space: 'text-dim',
  resource: 'text-dim',
};

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useUi();
  const [term, setTerm] = useState('');
  const [scope, setScope] = useState<(typeof SCOPES)[number]['id']>('all');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const debounced = useDebounced(term, 180);

  const data = useQ<Record<string, Hit[]>>(
    api.search.search,
    debounced.trim() ? { q: debounced, scope, limit: 8 } : 'skip',
  );
  const isFetching = data === undefined && debounced.trim().length > 0;

  // One flat list drives keyboard navigation; the grouping is presentational only.
  const flat = useMemo(() => Object.values(data ?? {}).flat(), [data]);

  useEffect(() => {
    if (paletteOpen) {
      setTerm('');
      setCursor(0);
      // Focus after the dialog paints, or the caret lands nowhere.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [paletteOpen]);

  useEffect(() => setCursor(0), [debounced, scope]);

  if (!paletteOpen) return null;

  const go = (hit: Hit) => {
    setPaletteOpen(false);
    navigate(hit.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return setPaletteOpen(false);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, flat.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const i = SCOPES.findIndex((s) => s.id === scope);
      setScope(SCOPES[(i + (e.shiftKey ? SCOPES.length - 1 : 1)) % SCOPES.length]!.id);
    }
    if (e.key === 'Enter' && flat[cursor]) {
      e.preventDefault();
      go(flat[cursor]!);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/70 px-4 pt-[12vh] backdrop-blur-sm animate-fade-in"
      onClick={() => setPaletteOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search CampusConnect"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-edge bg-panel shadow-2xl animate-rise-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-edge px-4">
          <IconSearch className="h-4 w-4 shrink-0 text-faint" />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search courses, clubs, people, events…"
            className="h-14 flex-1 bg-transparent text-[0.9375rem] text-chalk outline-none placeholder:text-faint"
          />
          <kbd className="hidden rounded border border-edge px-1.5 py-0.5 font-mono text-[0.625rem] text-faint sm:block">
            Esc
          </kbd>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-edge px-3 py-2 no-scrollbar">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              className={cn(
                'shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition',
                scope === s.id ? 'bg-accent/15 text-accent-lift' : 'text-dim hover:bg-raised',
              )}
            >
              {s.label}
            </button>
          ))}
          <span className="ml-auto hidden shrink-0 items-center gap-1 pr-1 font-mono text-[0.625rem] text-faint sm:flex">
            Tab to switch
          </span>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {!debounced.trim() ? (
            <p className="px-3 py-8 text-center text-sm text-faint">
              Start typing. Course codes work — try “CS 22”.
            </p>
          ) : flat.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-dim">
              {isFetching ? 'Searching…' : `Nothing matches “${debounced}”.`}
            </p>
          ) : (
            flat.map((hit, i) => (
              <button
                key={`${hit.kind}-${hit.id}`}
                onClick={() => go(hit)}
                onMouseEnter={() => setCursor(i)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition',
                  i === cursor ? 'bg-raised' : 'hover:bg-raised/60',
                )}
              >
                <span
                  className={cn(
                    'w-16 shrink-0 font-mono text-eyebrow uppercase',
                    KIND_TONE[hit.kind] ?? 'text-faint',
                  )}
                >
                  {hit.kind}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-chalk">{hit.title}</span>
                  {hit.subtitle && (
                    <span className="block truncate text-xs text-dim">{hit.subtitle}</span>
                  )}
                </span>
                {hit.badge && (
                  <span className="shrink-0 font-mono text-[0.625rem] text-faint">{hit.badge}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
