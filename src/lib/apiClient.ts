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
  DeletedDraftsResponse,
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
import type { TicketQueryFilters } from '@/modules/ticket/application/query-filters';

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

export function createIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  return `idemp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
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
 projectAdministration():Promise<{canCreateProject:boolean;projects:Array<{id:string;name:string;status:'SETUP'|'ACTIVE'|'ARCHIVED';crewBuild:string;recommissioning?:boolean}>;templates:Array<{id:string;name:string;crewBuild:string}>}>{return apiRequest('/api/projects/administration');},
 createProject(input:{name:string;crewBuild?:import('@/modules/tenancy/domain/types').CrewBuild;templateId?:string},key?:string):Promise<{project:{id:string;name:string;status:'SETUP'}}> {return apiRequest('/api/projects',{method:'POST',body:input,...(key?{headers:{'Idempotency-Key':key}}:{})});},
 workforceContext(projectId:string):Promise<{project:import('@/modules/tenancy/application/survey-teams').TeamProjectContext;role:import('@/modules/identity/domain/types').ProjectRole;snapshotToken:string}>{return apiRequest(withQuery(`/api/projects/${encodeURIComponent(projectId)}/survey/workforce`,{mode:'context'}));},
 workforce(projectId:string,query:import('@/modules/tenancy/application/survey-teams').TeamPageQuery):Promise<import('@/modules/tenancy/application/survey-workforce').WorkforcePage>{return apiRequest(withQuery(`/api/projects/${encodeURIComponent(projectId)}/survey/workforce`,{...query}));},
 moveWorkforceMember(projectId:string,input:import('@/modules/tenancy/application/survey-workforce').WorkforceMove,key:string):Promise<{changed:boolean}>{return apiRequest(`/api/projects/${encodeURIComponent(projectId)}/survey/workforce`,{method:'POST',body:input,headers:{'Idempotency-Key':key}});},

  readProtectedObligations(projectId: string, input: import('@/modules/tenancy/application/protected-obligations.types').ProtectedReadQuery): Promise<import('@/modules/tenancy/application/protected-obligations.types').ProtectedReadResult> {
    return apiRequest(withQuery(`/api/projects/${encodeURIComponent(projectId)}/survey/protected-obligations`, {mode:input.mode,...input.query,...('userId' in input?{userId:input.userId}:{}),...('grantId' in input?{grantId:input.grantId}:{})}));
  },
  resolveSurveyReviewer(projectId: string, input: import('@/modules/tenancy/application/protected-obligations.types').ResolveReviewerInput, idempotencyKey: string): Promise<import('@/modules/tenancy/application/protected-obligations.types').ResolveReviewerResult> {
    return apiRequest(`/api/projects/${encodeURIComponent(projectId)}/survey/protected-obligations`, {method:'POST',body:input,headers:{'Idempotency-Key':idempotencyKey}});
  },
  readSuperintendentAreas(projectId:string,input:import('@/modules/tenancy/application/superintendent-area.types').SuperintendentAreaReadQuery):Promise<import('@/modules/tenancy/application/superintendent-area.types').SuperintendentAreaReadResult>{
    return apiRequest(withQuery(`/api/projects/${encodeURIComponent(projectId)}/survey/staffing`,{mode:input.mode,superintendentId:input.superintendentId,...input.query,...('linkId' in input?{linkId:input.linkId}:{})}));
  },
  unlinkSuperintendentArea(projectId:string,input:import('@/modules/tenancy/application/superintendent-area.types').UnlinkSuperintendentAreaInput,idempotencyKey:string):Promise<import('@/modules/tenancy/application/superintendent-area.types').UnlinkSuperintendentAreaResult>{
    return apiRequest(`/api/projects/${encodeURIComponent(projectId)}/survey/staffing`,{method:'PATCH',body:input,headers:{'Idempotency-Key':idempotencyKey}});
  },
  getSurveyStaffing(projectId: string, partyChiefId: string, query: import('@/modules/tenancy/application/read-survey-staffing').StaffingReadQuery): Promise<{ staffing: import('@/modules/tenancy/application/read-survey-staffing').SurveyStaffingDetail }> {
    return apiRequest(withQuery(`/api/projects/${encodeURIComponent(projectId)}/survey/staffing`, { partyChiefId, ...query }));
  },
  saveSurveyStaffing(projectId: string, input: import('@/modules/tenancy/application/save-survey-staffing').SurveyStaffingInput, idempotencyKey: string): Promise<{ success: boolean; changed: boolean }> {
    return apiRequest(`/api/projects/${encodeURIComponent(projectId)}/survey/staffing`, { method: 'POST', body: input, headers: { 'Idempotency-Key': idempotencyKey } });
  },
  unlinkSurveyStaffing(projectId: string, input: import('@/modules/tenancy/application/unlink-survey-staffing').StaffingUnlinkInput, idempotencyKey: string): Promise<{ success: boolean; changed: boolean }> {
    return apiRequest(`/api/projects/${encodeURIComponent(projectId)}/survey/staffing`, { method: 'PATCH', body: input, headers: { 'Idempotency-Key': idempotencyKey } });
  },
  getTeamContext(projectId: string): Promise<{ project: import('@/modules/tenancy/application/survey-teams').TeamProjectContext }> {
    return apiRequest(withQuery(`/api/projects/${encodeURIComponent(projectId)}/survey/teams`, { mode: 'context' }));
  },
  listSurveyTeams(projectId: string, query: import('@/modules/tenancy/application/survey-teams').TeamPageQuery): Promise<import('@/shared/types').Page<import('@/modules/tenancy/application/survey-teams').SurveyTeamSummary>> {
    return apiRequest(withQuery(`/api/projects/${encodeURIComponent(projectId)}/survey/teams`, { ...query }));
  },
  listTeamPersonnel(projectId: string, query: import('@/modules/tenancy/application/survey-teams').TeamPageQuery): Promise<import('@/shared/types').Page<import('@/modules/tenancy/application/survey-teams').TeamPersonnel>> {
    return apiRequest(withQuery(`/api/projects/${encodeURIComponent(projectId)}/survey/teams`, { ...query, mode: 'personnel' }));
  },
  listTeamAreas(projectId: string, query: import('@/modules/tenancy/application/survey-teams').TeamPageQuery): Promise<import('@/shared/types').Page<import('@/modules/tenancy/application/survey-teams').TeamArea>> {
    return apiRequest(withQuery(`/api/projects/${encodeURIComponent(projectId)}/survey/teams`, { ...query, mode: 'areas' }));
  },
  createSurveyArea(projectId: string, input: {name:string;code:string}, idempotencyKey:string): Promise<{area:{id:string;name:string}}> {
    return apiRequest(`/api/projects/${encodeURIComponent(projectId)}/survey/areas`, {method:'POST',body:input,headers:{'Idempotency-Key':idempotencyKey}});
  },
  getSurveyTeam(projectId: string, teamId: string): Promise<{ team: import('@/modules/tenancy/application/survey-teams').SurveyTeamDetail }> {
    return apiRequest(withQuery(`/api/projects/${encodeURIComponent(projectId)}/survey/teams`, { teamId }));
  },
  saveSurveyTeam(projectId: string, input: import('@/modules/tenancy/application/survey-teams').SaveSurveyTeamInput, idempotencyKey: string): Promise<{ teamId: string; rowVersion: number; changed: boolean }> {
    return apiRequest(`/api/projects/${encodeURIComponent(projectId)}/survey/teams`, { method: 'POST', body: input, headers: { 'Idempotency-Key': idempotencyKey } });
  },
  deleteSurveyTeam(projectId: string, teamId: string, expectedVersion: number, idempotencyKey: string): Promise<{ success: boolean }> {
    return apiRequest(`/api/projects/${encodeURIComponent(projectId)}/survey/teams`, { method: 'DELETE', body: { teamId, expectedVersion, confirmDelete: true }, headers: { 'Idempotency-Key': idempotencyKey } });
  },
  changeSurveyRole(projectId: string, input: import('@/modules/tenancy/application/change-survey-role').ChangeSurveyRoleInput, idempotencyKey: string): Promise<{ changed: boolean }> {
    return apiRequest(`/api/projects/${encodeURIComponent(projectId)}/survey/teams`, { method: 'PATCH', body: { action: 'set-role', ...input }, headers: { 'Idempotency-Key': idempotencyKey } });
  },
  reviewTickets(projectId: string, query: Record<string, string | number | undefined>): Promise<import('@/modules/ticket/application/review-tickets').ReviewResult> {
    return apiRequest(withQuery(`/api/projects/${encodeURIComponent(projectId)}/review`, query));
  },
  getMyAccount(projectId?: string): Promise<import('@/modules/tenancy/application/my-account').MyAccount> {
    return apiRequest(withQuery('/api/account', { projectId }));
  },

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

  listTickets(projectId: string, limit = 20, offset = 0, filters: TicketQueryFilters & { sort?: 'created' | 'operations' } = {}): Promise<TicketListResponse> {
    return apiRequest<TicketListResponse>(
      withQuery('/api/tickets', { ...filters, projectId, limit, offset }),
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

  updateRequesterTicket(ticketId: string, input: UpdateRequesterTicketRequest, retryKey = createIdempotencyKey()): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}`, {
      method: 'PATCH',
      body: input,
      headers: { 'Idempotency-Key': retryKey },
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

  submitTicket(ticketId: string, departmentId?: string, urgentReason?: string, expectedVersion?: number, retryKey = createIdempotencyKey()): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/submit`, {
      method: 'POST',
      body: { ...(departmentId ? { departmentId } : {}), ...(urgentReason ? { urgentReason } : {}),
        ...(expectedVersion !== undefined ? { expectedVersion } : {}) },
      headers: { 'Idempotency-Key': retryKey },
    });
  },

  saveNewDraft(projectId: string, input: UpdateRequesterTicketRequest, retryKey: string): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/projects/${projectId}/drafts`, {
      method: 'POST', body: input, headers: { 'Idempotency-Key': retryKey },
    });
  },
  deleteDraft(ticketId: string, expectedVersion: number, retryKey: string): Promise<{ deleted: boolean }> {
    return apiRequest(`/api/tickets/${ticketId}/draft`, { method: 'DELETE', body: { expectedVersion },
      headers: { 'Idempotency-Key': retryKey } });
  },
  listDeletedDrafts(projectId: string, limit: number, offset: number): Promise<DeletedDraftsResponse> {
    return apiRequest(withQuery(`/api/projects/${projectId}/deleted-drafts`, { limit, offset }));
  },
  restoreDraft(projectId: string, ticketId: string, expectedVersion: number, reason: string, retryKey: string): Promise<{ restored: boolean }> {
    return apiRequest(`/api/projects/${projectId}/drafts/${ticketId}/restore`, { method:'POST',
      body: { expectedVersion, reason }, headers: { 'Idempotency-Key': retryKey } });
  },

  approveTicket(ticketId: string, idempotencyKey=createIdempotencyKey()): Promise<TicketResponse> {
    return apiRequest<TicketResponse>(`/api/tickets/${ticketId}/approve`, {
      method: 'POST', headers: { 'Idempotency-Key': idempotencyKey },
    });
  },
  rejectTicket(ticketId:string,rejectionReason:string,idempotencyKey:string):Promise<TicketResponse> {
    return apiRequest(`/api/tickets/${ticketId}/reject`,{method:'POST',body:{rejectionReason},headers:{'Idempotency-Key':idempotencyKey}});
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
  getKpiCharts(projectId: string, filters: import('@/modules/reporting/application/metrics-filters').MetricsFilters, memberId?:string): Promise<{
    metrics: import('@/modules/reporting/application/amelia-metrics').AmeliaMetrics;
    analytics: {
      personnelFilters: boolean;
      supportsLinkedCrewScope?: boolean;
      scopeKind?: 'areaWorkload' | 'linkedCrews' | 'authorized';
      linkedCrewCount?: number;
    };
  }> {
    return apiRequest(withQuery(`/api/projects/${projectId}/metrics`, { ...filters, view: 'charts', memberId }));
  },
  getCommandActivity(projectId: string, filters: Pick<import('@/modules/reporting/application/metrics-filters').MetricsFilters,
    'areaId' | 'ticketType' | 'status' | 'crewId' | 'instrumentManId' | 'dateFrom' | 'dateTo'> = {}): Promise<{
    activity: import('@/modules/reporting/application/command-activity').CommandActivity;
  }> {
    return apiRequest(withQuery(`/api/projects/${projectId}/metrics`, { ...filters, view: 'activity' }));
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
      ...(input.retryKey ? { headers: { 'Idempotency-Key': input.retryKey } } : {}),
    });
  },
};
