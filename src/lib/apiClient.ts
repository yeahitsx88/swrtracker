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
  TicketResponse,
  UploadAttachmentRequest,
} from '@/lib/contracts';
import type { ProjectRequestConfig, ProjectRequestConfigResponse } from '@/lib/contracts/projects';
import { ApiClientError, isApiErrorPayload } from '@/lib/errors';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
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

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
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

  listTickets(projectId: string, limit = 20, offset = 0): Promise<TicketListResponse> {
    return apiRequest<TicketListResponse>(
      withQuery('/api/tickets', { projectId, limit, offset }),
    );
  },

  getTicket(ticketId: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}`);
  },

  createTicket(input: CreateTicketRequest): Promise<TicketResponse> {
    return apiRequest<TicketResponse>('/api/tickets', { method: 'POST', body: input });
  },

  submitTicket(ticketId: string, departmentId?: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/submit`, {
      method: 'POST',
      body: departmentId ? { departmentId } : {},
    });
  },

  startTicket(ticketId: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/start`, { method: 'POST' });
  },

  completeTicket(ticketId: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/complete`, { method: 'POST' });
  },

  delayTicket(ticketId: string, reason: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/delay`, {
      method: 'POST',
      body: { reason },
    });
  },

  requestFieldCancel(ticketId: string, reason?: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/field-cancel`, {
      method: 'POST',
      body: reason ? { reason } : {},
    });
  },

  restartDelayedTicket(ticketId: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/restart-delay`, { method: 'POST' });
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
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/requester-cancel`, { method: 'POST' });
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

  listAttachments(ticketId: string): Promise<AttachmentsListResponse> {
    return apiRequest<AttachmentsListResponse>(`/api/tickets/${ticketId}/attachments`);
  },

  uploadAttachment(ticketId: string, input: UploadAttachmentRequest): Promise<AttachmentResponse> {
    return apiRequest<AttachmentResponse>(`/api/tickets/${ticketId}/attachments`, {
      method: 'POST',
      body: input,
    });
  },
};
