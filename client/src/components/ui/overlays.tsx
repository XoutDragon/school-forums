import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { IconClose } from '@/components/Icons';

/**
 * Overlay primitives: dialog, select, switch, image picker.
 *
 * Hand-rolled rather than pulled from a component library, for the same reason the
 * rest of the app is: this is one codebase with about a dozen call sites, and the
 * cost of a dependency that owns focus management is higher than the cost of the
 * forty lines that do it here.
 */

// ── Dialog ─────────────────────────────────────────────────────────────────

/**
 * Modal dialog.
 *
 * Portalled to the body so a dialog opened from inside a scrolling pane is not
 * clipped by it. Focus moves in on open and returns to the trigger on close, and
 * Escape closes — the three things a dialog has to get right and the three that
 * hand-rolled ones usually miss.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    // The page behind a modal must not scroll, or the dialog floats over a moving
    // background when someone spins the wheel.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, select, button, [tabindex]:not([tabindex="-1"])',
      );
      target?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      returnFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative z-10 flex max-h-[88dvh] w-full flex-col rounded-t-2xl border border-edge bg-panel shadow-pop animate-rise-in sm:rounded-2xl',
          widths[width],
        )}
      >
        <header className="flex items-start gap-4 border-b border-edge px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-display-md text-chalk">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm leading-relaxed text-dim">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-dim transition hover:bg-raised hover:text-chalk"
          >
            <IconClose />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-edge px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Destructive confirmation. Typing nothing; one deliberate click is enough, but
 *  the copy has to name what disappears. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Delete',
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel?: string;
  busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-dim">{body}</p>
    </Dialog>
  );
}

// ── Select ─────────────────────────────────────────────────────────────────

/** A native select, styled. Native because it is keyboard- and screen-reader-correct
 *  for free, and on mobile it opens the platform picker people already know. */
export function Select({
  value,
  onChange,
  options,
  className,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-10 w-full appearance-none rounded-lg border border-field-edge bg-field px-3 pr-8 text-sm text-chalk',
        'transition hover:border-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='none' stroke='%238D8D8D' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' d='M1 1.5 6 6.5 11 1.5'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.75rem center',
      }}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

// ── Switch ─────────────────────────────────────────────────────────────────

/** The iOS/Teams toggle. A real checkbox underneath, so it announces correctly and
 *  works in a form. */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 py-1.5',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={cn(
            'block h-5 w-9 rounded-full border transition-colors',
            checked ? 'border-accent bg-accent' : 'border-field-edge bg-field',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-panel',
          )}
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-chalk">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-relaxed text-dim">{hint}</span>}
      </span>
    </label>
  );
}

// ── Image picker ───────────────────────────────────────────────────────────

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Client-side guard before an upload URL is even requested.
 *
 * The size limit is the brief's 10 MB. The type list is a whitelist rather than a
 * blacklist, because "not an executable" is not a property you can check by
 * extension.
 */
export function validateImage(file: File): string | null {
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.type)) return 'Pick a PNG, JPEG, WebP or GIF.';
  if (file.size > MAX_UPLOAD_BYTES) return 'That file is over 10 MB. Try a smaller one.';
  return null;
}

/**
 * Image picker with a local preview.
 *
 * The preview is an object URL of the chosen file, shown immediately — waiting for
 * a round trip to find out whether you picked the right photo is the part of every
 * avatar uploader that feels broken.
 */
export function ImagePicker({
  onPick,
  preview,
  shape = 'circle',
  label = 'Choose a picture',
  size = 88,
  disabled,
}: {
  onPick: (file: File) => void;
  preview?: string | null;
  shape?: 'circle' | 'square';
  label?: string;
  size?: number;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    },
    [localPreview],
  );

  const shown = localPreview ?? preview ?? null;

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'group relative grid shrink-0 place-items-center overflow-hidden border border-dashed border-edge bg-raised transition hover:border-accent disabled:opacity-50',
          shape === 'circle' ? 'rounded-full' : 'rounded-xl',
        )}
        style={{ width: size, height: size }}
      >
        {shown ? (
          <img src={shown} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="px-2 text-center text-[0.625rem] leading-tight text-faint">
            No picture
          </span>
        )}
        <span className="absolute inset-0 hidden place-items-center bg-black/50 text-[0.6875rem] font-medium text-white group-hover:grid">
          Change
        </span>
      </button>

      <div className="min-w-0">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {label}
        </Button>
        <p className="mt-1.5 text-xs text-faint">PNG, JPEG, WebP or GIF. Up to 10 MB.</p>
        {error && <p className="mt-1 text-xs text-events">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;

          const problem = validateImage(file);
          setError(problem);
          if (problem) return;

          if (localPreview) URL.revokeObjectURL(localPreview);
          setLocalPreview(URL.createObjectURL(file));
          onPick(file);
        }}
      />
    </div>
  );
}
