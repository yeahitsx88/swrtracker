'use client';

import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from './api';

interface Attachment { id: string; filename: string; sizeBytes: number; createdAt: string }
interface AttachmentPage {
  data: Attachment[]; total: number; canUpload: boolean; maxUploadBytes: number;
}

export function Attachments({ ticketId, disabled = false, onBusyChange }: {
  ticketId?: string; disabled?: boolean; onBusyChange?: (busy: boolean) => void;
}) {
  const [page, setPage] = useState<AttachmentPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!ticketId) return;
    let current = true; setPage(null); setFile(null); setError('');
    api<AttachmentPage>(`/api/tickets/${ticketId}/attachments?limit=20&offset=${offset}`)
      .then(result => { if (current) setPage(result); })
      .catch(cause => { if (current) setError(errorMessage(cause)); });
    return () => { current = false; };
  }, [ticketId, offset, revision]);

  async function upload() {
    if (!file || !ticketId || !page || disabled || inFlight.current) return;
    setError(''); setMessage('');
    if (file.size < 1 || file.size > page.maxUploadBytes) {
      setError(`Choose a non-empty file up to ${page.maxUploadBytes / 1024 / 1024} MiB.`); return;
    }
    inFlight.current = true; setUploading(true); onBusyChange?.(true);
    try {
      await api(`/api/tickets/${ticketId}/attachments`, {
        method: 'POST', body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream',
          'x-file-name-utf8': encodeURIComponent(file.name) },
      });
      setMessage(`${file.name} uploaded.`); setFile(null);
      if (input.current) input.current.value = '';
      setOffset(0); setRevision(value => value + 1);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { inFlight.current = false; setUploading(false); onBusyChange?.(false); }
  }

  async function download(attachment: Attachment) {
    setDownloading(attachment.id); setError('');
    try {
      const response = await fetch(`/api/tickets/${ticketId}/attachments/${attachment.id}`,
        { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error?.message ?? 'The file could not be downloaded.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = attachment.filename;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setDownloading(null); }
  }

  return <section className="panel" aria-label="Attachments"><h2>Attachments</h2>
    {!ticketId ? <p className="muted">Choose Save Draft to add drawings, photos, or other reference files before submitting.</p> : <>
      {message && <p className="notice" role="status">{message}</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      {!page && !error && <p role="status">Loading attachments…</p>}
      {page && <>
        {page.canUpload ? <div>
          <label className="field">Add a file<input ref={input} type="file" disabled={disabled || uploading}
            onChange={event => { setFile(event.target.files?.[0] ?? null); setError(''); setMessage(''); }} />
            <small>Up to {page.maxUploadBytes / 1024 / 1024} MiB per file. Uploads are saved immediately.</small></label>
          <button type="button" className="secondary" disabled={!file || disabled || uploading} onClick={() => void upload()}>
            {uploading ? 'Uploading…' : 'Upload file'}</button>
        </div> : <p className="muted">Attachments are available to download. Uploading is not available for this request.</p>}
        {!page.data.length && <p className="muted" style={{ marginTop: 20 }}>No files attached.</p>}
        {page.data.map(attachment => <article className="record" key={attachment.id}>
          <p><strong>{attachment.filename}</strong></p>
          <p className="muted">{Math.max(1, Math.ceil(attachment.sizeBytes / 1024)).toLocaleString()} KB · {new Date(attachment.createdAt).toLocaleString()}</p>
          <button type="button" className="secondary" disabled={downloading !== null}
            aria-label={`Download ${attachment.filename}`} onClick={() => void download(attachment)}>
            {downloading === attachment.id ? 'Downloading…' : 'Download'}</button>
        </article>)}
        {page.total > 20 && <div className="actions">
          <button type="button" className="secondary" disabled={offset === 0 || uploading} onClick={() => setOffset(value => value - 20)}>Previous files</button>
          <span>{offset + 1}–{Math.min(offset + 20, page.total)} of {page.total}</span>
          <button type="button" className="secondary" disabled={offset + 20 >= page.total || uploading} onClick={() => setOffset(value => value + 20)}>Next files</button>
        </div>}
      </>}
      <button type="button" className="nav-button" disabled={uploading} onClick={() => setRevision(value => value + 1)}>Refresh files</button>
    </>}
  </section>;
}
