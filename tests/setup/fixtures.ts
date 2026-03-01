import { randomUUID } from 'crypto';
import type { UUID } from '@/shared/types';
import type { AuthMethod, ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type { CompanyType } from '@/modules/tenancy/domain/types';
import type { TicketStatus, TicketType, WorkflowVariant } from '@/modules/ticket/domain/types';
import { query } from './db';

export async function createTenant(params?: { id?: UUID; name?: string }) {
  const tenant = {
    id: params?.id ?? (randomUUID() as UUID),
    name: params?.name ?? 'Test Tenant',
  };

  await query(
    `INSERT INTO tenants (id, name, created_at)
     VALUES ($1, $2, NOW())`,
    [tenant.id, tenant.name],
  );

  return tenant;
}

export async function createCompany(params: {
  tenantId: UUID;
  id?: UUID;
  name?: string;
  type?: CompanyType;
}) {
  const company = {
    id: params.id ?? (randomUUID() as UUID),
    tenantId: params.tenantId,
    name: params.name ?? 'Test Company',
    type: params.type ?? 'GC',
  };

  await query(
    `INSERT INTO companies (id, tenant_id, name, type, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [company.id, company.tenantId, company.name, company.type],
  );

  return company;
}

export async function createUser(params: {
  tenantId: UUID;
  companyId: UUID;
  id?: UUID;
  email?: string;
  name?: string;
  passwordHash?: string | null;
  authMethod?: AuthMethod;
}) {
  const user = {
    id: params.id ?? (randomUUID() as UUID),
    tenantId: params.tenantId,
    companyId: params.companyId,
    email: params.email ?? `user-${randomUUID()}@example.com`,
    name: params.name ?? 'Test User',
    passwordHash: params.passwordHash ?? '$2b$12$testhashplaceholder12345678901234567890123456789012345678',
    authMethod: params.authMethod ?? 'LOCAL',
  };

  await query(
    `INSERT INTO users (id, tenant_id, company_id, email, password_hash, auth_method, name, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [
      user.id,
      user.tenantId,
      user.companyId,
      user.email,
      user.passwordHash,
      user.authMethod,
      user.name,
    ],
  );

  return user;
}

export async function createProject(params: {
  tenantId: UUID;
  id?: UUID;
  name?: string;
}) {
  const project = {
    id: params.id ?? (randomUUID() as UUID),
    tenantId: params.tenantId,
    name: params.name ?? 'Test Project',
    status: 'ACTIVE' as const,
  };

  await query(
    `INSERT INTO projects (id, tenant_id, name, status, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [project.id, project.tenantId, project.name, project.status],
  );

  return project;
}

export async function createTenantMembership(params: {
  tenantId: UUID;
  userId: UUID;
  role: TenantRole;
  id?: UUID;
}) {
  const membership = {
    id: params.id ?? (randomUUID() as UUID),
    tenantId: params.tenantId,
    userId: params.userId,
    role: params.role,
  };

  await query(
    `INSERT INTO tenant_memberships (id, tenant_id, user_id, role, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [membership.id, membership.tenantId, membership.userId, membership.role],
  );

  return membership;
}

export async function addProjectMembership(params: {
  projectId: UUID;
  userId: UUID;
  role: ProjectRole;
  id?: UUID;
}) {
  const membership = {
    id: params.id ?? (randomUUID() as UUID),
    projectId: params.projectId,
    userId: params.userId,
    role: params.role,
  };

  await query(
    `INSERT INTO project_memberships (id, project_id, user_id, role, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [membership.id, membership.projectId, membership.userId, membership.role],
  );

  return membership;
}

export async function createArea(params: {
  tenantId: UUID;
  projectId: UUID;
  id?: UUID;
  name?: string;
  code?: string;
}) {
  const area = {
    id: params.id ?? (randomUUID() as UUID),
    tenantId: params.tenantId,
    projectId: params.projectId,
    name: params.name ?? 'Unit 1',
    code: params.code ?? 'U1',
  };

  await query(
    `INSERT INTO areas (id, project_id, tenant_id, name, code, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [area.id, area.projectId, area.tenantId, area.name, area.code],
  );

  return area;
}

export async function createSubarea(params: {
  tenantId: UUID;
  projectId: UUID;
  areaId: UUID;
  id?: UUID;
  name?: string;
}) {
  const subarea = {
    id: params.id ?? (randomUUID() as UUID),
    tenantId: params.tenantId,
    projectId: params.projectId,
    areaId: params.areaId,
    name: params.name ?? 'Subarea A',
  };

  await query(
    `INSERT INTO subareas (id, area_id, project_id, tenant_id, name, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [subarea.id, subarea.areaId, subarea.projectId, subarea.tenantId, subarea.name],
  );

  return subarea;
}

export async function createTicket(params: {
  tenantId: UUID;
  projectId: UUID;
  areaId: UUID;
  subareaId: UUID;
  companyId: UUID;
  requesterId: UUID;
  id?: UUID;
  ticketNumber?: string;
  ticketType?: TicketType;
  workflowVariant?: WorkflowVariant;
  status?: TicketStatus;
  assignedPartyChiefId?: UUID | null;
  assignedInstrumentManId?: UUID | null;
}) {
  const ticket = {
    id: params.id ?? (randomUUID() as UUID),
    tenantId: params.tenantId,
    projectId: params.projectId,
    areaId: params.areaId,
    subareaId: params.subareaId,
    companyId: params.companyId,
    ticketNumber: params.ticketNumber ?? `FSS-U1-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`,
    ticketType: params.ticketType ?? 'LAYOUT',
    requesterId: params.requesterId,
    assignedPartyChiefId: params.assignedPartyChiefId ?? null,
    assignedInstrumentManId: params.assignedInstrumentManId ?? null,
    surveyLeadId: null,
    workflowVariant: params.workflowVariant ?? 'STANDARD_APPROVAL',
    status: params.status ?? 'SUBMITTED',
    craft: 'PIPE',
    description: 'Fixture ticket',
    requestedDate: new Date('2026-03-10'),
    submittedAt: new Date('2026-03-01T10:00:00Z'),
    approvedAt: null,
    assignedAt: null,
    startedAt: null,
    completedAt: null,
    closedAt: null,
    rejectionReason: null,
    parentTicketId: null,
    isPriority: false,
    priorityElevatedBy: null,
    priorityElevatedReason: null,
  };

  await query(
    `INSERT INTO tickets (
      id, tenant_id, project_id, area_id, subarea_id, company_id,
      ticket_number, ticket_type,
      requester_id, assigned_party_chief_id, assigned_instrument_man_id, survey_lead_id,
      workflow_variant, status, craft, description, requested_date,
      submitted_at, approved_at, assigned_at, started_at, completed_at, closed_at,
      rejection_reason, parent_ticket_id,
      is_priority, priority_elevated_by, priority_elevated_reason,
      created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
      $24,$25,$26,$27,$28,NOW(),NOW()
    )`,
    [
      ticket.id,
      ticket.tenantId,
      ticket.projectId,
      ticket.areaId,
      ticket.subareaId,
      ticket.companyId,
      ticket.ticketNumber,
      ticket.ticketType,
      ticket.requesterId,
      ticket.assignedPartyChiefId,
      ticket.assignedInstrumentManId,
      ticket.surveyLeadId,
      ticket.workflowVariant,
      ticket.status,
      ticket.craft,
      ticket.description,
      ticket.requestedDate,
      ticket.submittedAt,
      ticket.approvedAt,
      ticket.assignedAt,
      ticket.startedAt,
      ticket.completedAt,
      ticket.closedAt,
      ticket.rejectionReason,
      ticket.parentTicketId,
      ticket.isPriority,
      ticket.priorityElevatedBy,
      ticket.priorityElevatedReason,
    ],
  );

  return ticket;
}
