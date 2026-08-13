"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // keep in sync with convex/files.ts
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
export const ACCEPT_ATTR = ACCEPTED_IMAGE_TYPES.join(",");

export type PendingImage = {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
};

export type UploadedImage = {
  imageId: Id<"_storage">;
  imageWidth: number;
  imageHeight: number;
};

function readDimensions(objectUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    const img = new Image();
    // Dimensions are cosmetic (they reserve layout space), so a failed decode
    // falls back to zeros rather than blocking the attachment.
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = objectUrl;
  });
}

// Holds one image the user has attached but not sent yet. The file is only
// uploaded when they actually send, so cancelling never leaves orphaned bytes
// in Convex storage.
export function useImageUpload() {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const [pending, setPending] = useState<PendingImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Object URLs have to be revoked or the blob leaks for the page's lifetime.
  const previewRef = useRef<string | null>(null);
  const revoke = useCallback(() => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
  }, []);
  useEffect(() => revoke, [revoke]);

  const attach = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      setError(null);

      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        setError("Only PNG, JPEG, GIF and WebP images can be attached.");
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError("Images have to be 5 MB or smaller.");
        return;
      }

      revoke();
      const previewUrl = URL.createObjectURL(file);
      previewRef.current = previewUrl;
      const { width, height } = await readDimensions(previewUrl);
      setPending({ file, previewUrl, width, height });
    },
    [revoke],
  );

  const clear = useCallback(() => {
    revoke();
    setPending(null);
    setError(null);
  }, [revoke]);

  // Uploads the attachment and returns the fields to pass to the mutation.
  // Returns null when nothing is attached, so callers can spread it either way.
  const upload = useCallback(
    async (userId: Id<"users">): Promise<UploadedImage | null> => {
      if (!pending) return null;
      setUploading(true);
      try {
        const uploadUrl = await generateUploadUrl({ userId });
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": pending.file.type },
          body: pending.file,
        });
        if (!res.ok) throw new Error("Upload failed");
        const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
        return {
          imageId: storageId,
          imageWidth: pending.width,
          imageHeight: pending.height,
        };
      } finally {
        setUploading(false);
      }
    },
    [generateUploadUrl, pending],
  );

  // Pulls an image out of a paste or drop event, if there is one.
  const attachFromTransfer = useCallback(
    (items: DataTransfer | null) => {
      const file = Array.from(items?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) return false;
      attach(file);
      return true;
    },
    [attach],
  );

  return { pending, uploading, error, setError, attach, attachFromTransfer, clear, upload };
}
