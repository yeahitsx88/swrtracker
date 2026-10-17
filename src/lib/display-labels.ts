/**
 * Display vocabulary for the interface. Presentation only: these maps never
 * change stored values, filters or permissions; they decide how codes read.
 */
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { TicketPriority, TicketStatus, TicketType } from './contracts/tickets';

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  LAYOUT: 'Layout',
  CHECK_OUT: 'Check-out',
  AS_BUILT: 'As-built',
  TOPO: 'Topographic',
  PERMIT: 'Permit',
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  HIGH: 'High',
  MED_HIGH: 'Medium-high',
  MEDIUM: 'Medium',
  NORMAL: 'Normal',
};

export const ROLE_LABELS: Record<ProjectRole, string> = {
  REQUESTER: 'Requester',
  SURVEY_MANAGER: 'Survey Manager',
  SURVEY_SUPERINTENDENT: 'Survey Superintendent',
  PARTY_CHIEF: 'Party Chief',
  INSTRUMENT_MAN: 'Instrument Man',
  PROJECT_ADMIN: 'Project Admin',
  CAD_LEAD: 'CAD Lead',
  CAD_TECHNICIAN: 'CAD Technician',
  DEPARTMENT_MANAGER: 'Department Manager',
  DEPARTMENT_LEAD: 'Department Lead',
  VIEWER: 'Viewer',
  AREA_VIEWER: 'Area Viewer',
  SUBCONTRACTS_COORDINATOR: 'Subcontracts Coordinator',
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  SETUP: 'Setup',
  ACTIVE: 'Active',
  ARCHIVED: 'Archived',
};

/** Readable label for any code we may not have mapped (e.g. imported values). */
export function humanizeCode(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

export function ticketTypeLabel(type: string | null | undefined): string {
  if (!type) return 'Type not selected';
  return TICKET_TYPE_LABELS[type as TicketType] ?? humanizeCode(type);
}

export function priorityLabel(priority: string | null | undefined): string {
  if (!priority) return 'Normal';
  return PRIORITY_LABELS[priority as TicketPriority] ?? humanizeCode(priority);
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as ProjectRole] ?? humanizeCode(role);
}

/**
 * One semantic tone per status, shared by badges, legends and charts.
 * Red is reserved for genuine exceptions; amber means someone must act.
 */
export type StatusTone = 'neutral' | 'review' | 'attention' | 'planned' | 'active' | 'success' | 'danger' | 'closed';

export const STATUS_TONES: Record<TicketStatus, StatusTone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'review',
  RETURNED_FOR_CORRECTION: 'attention',
  PENDING_FIELD_VALIDATION: 'attention',
  PENDING_PC_APPROVAL: 'attention',
  DELAYED: 'attention',
  APPROVED: 'planned',
  ASSIGNED: 'planned',
  IN_PROGRESS: 'active',
  COMPLETED: 'success',
  REJECTED: 'danger',
  FIELD_CANCELED: 'closed',
  SURVEY_CANCELED: 'closed',
  REQUESTER_CANCELED: 'closed',
};

export function statusTone(status: string): StatusTone {
  return STATUS_TONES[status as TicketStatus] ?? 'neutral';
}

/**
 * Fixed chart colour per status so a status keeps its colour on every chart.
 * Values come from the existing palette and its documented state colours.
 */
export const STATUS_CHART_COLORS: Record<TicketStatus, string> = {
  DRAFT: '#c8d2dc',
  SUBMITTED: '#81909d',
  RETURNED_FOR_CORRECTION: '#ffa500',
  PENDING_FIELD_VALIDATION: '#b06a11',
  PENDING_PC_APPROVAL: '#b06a11',
  DELAYED: '#7f4e04',
  APPROVED: '#9fc0dc',
  ASSIGNED: '#4682b4',
  IN_PROGRESS: '#315f85',
  COMPLETED: '#0f7b52',
  REJECTED: '#b23833',
  FIELD_CANCELED: '#58636e',
  SURVEY_CANCELED: '#58636e',
  REQUESTER_CANCELED: '#58636e',
};

const SERIES_COLORS = ['#315f85', '#4682b4', '#9fc0dc', '#58636e', '#81909d', '#7f4e04'];

/** Status keys keep their fixed colour; any other grouping uses the series palette by position. */
export function chartColor(key: string, index: number): string {
  return STATUS_CHART_COLORS[key as TicketStatus] ?? SERIES_COLORS[index % SERIES_COLORS.length]!;
}

const OPEN_STATUSES = new Set<TicketStatus>([
  'SUBMITTED', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'DELAYED', 'PENDING_FIELD_VALIDATION',
  'PENDING_PC_APPROVAL', 'RETURNED_FOR_CORRECTION',
]);

/** Display cue only: an open request whose calendar Need-By is before today (UTC calendar date). */
export function isPastNeedBy(status: string, requestedDate: string | null | undefined, today = new Date()): boolean {
  if (!requestedDate || !OPEN_STATUSES.has(status as TicketStatus)) return false;
  return requestedDate.slice(0, 10) < today.toISOString().slice(0, 10);
}

export function initials(name: string | null | undefined): string {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  return `${parts[0]![0] ?? ''}${parts.length > 1 ? parts.at(-1)![0] ?? '' : ''}`.toUpperCase();
}
