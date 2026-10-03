import type { ProjectRole } from '@/modules/identity/domain/types';
import type { TicketStatus } from './tickets';

export interface ProjectRequestConfig {
  leadTimeEnforcementEnabled: boolean;
  leadTimeDays: number;
  maxAttachmentsPerTicket: number | null;
}

export interface ProjectRequestConfigResponse {
  config: ProjectRequestConfig;
}

export interface LocalNotificationPreviewRecord {
  id: string;
  ticketId: string | null;
  ticketNumber: string | null;
  recipientUserId: string;
  recipientName: string | null;
  recipientEmail: string;
  eventType: string;
  deliveryState: 'QUEUED' | 'CAPTURED' | 'SENT' | 'FAILED';
  attemptCount: number;
  subject: string;
  body: string;
  createdAt: string;
  deliveredAt: string | null;
  lastError: string | null;
}

export interface LocalNotificationPreviewResponse {
  messages: LocalNotificationPreviewRecord[];
}

export interface AmeliaMetricsRecord {
  openTotal: number;
  openByAreaStatus: Array<{ areaId: string; areaName: string; status: TicketStatus; count: number }>;
  approvedWithoutInstrumentMan: number;
  overdueNeedBy: number;
  completedTotal: number;
  averageSubmissionToCompletionHours: number | null;
}

export interface AmeliaMetricsResponse {
  metrics: AmeliaMetricsRecord;
}

export interface ProjectMemberRecord {
  userId: string;
  name: string;
  email: string;
  role: string;
}

export interface ProjectMembersResponse {
  members: ProjectMemberRecord[];
}

export interface ProjectCompanyAccessResponse {
  companies: Array<{ id: string; name: string }>;
  requesters: Array<{
    userId: string;
    name: string;
    email: string;
    companyId: string;
    companyName: string;
    authorityGrantId: string | null;
  }>;
  pendingInvites: Array<{
    id: string;
    email: string;
    companyId: string;
    companyName: string;
    expiresAt: string;
  }>;
}

export interface ProjectMembershipRecord {
  id: string;
  name: string;
  status: 'SETUP' | 'ACTIVE' | 'ARCHIVED';
  role: ProjectRole;
  canAdminister?: boolean;
}

export interface ProjectListResponse {
  projects: ProjectMembershipRecord[];
}
