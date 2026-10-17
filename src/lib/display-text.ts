/** Internal record ids (UUIDs) mean nothing to operators; drop them, with any surrounding parentheses. */
export function withoutRecordIds(text: string): string {
  return text
    .replace(/\bTicket [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12} not found\b/gi, 'This request was not found')
    .replace(/\s*\(?\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b\)?/gi, '');
}
