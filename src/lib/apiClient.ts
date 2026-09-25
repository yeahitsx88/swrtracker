import type {
  AttachmentResponse,
  AttachmentsListResponse,
  AorTreeResponse,
  AuthResponse,
  CreateTicketRequest,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  InviteValidationResponse,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  ResetPasswordResponse,
  TicketListResponse,
  TicketHistoryResponse,
  TicketResponse,
  UploadAttachmentRequest,
  UpdateRequesterTicketRequest,
} from '@/lib/contracts';
import type {
  AmeliaMetricsResponse,
  LocalNotificationPreviewResponse,
  ProjectRequestConfig,
  ProjectRequestConfigResponse,
  ProjectMembersResponse,
  ProjectCompanyAccessResponse,
  ProjectListResponse,
} from '@/lib/contracts/projects';
import { ApiClientError, isApiErrorPayload } from '@/lib/errors';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  headers?: Record<string, string>;
}

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    query.set(key, String(value));
  }
  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function createIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  return `idemp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = {
    ...(options.body && !options.formData ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers ?? {}),
  };
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: options.formData ?? (options.body ? JSON.stringify(options.body) : undefined),
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    if (isApiErrorPayload(payload)) {
      throw new ApiClientError(
        payload.error.type,
        payload.error.message,
        response.status,
        payload.error.code,
        payload.error.correlationId,
      );
    }
    if (typeof payload === 'string' && payload.trim()) {
      throw new ApiClientError('InternalError', payload.trim(), response.status);
    }
    throw new ApiClientError('InternalError', `Request failed with status ${response.status}`, response.status);
  }

  return payload as T;
}

export const apiClient = {
  login(input: LoginRequest): Promise<AuthResponse> {
    return apiRequest<AuthResponse>('/api/auth/login', { method: 'POST', body: input });
  },

  register(input: RegisterRequest): Promise<AuthResponse> {
    return apiRequest<AuthResponse>('/api/auth/register', { method: 'POST', body: input });
  },

  forgotPassword(input: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
    return apiRequest<ForgotPasswordResponse>('/api/auth/forgot-password', { method: 'POST', body: input });
  },

  resetPassword(input: ResetPasswordRequest): Promise<ResetPasswordResponse> {
    return apiRequest<ResetPasswordResponse>('/api/auth/reset-password', { method: 'POST', body: input });
  },

  logout(): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>('/api/auth/logout', { method: 'POST' });
  },

  validateInvite(token: string): Promise<InviteValidationResponse> {
    return apiRequest<InviteValidationResponse>(`/api/auth/invite/${token}`);
  },

  listProjects(): Promise<ProjectListResponse> {
    return apiRequest<ProjectListResponse>('/api/projects');
  },

  listTickets(projectId: string, limit = 20, offset = 0): Promise<TicketListResponse> {
    return apiRequest<TicketListResponse>(
      withQuery('/api/tickets', { projectId, limit, offset }),
    );
  },

  listProjectMembers(projectId: string): Promise<ProjectMembersResponse> {
    return apiRequest<ProjectMembersResponse>(`/api/projects/${projectId}/members`);
  },

  getProjectCompanyAccess(projectId: string): Promise<ProjectCompanyAccessResponse> {
    return apiRequest<ProjectCompanyAccessResponse>(`/api/projects/${projectId}/company-authority`);
  },

  createRequesterInvite(projectId: string, input: { companyId: string; email: string }): Promise<{ inviteToken: string }> {
    return apiRequest<{ inviteToken: string }>(`/api/projects/${projectId}/invites`, {
      method: 'POST', body: input,
    });
  },

  grantCompanyAuthority(projectId: string, userId: string): Promise<{ grant: { id: string } }> {
    return apiRequest<{ grant: { id: string } }>(`/api/projects/${projectId}/company-authority`, {
      method: 'POST', body: { userId },
    });
  },

  revokeCompanyAuthority(projectId: string, grantId: string): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/api/projects/${projectId}/company-authority/${grantId}`, {
      method: 'DELETE',
    });
  },

  getTicket(ticketId: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}`);
  },

  getTicketHistory(ticketId: string): Promise<TicketHistoryResponse> {
    return apiRequest<TicketHistoryResponse>(`/api/tickets/${ticketId}/history`);
  },

  updateRequesterTicket(ticketId: string, input: UpdateRequesterTicketRequest): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}`, {
      method: 'PATCH',
      body: input,
      headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  createTicket(input: CreateTicketRequest): Promise<TicketResponse> {
    return apiRequest<TicketResponse>('/api/tickets', {
      method: 'POST',
      body: input,
      headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  createFollowUpTicket(ticketId: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/follow-up`, {
      method: 'POST',
      headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  submitTicket(ticketId: string, departmentId?: string, urgentReason?: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/submit`, {
      method: 'POST',
      body: { ...(departmentId ? { departmentId } : {}), ...(urgentReason ? { urgentReason } : {}) },
      headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  approveTicket(ticketId: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/approve`, {
      method: 'POST', headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  assignTicket(ticketId: string, assignedPartyChiefId: string | null, assignedInstrumentManId: string | null): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/assign`, {
      method: 'POST', body: { assignedPartyChiefId, assignedInstrumentManId },
      headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  surveyCancel(ticketId: string, reason: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/survey-cancel`, {
      method: 'POST', body: { reason }, headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  startTicket(ticketId: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/start`, {
      method: 'POST', headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  completeTicket(ticketId: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/complete`, {
      method: 'POST', headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  delayTicket(ticketId: string, reason: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/delay`, {
      method: 'POST',
      body: { reason },
      headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  requestFieldCancel(ticketId: string, reason?: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/field-cancel`, {
      method: 'POST',
      body: reason ? { reason } : {},
      headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  restartDelayedTicket(ticketId: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/restart-delay`, {
      method: 'POST', headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  approvePcStatus(ticketId: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/pc-approve`, { method: 'POST' });
  },

  rejectPcStatus(ticketId: string, reason?: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/pc-reject`, {
      method: 'POST',
      body: reason ? { reason } : {},
    });
  },

  requesterCancel(ticketId: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/requester-cancel`, {
      method: 'POST',
      headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  returnForCorrection(ticketId: string, reason: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/return`, {
      method: 'POST', body: { reason }, headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  reportFieldInability(ticketId: string, reason: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/field-inability`, {
      method: 'POST', body: { reason }, headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  validateFieldInability(ticketId: string, reason: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/field-inability/validate`, {
      method: 'POST', body: { reason }, headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  rejectFieldInability(ticketId: string, reason: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/field-inability/reject`, {
      method: 'POST', body: { reason }, headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  reviseNeedBy(ticketId: string, requestedDate: string, reason: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/need-by`, {
      method: 'POST', body: { requestedDate, reason }, headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  revisePriority(ticketId: string, priority: 'NORMAL' | 'HIGH', reason: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/priority`, {
      method: 'POST', body: { priority, reason }, headers: { 'Idempotency-Key': createIdempotencyKey() },
    });
  },

  listAorTree(projectId: string): Promise<AorTreeResponse> {
    return apiRequest<AorTreeResponse>(`/api/projects/${projectId}/aor`);
  },

  getProjectRequestConfig(projectId: string): Promise<ProjectRequestConfigResponse> {
    return apiRequest<ProjectRequestConfigResponse>(`/api/projects/${projectId}/request-config`);
  },

  updateProjectRequestConfig(projectId: string, input: ProjectRequestConfig): Promise<ProjectRequestConfigResponse> {
    return apiRequest<ProjectRequestConfigResponse>(`/api/projects/${projectId}/request-config`, {
      method: 'PATCH',
      body: input,
    });
  },

  getProjectMetrics(projectId: string): Promise<AmeliaMetricsResponse> {
    return apiRequest<AmeliaMetricsResponse>(`/api/projects/${projectId}/metrics`);
  },

  listLocalNotificationPreviews(projectId: string): Promise<LocalNotificationPreviewResponse> {
    return apiRequest<LocalNotificationPreviewResponse>(`/api/projects/${projectId}/notifications`);
  },

  operateLocalNotificationPreview(projectId: string, action: 'capture' | 'retry-failed'): Promise<{ updatedCount: number }> {
    return apiRequest<{ updatedCount: number }>(`/api/projects/${projectId}/notifications`, {
      method: 'POST', body: { action },
    });
  },

  listAttachments(ticketId: string): Promise<AttachmentsListResponse> {
    return apiRequest<AttachmentsListResponse>(`/api/tickets/${ticketId}/attachments`);
  },

  uploadAttachment(ticketId: string, input: UploadAttachmentRequest): Promise<AttachmentResponse> {
    const formData = new FormData();
    formData.set('file', input.file);
    formData.set('purpose', input.purpose);
    return apiRequest<AttachmentResponse>(`/api/tickets/${ticketId}/attachments`, {
      method: 'POST',
      formData,
    });
  },
};
