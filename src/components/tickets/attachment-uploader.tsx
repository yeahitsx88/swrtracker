'use client';

import { useRef, useState } from 'react';
import { Button, ErrorBanner } from '@/components/ui';
import { getErrorMessage } from '@/lib/errors';
import { createIdempotencyKey } from '@/lib/apiClient';
import { Field } from '@/components/forms';
import type { UploadAttachmentRequest } from '@/lib/contracts';

interface AttachmentUploaderProps {
  disabled?: boolean;
  instructionMode?: boolean;
  staging?: boolean;
  onUpload: (payload: UploadAttachmentRequest) => Promise<void>;
}

export function AttachmentUploader({ disabled = false, instructionMode = false, staging = false, onUpload }: AttachmentUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [purpose, setPurpose] = useState<UploadAttachmentRequest['purpose']>(
    instructionMode ? 'REQUEST_INSTRUCTION' : 'FIELD_SUPPORT',
  );
  const [uploading, setUploading] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const retryKey = useRef<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy.current) return;
    busy.current = true; setUploading(true); setError(null);
    try {
      retryKey.current ??= createIdempotencyKey();
      await onUpload({ file, purpose: instructionMode ? 'REQUEST_INSTRUCTION' : purpose, retryKey: retryKey.current });
      setFile(null);
      retryKey.current = null;
      setInputKey((value) => value + 1);
    } catch (err) {
      setError(`${getErrorMessage(err, 'Unable to upload this file.')} Your file is still selected. Retry or choose a different file.`);
    } finally {
      busy.current = false; setUploading(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      {error ? <ErrorBanner message={error} /> : null}
      <Field label="File">
        <input
          key={inputKey}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.txt,.csv,.doc,.docx,.xls,.xlsx"
          onChange={(event) => { setFile(event.target.files?.[0] ?? null); retryKey.current = null; setError(null); }}
          disabled={disabled || uploading}
          required
        />
      </Field>
      <Field label="File Purpose">
        <select
          value={instructionMode ? 'REQUEST_INSTRUCTION' : purpose}
          onChange={(event) => { setPurpose(event.target.value as UploadAttachmentRequest['purpose']); retryKey.current = null; }}
          disabled={disabled || uploading || instructionMode}
        >
          <option value="REQUEST_INSTRUCTION">Request instruction</option>
          <option value="FIELD_SUPPORT">Field support or evidence</option>
        </select>
      </Field>
      <p className="muted">PDF, JPEG, PNG, text, CSV, Word, and Excel files up to 30 MB.</p>
      <Button type="submit" disabled={disabled || uploading || !file}>
        {uploading ? staging ? 'Adding…' : 'Uploading…' : staging ? 'Add File' : error ? 'Retry Upload' : 'Upload File'}
      </Button>
    </form>
  );
}
