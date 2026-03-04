'use client';

import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { Field } from '@/components/forms';

interface UploadInput {
  filename: string;
  mimeType: string;
  storageKey: string;
  sizeBytes: number;
}

interface AttachmentUploaderProps {
  disabled?: boolean;
  onUpload: (payload: UploadInput) => Promise<void>;
}

export function AttachmentUploader({ disabled = false, onUpload }: AttachmentUploaderProps) {
  const [filename, setFilename] = useState('');
  const [mimeType, setMimeType] = useState('');
  const [storageKey, setStorageKey] = useState('');
  const [sizeBytes, setSizeBytes] = useState('');
  const [uploading, setUploading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedSize = Number(sizeBytes);
    if (!Number.isInteger(parsedSize) || parsedSize <= 0) {
      return;
    }
    setUploading(true);
    try {
      await onUpload({
        filename,
        mimeType,
        storageKey,
        sizeBytes: parsedSize,
      });
      setFilename('');
      setMimeType('');
      setStorageKey('');
      setSizeBytes('');
    } finally {
      setUploading(false);
    }
  }

  function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setMimeType(file.type || 'application/octet-stream');
    setSizeBytes(String(file.size));
    if (!storageKey) {
      const normalizedName = file.name.toLowerCase().replace(/\s+/g, '-');
      setStorageKey(`tickets/manual/${Date.now()}-${normalizedName}`);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <Field label="Pick Local File (metadata helper)">
        <Input type="file" onChange={handleFileSelection} disabled={disabled || uploading} />
      </Field>
      <Field label="Filename">
        <Input
          value={filename}
          onChange={(event) => setFilename(event.target.value)}
          disabled={disabled || uploading}
          required
        />
      </Field>
      <Field label="MIME Type">
        <Input
          value={mimeType}
          onChange={(event) => setMimeType(event.target.value)}
          disabled={disabled || uploading}
          required
        />
      </Field>
      <Field label="Storage Key">
        <Input
          value={storageKey}
          onChange={(event) => setStorageKey(event.target.value)}
          disabled={disabled || uploading}
          required
        />
      </Field>
      <Field label="Size (bytes)">
        <Input
          type="number"
          min={1}
          step={1}
          value={sizeBytes}
          onChange={(event) => setSizeBytes(event.target.value)}
          disabled={disabled || uploading}
          required
        />
      </Field>
      <Button type="submit" disabled={disabled || uploading}>
        {uploading ? 'Uploading...' : 'Upload Attachment Metadata'}
      </Button>
    </form>
  );
}
