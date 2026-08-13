"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ImagePlus, X } from "lucide-react";
import { ACCEPT_ATTR, PendingImage } from "@/lib/useImageUpload";

// Paperclip-style button that opens a file picker. The input is hidden and
// reset after each pick so choosing the same file twice still fires onChange.
export function AttachImageButton({
  onFile,
  disabled,
  label = "Attach an image",
}: {
  onFile: (file: File | undefined) => void;
  disabled?: boolean;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        title={label}
        onClick={() => inputRef.current?.click()}
        className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
      >
        <ImagePlus className="w-4 h-4" />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        hidden
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );
}

// Thumbnail of the not-yet-sent attachment, with a remove button.
export function PendingImagePreview({
  pending,
  uploading,
  onRemove,
}: {
  pending: PendingImage;
  uploading?: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="relative inline-block">
      {/* Local object URL, so next/image would only get in the way here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pending.previewUrl}
        alt={pending.file.name}
        className={clsx(
          "max-h-32 rounded-lg border border-border object-cover",
          uploading && "opacity-60",
        )}
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove image"
        className="absolute -top-1.5 -right-1.5 rounded-full bg-card border border-border p-0.5 text-muted-foreground hover:text-red-400"
      >
        <X className="w-3 h-3" />
      </button>
      {uploading && (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-foreground">
          Uploading...
        </span>
      )}
    </div>
  );
}

// A sent image. Click opens a lightbox; the intrinsic size (when the uploader
// recorded it) reserves space so the layout doesn't jump as it loads.
export function AttachedImage({
  url,
  width,
  height,
  alt = "Attached image",
  maxHeight = 340,
}: {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  maxHeight?: number;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Scale the intrinsic size down to maxHeight so tall images don't dominate.
  const scale = width && height ? Math.min(1, maxHeight / height) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 block max-w-full"
        style={
          scale && width && height
            ? { width: Math.round(width * scale), maxWidth: "100%" }
            : undefined
        }
      >
        {/* Convex storage URLs are remote and unconfigured for next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          width={width || undefined}
          height={height || undefined}
          className="rounded-lg border border-border max-w-full h-auto"
          style={{ maxHeight }}
          loading="lazy"
        />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={alt}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={alt}
            className="max-h-full max-w-full rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setOpen(false)}
            aria-label="Close image"
            className="absolute top-4 right-4 rounded-full bg-card/80 border border-border p-1.5 text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}
