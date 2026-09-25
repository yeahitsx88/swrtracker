'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { Field } from '@/components/forms';
import type { UploadAttachmentRequest } from '@/lib/contracts';

interface AttachmentUploaderProps {
  disabled?: boolean;
  instructionMode?: boolean;
  onUpload: (payload: UploadAttachmentRequest) => Promise<void>;
}

export function AttachmentUploader({ disabled = false, instructionMode = false, onUpload }: AttachmentUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [purpose, setPurpose] = useState<UploadAttachmentRequest['purpose']>(
    instructionMode ? 'REQUEST_INSTRUCTION' : 'FIELD_SUPPORT',
  );
  const [uploading, setUploading] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      await onUpload({ file, purpose: instructionMode ? 'REQUEST_INSTRUCTION' : purpose });
      setFile(null);
      setInputKey((value) => value + 1);
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <Field label="File">
        <input
          key={inputKey}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.txt,.csv,.doc,.docx,.xls,.xlsx"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          disabled={disabled || uploading}
          required
        />
      </Field>
      <Field label="File Purpose">
        <select
          value={instructionMode ? 'REQUEST_INSTRUCTION' : purpose}
          onChange={(event) => setPurpose(event.target.value as UploadAttachmentRequest['purpose'])}
          disabled={disabled || uploading || instructionMode}
        >
          <option value="REQUEST_INSTRUCTION">Request instruction</option>
          <option value="FIELD_SUPPORT">Field support or evidence</option>
        </select>
      </Field>
      <p className="muted">PDF, JPEG, PNG, text, CSV, Word, and Excel files up to 30 MB.</p>
      <Button type="submit" disabled={disabled || uploading || !file}>
        {uploading ? 'Uploading...' : 'Upload File'}
      </Button>
    </form>
  );
}
