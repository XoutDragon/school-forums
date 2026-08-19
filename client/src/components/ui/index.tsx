import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn, hueFor, initials } from '@/lib/utils';

// ── Button ─────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-lift active:translate-y-px',
  secondary: 'border border-edge bg-raised text-chalk hover:border-faint/60 hover:bg-raised/70',
  ghost: 'text-dim hover:bg-raised hover:text-chalk',
  danger: 'border border-events/40 bg-events/10 text-events hover:bg-events/20',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-[0.9375rem]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled ?? loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
});

// ── Inputs ─────────────────────────────────────────────────────────────────

const FIELD =
  'w-full rounded-lg border border-edge bg-raised px-3 py-2 text-sm text-chalk ' +
  'placeholder:text-faint transition focus:border-accent/60 focus:outline-none ' +
  'focus:ring-2 focus:ring-accent/25 disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(FIELD, 'h-10', className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(FIELD, 'resize-none', className)} {...props} />;
});

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-chalk">{label}</span>
      {children}
      {/* An error replaces the hint rather than stacking under it — one line does one job. */}
      {error ? (
        <span className="block text-xs text-events">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-faint">{hint}</span>
      ) : null}
    </label>
  );
}

// ── Surfaces ───────────────────────────────────────────────────────────────

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card p-4', className)} {...props}>
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('eyebrow', className)}>{children}</p>;
}

/** The utility face doing its job: course codes, terms, counts. */
export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('code-chip', className)}>{children}</span>;
}

const TONES = {
  neutral: 'border-edge bg-raised text-dim',
  accent: 'border-accent/30 bg-accent/10 text-accent-lift',
  clubs: 'border-clubs/30 bg-clubs/10 text-clubs',
  courses: 'border-courses/30 bg-courses/10 text-courses',
  events: 'border-events/30 bg-events/10 text-events',
} as const;

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.6875rem] font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Avatar ─────────────────────────────────────────────────────────────────

export function Avatar({
  name,
  src,
  size = 32,
  seed,
  online,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  seed?: string;
  online?: boolean;
  className?: string;
}) {
  const hue = hueFor(seed ?? name);
  return (
    <span
      className={cn('relative inline-flex shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="h-full w-full rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          aria-hidden
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white/90"
          style={{
            background: `linear-gradient(140deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 50% 30%))`,
            fontSize: Math.max(10, size * 0.38),
          }}
        >
          {initials(name)}
        </span>
      )}
      {online !== undefined && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-panel',
            online ? 'bg-courses' : 'bg-faint',
          )}
          style={{ width: Math.max(8, size * 0.3), height: Math.max(8, size * 0.3) }}
        />
      )}
    </span>
  );
}

// ── Loading + empty ────────────────────────────────────────────────────────

/** Skeletons, not spinners, for lists (§7). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-raised', className)} />;
}

export function SkeletonList({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card flex items-center gap-3 p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Every empty list gets a designed state with an action (§7). The copy names what to do,
 *  not what is missing. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-edge bg-panel/40 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-2xl opacity-70">{icon}</div>}
      <h3 className="font-display text-display-md text-chalk">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-dim">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-events/30 bg-events/[0.06] p-5">
      <p className="text-sm text-chalk">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-0.5 overflow-x-auto border-b border-edge no-scrollbar">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition',
              active ? 'text-chalk' : 'text-dim hover:text-chalk',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 font-mono text-xs text-faint">{tab.count}</span>
            )}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
            )}
          </button>
        );
      })}
    </div>
  );
}
