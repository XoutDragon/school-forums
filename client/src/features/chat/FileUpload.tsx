import { useRef, useState } from 'react';
import { IconImage, IconClose, IconSpinner } from '@/components/Icons';
import { api } from '@/lib/convexApi';
import { useM } from '@/lib/convexHooks';

export interface Attachment {
  storageId?: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface FileUploadProps {
  onAttachmentsChange: (attachments: Attachment[]) => void;
  attachments: Attachment[];
  disabled?: boolean;
}

export function FileUploadButton({ onAttachmentsChange, attachments, disabled }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useM(api.resources.generateUploadUrl);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      const newAttachments: Attachment[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files.item(i);
        if (!file) continue;

        console.log(`Uploading file: ${file.name} (${file.size} bytes)`);

        // Step 0: Generate preview for images
        let previewUrl = '';
        if (file.type.startsWith('image/')) {
          previewUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve(reader.result as string);
            };
            reader.readAsDataURL(file);
          });
        }

        // Step 1: Get upload URL from Convex
        const uploadUrl = await generateUploadUrl({});
        console.log('Got upload URL:', uploadUrl);

        // Step 2: Upload file to Convex storage
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        });

        console.log('Upload response status:', uploadResponse.status);

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${uploadResponse.statusText}`);
        }

        const responseData = (await uploadResponse.json()) as { storageId: string };
        const storageId = responseData.storageId;
        console.log('Got storage ID:', storageId);

        newAttachments.push({
          storageId,
          url: previewUrl || '', // Use preview URL for images, empty string otherwise
          name: file.name,
          mimeType: file.type,
          size: file.size,
        });
      }

      onAttachmentsChange([...attachments, ...newAttachments]);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('File upload error:', msg);
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={(e) => void handleFileSelect(e.target.files)}
        disabled={disabled || uploading}
        className="hidden"
      />

      {uploading ? (
        <IconSpinner className="h-5 w-5 shrink-0 text-dim" />
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className="flex items-center justify-center text-dim transition hover:text-chalk disabled:opacity-50"
          aria-label="Attach image"
          title={error ? `Upload error: ${error}` : 'Attach image'}
        >
          <IconImage className="h-5 w-5 shrink-0" />
        </button>
      )}
      {error && <span className="text-xs text-events">{error}</span>}
    </>
  );
}

export function FileUpload({ onAttachmentsChange, attachments, disabled }: FileUploadProps) {
  return (
    <>
      {attachments.length > 0 && (
        <div className="space-y-2">
          {/* Image previews grid */}
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment, index) =>
              attachment.mimeType.startsWith('image/') && attachment.url ? (
                <div key={index} className="relative inline-block">
                  <img
                    src={attachment.url}
                    alt={attachment.name}
                    className="max-h-32 rounded-lg border border-edge object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onAttachmentsChange(
                        attachments.filter((_: Attachment, i: number) => i !== index),
                      )
                    }
                    className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white transition hover:bg-black/70"
                    aria-label={`Remove ${attachment.name}`}
                  >
                    <IconClose className="h-4 w-4" />
                  </button>
                </div>
              ) : null,
            )}
          </div>

          {/* File list */}
          <div className="rounded-lg border border-edge bg-raised/50 p-2">
            <div className="space-y-1">
              {attachments.map((attachment, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {attachment.mimeType.startsWith('image/') && (
                        <span className="shrink-0 text-sm">🖼️</span>
                      )}
                      <span className="truncate text-xs text-chalk">{attachment.name}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onAttachmentsChange(
                        attachments.filter((_: Attachment, i: number) => i !== index),
                      )
                    }
                    className="flex-shrink-0 text-faint transition hover:text-dim"
                    aria-label={`Remove ${attachment.name}`}
                  >
                    <IconClose className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <FileUploadButton
        attachments={attachments}
        onAttachmentsChange={onAttachmentsChange}
        disabled={disabled}
      />
    </>
  );
}
