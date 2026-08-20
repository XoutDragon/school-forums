import { useCallback, useState } from 'react';
import { api } from '@/lib/convexApi';
import { useM } from '@/lib/convexHooks';

/**
 * Uploading a file to Convex storage.
 *
 * Three steps, and the middle one does not go through a Convex function at all:
 * the client POSTs the bytes straight to a short-lived URL, which is why a 10 MB
 * image does not have to be base64'd through a mutation argument.
 *
 * The returned storage id is then handed to whichever mutation owns the record —
 * `users.setAvatar`, `campus.createListing`, and so on. Uploading without that
 * second call leaves an orphaned blob, so every caller has to complete the pair.
 */
export function useUpload() {
  const generateUploadUrl = useM(api.files.generateUploadUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<string | null> => {
      setBusy(true);
      setError(null);
      try {
        const uploadUrl = (await generateUploadUrl({})) as string;
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        if (!response.ok) throw new Error(`Upload failed (${response.status})`);

        const { storageId } = (await response.json()) as { storageId: string };
        return storageId;
      } catch (err) {
        const raw = err instanceof Error ? err.message : 'Upload failed';
        // Convex throws "CODE: sentence"; show the sentence.
        const match = /(?:BAD_REQUEST|RATE_LIMITED|FORBIDDEN|UNAUTHORIZED): (.*)/.exec(raw);
        setError(match?.[1] ?? raw);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [generateUploadUrl],
  );

  return { upload, busy, error, clearError: () => setError(null) };
}

/** The same flow, before there is an account to authenticate — first-run setup only. */
export function useSetupUpload() {
  const generateUploadUrl = useM(api.files.generateSetupUploadUrl);
  const [busy, setBusy] = useState(false);

  const upload = useCallback(
    async (file: File): Promise<string | null> => {
      setBusy(true);
      try {
        const uploadUrl = (await generateUploadUrl({})) as string;
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        if (!response.ok) return null;
        const { storageId } = (await response.json()) as { storageId: string };
        return storageId;
      } catch {
        return null;
      } finally {
        setBusy(false);
      }
    },
    [generateUploadUrl],
  );

  return { upload, busy };
}
