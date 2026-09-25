import type { ProjectRole } from '@/modules/identity/domain/types';

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
  ticketId: string;
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
  openByAreaStatus: Array<{ areaId: string; areaName: string; status: string; count: number }>;
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

export interface ProjectMembershipRecord {
  id: string;
  name: string;
  status: 'ACTIVE';
  role: ProjectRole;
}

export interface ProjectListResponse {
  projects: ProjectMembershipRecord[];
}
