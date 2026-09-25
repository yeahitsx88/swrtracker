export interface RequestDraft {
  id: string;
  projectId: string;
  status: string;
  ticketNumber: string | null;
  aorNodeId: string | null;
  departmentId: string | null;
  ticketType: string | null;
  craft: string | null;
  description: string | null;
  requestedDate: string | null;
  draftLastSavedAt: string | null;
}

export function localDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
