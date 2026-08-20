import { useRef, useState } from 'react';
import { IconImage, IconClose, IconSpinner } from '@/components/Icons';

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
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const newAttachments: Attachment[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files.item(i);
        if (!file) continue;

        // For now, create a data URL for preview
        // In production, you'd upload to Convex storage and get a storage ID
        const reader = new FileReader();

        await new Promise<void>((resolve) => {
          reader.onload = () => {
            const dataUrl = reader.result as string;
            newAttachments.push({
              url: dataUrl,
              name: file.name,
              mimeType: file.type,
              size: file.size,
            });
            resolve();
          };
          reader.readAsDataURL(file);
        });
      }

      onAttachmentsChange([...attachments, ...newAttachments]);
      if (inputRef.current) inputRef.current.value = '';
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
        >
          <IconImage className="h-5 w-5 shrink-0" />
        </button>
      )}

    </>
  );
}

export function FileUpload({ onAttachmentsChange, attachments, disabled }: FileUploadProps) {
  return (
    <>
      {attachments.length > 0 && (
        <div className="rounded-lg border border-edge bg-raised/50 p-2">
          <div className="space-y-1">
            {attachments.map((attachment, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-2 rounded px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  {attachment.mimeType.startsWith('image/') && attachment.url.startsWith('data:') ? (
                    <div className="flex items-center gap-2">
                      <img
                        src={attachment.url}
                        alt={attachment.name}
                        className="h-8 w-8 rounded object-cover"
                      />
                      <span className="truncate text-xs text-chalk">{attachment.name}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-chalk">{attachment.name}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onAttachmentsChange(attachments.filter((_: Attachment, i: number) => i !== index))}
                  className="flex-shrink-0 text-faint transition hover:text-dim"
                  aria-label={`Remove ${attachment.name}`}
                >
                  <IconClose className="h-4 w-4" />
                </button>
              </div>
            ))}
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
