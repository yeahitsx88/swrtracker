import { ValidationError } from '@/shared/errors';

/** Browser headers cannot carry arbitrary Unicode. Existing raw-name clients remain valid. */
export function attachmentFilename(headers: Headers): string {
  const encoded = headers.get('x-file-name-utf8');
  if (encoded !== null) {
    try { return decodeURIComponent(encoded); }
    catch { throw new ValidationError('Invalid UTF-8 filename encoding'); }
  }
  const filename = headers.get('x-file-name');
  if (!filename) throw new ValidationError('A filename is required');
  return filename;
}
