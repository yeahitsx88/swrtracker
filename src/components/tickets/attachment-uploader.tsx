'use client';

import { useRef, useState } from 'react';
import { Button, ErrorBanner } from '@/components/ui';
import { ApiClientError, getErrorMessage } from '@/lib/errors';
import { createIdempotencyKey } from '@/lib/apiClient';
import { CommandOwner, FrozenCommand } from '@/lib/frozen-command';
import { Field } from '@/components/forms';
import type { UploadAttachmentRequest } from '@/lib/contracts';

interface AttachmentUploaderProps {
  disabled?: boolean;
  instructionMode?: boolean;
  staging?: boolean;
  owner?: CommandOwner;
  onLockedChange?: (locked: boolean) => void;
  onReload?: () => Promise<void>;
  onReloaded?: () => void;
  onUpload: (payload: UploadAttachmentRequest) => Promise<void>;
}

export function AttachmentUploader({ disabled = false, instructionMode = false, staging = false, owner, onLockedChange, onReload, onReloaded, onUpload }: AttachmentUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [purpose, setPurpose] = useState<UploadAttachmentRequest['purpose']>(
    instructionMode ? 'REQUEST_INSTRUCTION' : 'FIELD_SUPPORT',
  );
  const [uploading, setUploading] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const retryKey = useRef<string | null>(null);
  const attempt = useRef(new FrozenCommand<{purpose: UploadAttachmentRequest['purpose']}>());
  // File is an immutable Blob; retain its bytes beside the JSON command.
  const frozenFile = useRef<File | null>(null);
  const command = attempt.current;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy.current || disabled || (!staging && command.stale)) return;
    if (!staging && owner && !owner.claim('attachment-upload')) return;
    if (!staging && !command.command) frozenFile.current = file;
    const frozen = staging ? null : command.begin({purpose: instructionMode ? 'REQUEST_INSTRUCTION' : purpose}, createIdempotencyKey());
    if (!staging && !frozen) return;
    busy.current = true; setUploading(true); setError(null);
    if (!staging) onLockedChange?.(true);
    try {
      if (staging) retryKey.current ??= createIdempotencyKey();
      await onUpload(staging
        ? {file, purpose: instructionMode ? 'REQUEST_INSTRUCTION' : purpose, retryKey: retryKey.current!}
        : {file: frozenFile.current!, purpose: frozen!.body.purpose, retryKey: frozen!.key});
      command.success(); frozenFile.current = null;
      setFile(null); retryKey.current = null;
      setInputKey((value) => value + 1);
    } catch (err) {
      if (!staging) command.fail(err instanceof ApiClientError ? err.status : undefined);
      if (!command.locked) frozenFile.current = null;
      const recovery = command.stale ? 'Reload the request before selecting a file or uploading again.'
        : command.locked ? 'The result is unconfirmed. Retry the unchanged upload.'
        : 'Your file is still selected. Correct the problem and try again.';
      setError(`${getErrorMessage(err, 'Unable to upload this file.')} ${recovery}`);
    } finally {
      busy.current = false; setUploading(false);
      if (!staging) {
        onLockedChange?.(command.locked);
        if (!command.locked) owner?.release('attachment-upload');
      }
    }
  }

  async function reload() {
    if (busy.current || !command.stale || !onReload) return;
    busy.current = true; setUploading(true); setError(null);
    try {
      await onReload();
      command.reload(); frozenFile.current = null; retryKey.current = null;
      setFile(null); setInputKey(value => value + 1);
      owner?.release('attachment-upload'); onLockedChange?.(false);
      onReloaded?.();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to reload the request. Retry reload before selecting a new file.'));
    } finally { busy.current = false; setUploading(false); }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      {error ? <ErrorBanner message={error} /> : null}
      <Field label="File">
        <input
          key={inputKey}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.txt,.csv,.doc,.docx,.xls,.xlsx"
          onChange={(event) => { if (command.locked) return; setFile(event.target.files?.[0] ?? null); retryKey.current = null; setError(null); }}
          disabled={disabled || uploading || command.locked}
          required
        />
      </Field>
      <Field label="File Purpose">
        <select
          value={instructionMode ? 'REQUEST_INSTRUCTION' : purpose}
          onChange={(event) => { if (command.locked) return; setPurpose(event.target.value as UploadAttachmentRequest['purpose']); retryKey.current = null; }}
          disabled={disabled || uploading || command.locked || instructionMode}
        >
          <option value="REQUEST_INSTRUCTION">Request instruction</option>
          <option value="FIELD_SUPPORT">Field support or evidence</option>
        </select>
      </Field>
      <p className="muted">PDF, JPEG, PNG, text, CSV, Word, and Excel files up to 30 MB.</p>
      <Button type="submit" disabled={disabled || uploading || !file || command.stale}>
        {uploading ? staging ? 'Adding…' : 'Uploading…' : staging ? 'Add File' : command.command && !command.stale ? 'Retry unchanged upload' : error ? 'Retry Upload' : 'Upload File'}
      </Button>
      {command.stale ? <p role="status">Reload replaces unsaved request changes with the saved request and clears this file selection. Review the current request before choosing a file again.</p> : null}
      {command.stale && onReload ? <Button type="button" variant="secondary" disabled={uploading} onClick={() => void reload()}>Reload request for upload</Button> : null}
    </form>
  );
}
