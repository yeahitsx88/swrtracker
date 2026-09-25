export type TicketType = 'LAYOUT' | 'CHECK_OUT' | 'AS_BUILT' | 'TOPO' | 'PERMIT';
export type WorkflowVariant = 'STANDARD_APPROVAL' | 'DIRECT_ASSIGNMENT';
export type TicketPriority = 'HIGH' | 'MED_HIGH' | 'MEDIUM' | 'NORMAL';
export type PendingPcOutcome = 'COMPLETED' | 'DELAYED' | 'FIELD_CANCELED' | null;

export type TicketStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'PENDING_FIELD_VALIDATION'
  | 'RETURNED_FOR_CORRECTION'
  | 'PENDING_PC_APPROVAL'
  | 'DELAYED'
  | 'COMPLETED'
  | 'REQUESTER_CANCELED'
  | 'FIELD_CANCELED'
  | 'SURVEY_CANCELED';

export interface TicketRecord {
  id: string;
  tenantId: string;
  projectId: string;
  aorNodeId: string;
  departmentId: string | null;
  companyId: string;
  ticketNumber: string | null;
  ticketType: TicketType;
  requesterId: string;
  assignedPartyChiefId: string | null;
  assignedInstrumentManId: string | null;
  surveyLeadId: string | null;
  workflowVariant: WorkflowVariant;
  status: TicketStatus;
  craft: string;
  fieldContact: string | null;
  fieldChannel: string | null;
  description: string;
  requestedDate: string;
  originalRequestedDate: string | null;
  firstSubmittedAt: string | null;
  returnCycle: number;
  fieldValidationReviewerId: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  pendingPcOutcome: PendingPcOutcome;
  pendingPcReason: string | null;
  surveyCancelRequestedBy: string | null;
  surveyCancelRequestedRole: string | null;
  surveyCancelReason: string | null;
  surveyCancelRequestedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  rejectionReason: string | null;
  parentTicketId: string | null;
  priority: TicketPriority;
  prioritySetBy: string | null;
  prioritySetReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketListResponse {
  data: TicketRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface TicketResponse {
  ticket: TicketRecord;
  capabilities?: TicketCapabilities;
}

export interface TicketCapabilities {
  canEditRequesterFields: boolean;
  canSubmit: boolean;
  canRequesterCancel: boolean;
  canCreateFollowUp: boolean;
  canUploadRequestInstruction: boolean;
  canUploadFieldSupport: boolean;
}

export interface CreateTicketRequest {
  projectId: string;
  aorNodeId: string;
  ticketType: TicketType;
  craft?: string;
  fieldContact: string;
  fieldChannel?: string;
  description: string;
  requestedDate: string;
  departmentId?: string;
  workflowVariant?: WorkflowVariant;
  requesterId?: string;
  assignedPartyChiefId?: string;
  assignedInstrumentManId?: string;
}

export interface UpdateRequesterTicketRequest {
  aorNodeId?: string;
  ticketType?: TicketType;
  craft?: string;
  fieldContact?: string;
  fieldChannel?: string;
  description?: string;
  requestedDate?: string;
}

export interface AttachmentRecord {
  id: string;
  ticketId: string;
  tenantId: string;
  uploadedBy: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  purpose: 'REQUEST_INSTRUCTION' | 'FIELD_SUPPORT';
  returnCycle: number;
  contentSha256: string;
  createdAt: string;
  downloadUrl: string;
}

export interface AttachmentResponse {
  attachment: AttachmentRecord;
}

export interface AttachmentsListResponse {
  attachments: AttachmentRecord[];
}

export interface UploadAttachmentRequest {
  file: File;
  purpose: 'REQUEST_INSTRUCTION' | 'FIELD_SUPPORT';
}

export type TicketHistorySource =
  | 'TICKET_EVENT'
  | 'RETURN_CYCLE'
  | 'ASSIGNMENT'
  | 'NEED_BY_REVISION'
  | 'ATTACHMENT'
  | 'NOTIFICATION';

export interface TicketHistoryItem {
  id: string;
  source: TicketHistorySource;
  type: string;
  occurredAt: string;
  actor: { id: string; name: string } | null;
  details: Record<string, unknown>;
}

export interface TicketHistoryResponse {
  history: TicketHistoryItem[];
}

export interface AorLevelRecord {
  id: string;
  depth: number;
  label: string;
}

export interface AorNodeRecord {
  id: string;
  levelId: string;
  parentId: string | null;
  name: string;
  code: string;
}

export interface AorTreeResponse {
  levels: AorLevelRecord[];
  nodes: AorNodeRecord[];
}

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Pending Review',
  APPROVED: 'Approved - Awaiting Assignment',
  REJECTED: 'Not Approved',
  ASSIGNED: 'Scheduled',
  IN_PROGRESS: 'In Progress',
  PENDING_PC_APPROVAL: 'Under Review by Survey Lead',
  PENDING_FIELD_VALIDATION: 'Field Report Review',
  RETURNED_FOR_CORRECTION: 'Returned for Correction',
  DELAYED: 'Delayed',
  COMPLETED: 'Completed',
  REQUESTER_CANCELED: 'Canceled by You',
  FIELD_CANCELED: 'Canceled - Field Conditions',
  SURVEY_CANCELED: 'Canceled by Survey Team',
};
