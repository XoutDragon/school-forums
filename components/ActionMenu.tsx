"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import clsx from "clsx";

// Minimal click-to-open menu used by the topic header, channel rows and the
// member list. Hand-rolled (rather than the shadcn/base-ui menu) to match the
// plain-Tailwind style the rest of the topic UI is written in.
export default function ActionMenu({
  trigger,
  children,
  align = "right",
  label = "Open menu",
  className,
}: {
  trigger: ReactNode;
  // Rendered with a `close` callback so items can dismiss the menu themselves.
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className={clsx("relative", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center text-muted-foreground hover:text-foreground"
      >
        {trigger}
      </button>
      {open && (
        <div
          className={clsx(
            "absolute z-30 mt-1 min-w-44 rounded-lg border border-border bg-popover p-1 shadow-xl",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onClick,
  children,
  icon,
  danger,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs disabled:opacity-40",
        danger
          ? "text-red-400 hover:bg-red-500/10"
          : "text-foreground/90 hover:bg-secondary",
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-border" />;
}
