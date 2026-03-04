import type { AttachmentRecord } from '@/lib/contracts';

interface AttachmentListProps {
  attachments: AttachmentRecord[];
}

export function AttachmentList({ attachments }: AttachmentListProps) {
  if (attachments.length === 0) {
    return <p className="muted">No attachments uploaded.</p>;
  }

  return (
    <div className="ticket-grid">
      {attachments.map((attachment) => (
        <article key={attachment.id} className="ticket-card">
          <p className="ticket-headline">{attachment.filename}</p>
          <p className="muted">{attachment.mimeType}</p>
          <p className="muted">Size: {attachment.sizeBytes.toLocaleString()} bytes</p>
          <p className="muted">Storage Key: {attachment.storageKey}</p>
          <p className="muted">Uploaded: {new Date(attachment.createdAt).toLocaleString()}</p>
        </article>
      ))}
    </div>
  );
}
