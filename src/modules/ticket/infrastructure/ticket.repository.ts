/**
 * TicketRepository — pg implementation of ITicketRepository.
 * All queries scoped by tenant_id. No updates or deletes on ticket_events.
 *
 * Visibility scoping (CLAUDE.md §7A) is enforced in this layer — not in routes.
 */
import { randomUUID } from 'crypto';
import { ConflictError } from '@/shared/errors';
import type { DbClient, UUID, Page } from '@/shared/types';
import type { Ticket, TicketStatus, TicketType, WorkflowVariant } from '../domain/types';
import type { OperationalGroup, OperationalReportQuery } from '../application/operational-report';
import { dailyReportEvents } from '../application/daily-report-events';
import type { DailyActivity, DailyReportQuery } from '../application/daily-report';
import type {
  ITicketRepository,
  TicketStatusPatch,
  ListTicketsOptions,
  VisibilityScope,
} from '../application/ports';

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

interface TicketRow {
  id: string;
  tenant_id: string;
  project_id: string;
  area_id: string | null;
  subarea_id: string | null;
  aor_node_id: string | null;
  department_id: string | null;
  company_id: string;
  ticket_number: string | null;
  ticket_type: string | null;
  requester_id: string;
  assigned_party_chief_id: string | null;
  assigned_instrument_man_id: string | null;
  survey_lead_id: string | null;
  survey_superintendent_id: string | null;
  survey_manager_id: string | null;
  workflow_variant: string;
  status: string;
  craft: string | null;
  description: string | null;
  requested_date: Date | null;
  draft_last_saved_at: Date | null;
  draft_deleted_at: Date | null;
  draft_deleted_reason: Ticket['draftDeletedReason'];
  submitted_at: Date | null;
  approved_at: Date | null;
  assigned_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  closed_at: Date | null;
  canceled_at: Date | null;
  pending_field_status: Ticket['pendingFieldStatus'];
  pending_field_reason: string | null;
  pending_field_initiated_by: string | null;
  delayed_reason: string | null;
  cancel_reason: string | null;
  cancel_initiated_by: string | null;
  cancel_initiated_at: Date | null;
  cancel_initiator_role: string | null;
  cancel_approved_by: string | null;
  rejection_reason: string | null;
  rejected_at: Date | null;
  parent_ticket_id: string | null;
  is_priority: boolean;
  priority: Ticket['priority'];
  priority_set_by: string | null;
  priority_set_reason: string | null;
  priority_elevated_by: string | null;
  priority_elevated_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowToTicket(r: TicketRow): Ticket {
  return {
    id:                      r.id as UUID,
    tenantId:                r.tenant_id as UUID,
    projectId:               r.project_id as UUID,
    areaId:                  r.area_id as UUID | null,
    subareaId:               r.subarea_id as UUID | null,
    aorNodeId:               r.aor_node_id as UUID | null,
    departmentId:            r.department_id as UUID | null,
    companyId:               r.company_id as UUID,
    ticketNumber:            r.ticket_number,
    ticketType:              r.ticket_type as TicketType | null,
    requesterId:             r.requester_id as UUID,
    assignedPartyChiefId:    r.assigned_party_chief_id as UUID | null,
    assignedInstrumentManId: r.assigned_instrument_man_id as UUID | null,
    surveyLeadId:            r.survey_lead_id as UUID | null,
    surveySuperintendentId:  r.survey_superintendent_id as UUID | null,
    surveyManagerId:         r.survey_manager_id as UUID | null,
    workflowVariant:         r.workflow_variant as WorkflowVariant,
    status:                  r.status as TicketStatus,
    craft:                   r.craft,
    description:             r.description,
    requestedDate:           r.requested_date,
    draftLastSavedAt:        r.draft_last_saved_at,
    draftDeletedAt:          r.draft_deleted_at,
    draftDeletedReason:      r.draft_deleted_reason,
    submittedAt:             r.submitted_at,
    approvedAt:              r.approved_at,
    assignedAt:              r.assigned_at,
    startedAt:               r.started_at,
    completedAt:             r.completed_at,
    closedAt:                r.closed_at,
    canceledAt:              r.canceled_at,
    pendingFieldStatus:      r.pending_field_status,
    pendingFieldReason:      r.pending_field_reason,
    pendingFieldInitiatedBy: r.pending_field_initiated_by as UUID | null,
    delayedReason:           r.delayed_reason,
    cancelReason:            r.cancel_reason,
    cancelInitiatedBy:       r.cancel_initiated_by as UUID | null,
    cancelInitiatedAt:       r.cancel_initiated_at,
    cancelInitiatorRole:     r.cancel_initiator_role,
    cancelApprovedBy:       r.cancel_approved_by as UUID | null,
    rejectionReason:         r.rejection_reason,
    rejectedAt:              r.rejected_at,
    parentTicketId:          r.parent_ticket_id as UUID | null,
    priority:                r.priority,
    prioritySetBy:           r.priority_set_by as UUID | null,
    prioritySetReason:       r.priority_set_reason,
    priorityElevatedBy:      r.priority_elevated_by as UUID | null,
    priorityElevatedReason:  r.priority_elevated_reason,
    createdAt:               r.created_at,
    updatedAt:               r.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Visibility WHERE clause builder (CLAUDE.md §7A)
// ---------------------------------------------------------------------------

/**
 * Builds the additional SQL condition fragment that enforces role-based visibility.
 * baseIdx is the next positional $N parameter index to use.
 * Returns empty sql+params for full-visibility roles.
 */
function buildVisibilityClause(
  scope: VisibilityScope,
  baseIdx: number,
): { sql: string; params: unknown[] } {
  const { actorId, actorRole, aorNodeIds, partyChiefId, companyId, companyType } = scope;

  let roleScope: { sql: string; params: unknown[] };
  switch (actorRole) {
    // Full project visibility — no additional WHERE clause
    case 'SURVEY_MANAGER':
    case 'TENANT_ADMIN':
    case 'CAD_LEAD':
    case 'CAD_TECHNICIAN':
    case 'VIEWER':
      roleScope = { sql: '', params: [] };
      break;

    case 'REQUESTER':
      roleScope = {
        sql:    `AND t.requester_id = $${baseIdx}`,
        params: [actorId],
      };
      break;

    case 'PARTY_CHIEF':
      roleScope = {
        sql:    `AND t.assigned_party_chief_id = $${baseIdx}`,
        params: [actorId],
      };
      break;

    case 'INSTRUMENT_MAN': {
      // Sees: Party Chief's tickets + tickets where they are explicitly assigned_instrument_man
      roleScope = {
        sql:    `AND (t.assigned_party_chief_id = $${baseIdx} OR t.assigned_instrument_man_id = $${baseIdx + 1})`,
        params: [partyChiefId ?? null, actorId],
      };
      break;
    }

    case 'SURVEY_SUPERINTENDENT':
    case 'AREA_VIEWER': {
      if (!aorNodeIds || aorNodeIds.length === 0) {
        roleScope = { sql: 'AND 1 = 0', params: [] };
        break;
      }
      const placeholders = aorNodeIds.map((_, i) => `$${baseIdx + i}`).join(', ');
      roleScope = {
        sql:    `AND t.aor_node_id IN (${placeholders})`,
        params: aorNodeIds,
      };
      break;
    }

    case 'DEPARTMENT_MANAGER':
      roleScope = {
        sql: `AND EXISTS (SELECT 1 FROM department_memberships dm
          WHERE dm.project_id=t.project_id AND dm.tenant_id=t.tenant_id
            AND dm.user_id=$${baseIdx} AND dm.department_id=t.department_id
            AND dm.deactivated_at IS NULL)`,
        params: [actorId],
      };
      break;

    case 'DEPARTMENT_LEAD': {
      if (!aorNodeIds || aorNodeIds.length === 0) {
        roleScope = { sql: 'AND 1 = 0', params: [] };
        break;
      }
      const placeholders = aorNodeIds.map((_, i) => `$${baseIdx + i + 1}`).join(', ');
      roleScope = {
        sql: `AND EXISTS (SELECT 1 FROM department_memberships dm
          WHERE dm.project_id=t.project_id AND dm.tenant_id=t.tenant_id
            AND dm.user_id=$${baseIdx} AND dm.department_id=t.department_id
            AND dm.deactivated_at IS NULL)
          AND t.aor_node_id IN (${placeholders})`,
        params: [actorId, ...aorNodeIds],
      };
      break;
    }

    case 'SUBCONTRACTS_COORDINATOR':
      roleScope = {
        sql: `AND EXISTS (SELECT 1 FROM companies c WHERE c.id=t.company_id
          AND c.tenant_id=t.tenant_id AND c.type='SUBCONTRACTOR')`,
        params: [],
      };
      break;

    default:
      roleScope = { sql: 'AND 1 = 0', params: [] };
  }

  if (companyType === 'SUBCONTRACTOR') {
    return {
      sql: `${roleScope.sql} AND t.company_id = $${baseIdx + roleScope.params.length}`.trim(),
      params: [...roleScope.params, companyId],
    };
  }
  return roleScope;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class TicketRepository implements ITicketRepository {
  async findActiveProjectCrewBuild(db: DbClient, tenantId: UUID, projectId: UUID):
    Promise<'FULL' | 'MEDIUM' | 'SLIM' | null> {
    const { rows } = await db.query<{ crew_build: 'FULL' | 'MEDIUM' | 'SLIM' }>(
      `SELECT crew_build FROM projects
       WHERE id = $1 AND tenant_id = $2 AND status = 'ACTIVE'
       LIMIT 1`,
      [projectId, tenantId],
    );
    return rows[0]?.crew_build ?? null;
  }

  async isProjectAssignee(
    db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID,
    role: 'PARTY_CHIEF' | 'INSTRUMENT_MAN' | 'CAD_TECHNICIAN' | 'CAD_LEAD',
  ): Promise<boolean> {
    const { rows } = await db.query<{ assigned: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM project_memberships pm
         JOIN projects p ON p.id = pm.project_id AND p.tenant_id = $1
         JOIN users u ON u.id = pm.user_id AND u.tenant_id = p.tenant_id
         WHERE pm.project_id = $2 AND pm.user_id = $3 AND pm.role = $4
           AND p.status = 'ACTIVE' AND u.deactivated_at IS NULL
       ) AS assigned`,
      [tenantId, projectId, userId, role],
    );
    return rows[0]?.assigned === true;
  }
  async findById(
    db: DbClient,
    tenantId: UUID,
    ticketId: UUID,
    visibility: VisibilityScope,
  ): Promise<Ticket | null> {
    const { sql: visSql, params: visParams } = buildVisibilityClause(visibility, 3);

    const { rows } = await db.query<TicketRow>(
      `SELECT t.* FROM tickets t
       WHERE t.id = $1 AND t.tenant_id = $2
       AND t.draft_deleted_at IS NULL
       ${visSql}
       LIMIT 1`,
      [ticketId, tenantId, ...visParams],
    );
    return rows[0] ? rowToTicket(rows[0]) : null;
  }

  async findByIdInternal(
    db: DbClient,
    tenantId: UUID,
    ticketId: UUID,
  ): Promise<Ticket | null> {
    const { rows } = await db.query<TicketRow>(
      `SELECT t.* FROM tickets t WHERE t.id = $1 AND t.tenant_id = $2 LIMIT 1 FOR UPDATE`,
      [ticketId, tenantId],
    );
    return rows[0] ? rowToTicket(rows[0]) : null;
  }

  async save(db: DbClient, ticket: Ticket): Promise<void> {
    await db.query(
      `INSERT INTO tickets (
        id, tenant_id, project_id, area_id, subarea_id, company_id,
        ticket_number, ticket_type,
        requester_id, assigned_party_chief_id, assigned_instrument_man_id, survey_lead_id,
        workflow_variant, status, craft, description, requested_date,
        submitted_at, approved_at, assigned_at, started_at, completed_at, closed_at,
        rejection_reason, parent_ticket_id,
        is_priority, priority_elevated_by, priority_elevated_reason,
        created_at, updated_at, aor_node_id, department_id, priority,
        priority_set_by, priority_set_reason,
        draft_last_saved_at, draft_deleted_at, draft_deleted_reason
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
        $24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38
      )`,
      [
        ticket.id, ticket.tenantId, ticket.projectId, ticket.areaId,
        ticket.subareaId, ticket.companyId, ticket.ticketNumber, ticket.ticketType,
        ticket.requesterId, ticket.assignedPartyChiefId, ticket.assignedInstrumentManId,
        ticket.surveyLeadId,
        ticket.workflowVariant, ticket.status, ticket.craft, ticket.description,
        ticket.requestedDate,
        ticket.submittedAt, ticket.approvedAt, ticket.assignedAt,
        ticket.startedAt, ticket.completedAt, ticket.closedAt,
        ticket.rejectionReason, ticket.parentTicketId,
        ticket.priority === 'HIGH', ticket.priorityElevatedBy, ticket.priorityElevatedReason,
        ticket.createdAt, ticket.updatedAt, ticket.aorNodeId,
        ticket.departmentId, ticket.priority, ticket.prioritySetBy, ticket.prioritySetReason,
        ticket.draftLastSavedAt, ticket.draftDeletedAt, ticket.draftDeletedReason,
      ],
    );
  }

  async saveCadWork(db: DbClient, ticketId: UUID, tenantId: UUID): Promise<void> {
    await db.query(
      `INSERT INTO cad_work (id, ticket_id, tenant_id, cad_status)
       VALUES ($1, $2, $3, 'NOT_REQUIRED')`,
      [randomUUID(), ticketId, tenantId],
    );
  }

  async nextSequence(db: DbClient, projectId: UUID): Promise<number> {
    const { rows } = await db.query<{ last_seq: number }>(
      `INSERT INTO ticket_sequences (project_id, last_seq)
       VALUES ($1, 1)
       ON CONFLICT (project_id)
       DO UPDATE SET last_seq = ticket_sequences.last_seq + 1
       RETURNING last_seq`,
      [projectId],
    );
    const row = rows[0];
    if (!row) throw new Error('nextSequence returned no rows');
    return row.last_seq;
  }

  async findCreationAorCode(db: DbClient, params: {
    tenantId: UUID; projectId: UUID; aorNodeId: UUID;
    companyId: UUID; requesterId: UUID;
    allowRetired?: boolean;
  }): Promise<string | null> {
    const { rows } = await db.query<{ code: string }>(
      `SELECT n.code
       FROM projects p
       JOIN aor_nodes n ON n.project_id = p.id AND n.tenant_id = p.tenant_id
         AND (n.retired_at IS NULL OR $6::boolean)
       JOIN companies c ON c.tenant_id = p.tenant_id
       JOIN users u ON u.id = $5 AND u.tenant_id = p.tenant_id AND u.company_id = c.id
         AND u.deactivated_at IS NULL
       JOIN project_memberships pm ON pm.project_id = p.id AND pm.user_id = u.id
         AND pm.role = 'REQUESTER'
       WHERE p.tenant_id = $1 AND p.id = $2 AND p.status = 'ACTIVE' AND n.id = $3
         AND c.id = $4
       LIMIT 1`,
       [params.tenantId, params.projectId, params.aorNodeId,
       params.companyId, params.requesterId, params.allowRetired === true],
    );
    return rows[0]?.code ?? null;
  }

  async findRejectedParent(db: DbClient, tenantId: UUID, projectId: UUID,
    requesterId: UUID, parentTicketId: UUID): Promise<Ticket | null> {
    const { rows } = await db.query<TicketRow>(
      `SELECT * FROM tickets WHERE id=$1 AND tenant_id=$2 AND project_id=$3
        AND requester_id=$4 AND status='REJECTED' LIMIT 1`,
      [parentTicketId, tenantId, projectId, requesterId],
    );
    return rows[0] ? rowToTicket(rows[0]) : null;
  }

  async isDraftOwnerAllowed(db: DbClient, tenantId: UUID, projectId: UUID,
    requesterId: UUID, companyId: UUID): Promise<boolean> {
    const { rows } = await db.query<{ allowed: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM projects p
         JOIN project_memberships pm ON pm.project_id=p.id AND pm.user_id=$3
           AND pm.role='REQUESTER'
         JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id
           AND u.company_id=$4 AND u.deactivated_at IS NULL
         JOIN companies c ON c.id=u.company_id AND c.tenant_id=p.tenant_id
         WHERE p.id=$2 AND p.tenant_id=$1 AND p.status='ACTIVE'
       ) AS allowed`, [tenantId, projectId, requesterId, companyId]);
    return rows[0]?.allowed === true;
  }

  async listDrafts(db: DbClient, tenantId: UUID, requesterId: UUID,
    limit: number, offset: number): Promise<Page<Ticket>> {
    const { rows: count } = await db.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM tickets
       WHERE tenant_id=$1 AND requester_id=$2 AND status='DRAFT'
         AND draft_deleted_at IS NULL`, [tenantId, requesterId]);
    const { rows } = await db.query<TicketRow>(
      `SELECT * FROM tickets WHERE tenant_id=$1 AND requester_id=$2
         AND status='DRAFT' AND draft_deleted_at IS NULL
       ORDER BY draft_last_saved_at DESC NULLS LAST, created_at DESC
       LIMIT $3 OFFSET $4`, [tenantId, requesterId, limit, offset]);
    return { data: rows.map(rowToTicket), total: Number(count[0]?.total ?? 0), limit, offset };
  }

  async listDeletedDrafts(db: DbClient, tenantId: UUID, projectId: UUID,
    actorId: UUID, limit: number, offset: number): Promise<Page<Ticket>> {
    const predicate = `t.tenant_id=$1 AND t.project_id=$2 AND t.status='DRAFT'
      AND t.draft_deleted_at > NOW() - INTERVAL '30 days'
      AND (c.type<>'SUBCONTRACTOR' OR t.company_id=u.company_id)`;
    const from = `FROM tickets t
      JOIN users u ON u.id=$3 AND u.tenant_id=t.tenant_id
      JOIN companies c ON c.id=u.company_id AND c.tenant_id=t.tenant_id`;
    const { rows: count } = await db.query<{ total: string }>(
      `SELECT count(*)::text AS total ${from} WHERE ${predicate}`,
      [tenantId, projectId, actorId]);
    const { rows } = await db.query<TicketRow>(
      `SELECT t.* ${from} WHERE ${predicate}
       ORDER BY t.draft_deleted_at DESC LIMIT $4 OFFSET $5`,
      [tenantId, projectId, actorId, limit, offset]);
    return { data: rows.map(rowToTicket), total: Number(count[0]?.total ?? 0), limit, offset };
  }

  async findStaleDraftsForExpiry(db: DbClient, tenantId: UUID,
    limit: number): Promise<Ticket[]> {
    const { rows } = await db.query<TicketRow>(
      `SELECT * FROM tickets WHERE tenant_id=$1 AND status='DRAFT'
         AND draft_deleted_at IS NULL
         AND COALESCE(draft_last_saved_at, created_at) < NOW() - INTERVAL '7 days'
       ORDER BY COALESCE(draft_last_saved_at, created_at), id
       LIMIT $2 FOR UPDATE SKIP LOCKED`, [tenantId, limit]);
    return rows.map(rowToTicket);
  }

  async findDraftsForPurge(db: DbClient, tenantId: UUID,
    limit: number): Promise<Ticket[]> {
    const { rows } = await db.query<TicketRow>(
      `SELECT * FROM tickets WHERE tenant_id=$1 AND status='DRAFT'
         AND draft_deleted_at < NOW() - INTERVAL '30 days'
       ORDER BY draft_deleted_at, id LIMIT $2 FOR UPDATE SKIP LOCKED`,
      [tenantId, limit]);
    return rows.map(rowToTicket);
  }

  async purgeDraft(db: DbClient, tenantId: UUID, ticketId: UUID): Promise<void> {
    const { rows: children } = await db.query<{ id: UUID }>(
      `SELECT id FROM tickets WHERE tenant_id=$1 AND parent_ticket_id=$2 LIMIT 1`,
      [tenantId, ticketId]);
    if (children.length) throw new ConflictError('Draft has child tickets and cannot be purged');
    await db.query(
      `INSERT INTO attachment_purge_queue (tenant_id, ticket_id, storage_key)
       SELECT tenant_id, ticket_id, storage_key FROM attachments
       WHERE tenant_id=$1 AND ticket_id=$2
       ON CONFLICT (tenant_id, storage_key) DO NOTHING`, [tenantId, ticketId]);
    await db.query(`DELETE FROM attachments WHERE tenant_id=$1 AND ticket_id=$2`,
      [tenantId, ticketId]);
    await db.query(`DELETE FROM cad_work WHERE tenant_id=$1 AND ticket_id=$2`,
      [tenantId, ticketId]);
    await db.query(
      `INSERT INTO ticket_draft_tombstones (ticket_id, tenant_id) VALUES ($2,$1)`,
      [tenantId, ticketId]);
    await db.query(`DELETE FROM tickets WHERE tenant_id=$1 AND id=$2`,
      [tenantId, ticketId]);
  }

  async resolveCreationDepartment(db: DbClient, params: {
    tenantId: UUID; projectId: UUID; requesterId: UUID; selectedDepartmentId?: UUID;
  }): Promise<{ departmentId: UUID; priority: Ticket['priority'] } | null> {
    const { rows: membership } = await db.query<{ department_id: string; priority: Ticket['priority'] }>(
      `SELECT dm.department_id, COALESCE(dt.default_priority, 'NORMAL') AS priority
       FROM department_memberships dm
       JOIN departments d ON d.id=dm.department_id AND d.project_id=dm.project_id
         AND d.tenant_id=dm.tenant_id
       LEFT JOIN department_titles dt ON dt.department_id=dm.department_id
         AND dt.tenant_id=dm.tenant_id AND dt.title=dm.title
       WHERE dm.tenant_id=$1 AND dm.project_id=$2 AND dm.user_id=$3
         AND dm.deactivated_at IS NULL LIMIT 1`,
      [params.tenantId, params.projectId, params.requesterId],
    );
    if (membership[0]) {
      if (params.selectedDepartmentId && membership[0].department_id !== params.selectedDepartmentId) return null;
      return { departmentId: membership[0].department_id as UUID, priority: membership[0].priority };
    }
    if (!params.selectedDepartmentId) return null;
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM departments WHERE id=$1 AND tenant_id=$2 AND project_id=$3 LIMIT 1`,
      [params.selectedDepartmentId, params.tenantId, params.projectId],
    );
    return rows[0] ? { departmentId: rows[0].id as UUID, priority: 'NORMAL' } : null;
  }

  async patchTicket(
    db: DbClient,
    tenantId: UUID,
    ticketId: UUID,
    patch: TicketStatusPatch,
  ): Promise<void> {
    const cols: string[] = ['status = $3', 'updated_at = NOW()'];
    const vals: unknown[] = [ticketId, tenantId, patch.status];
    let idx = 4;

    const maybe = (col: string, val: unknown) => {
      if (val !== undefined) { cols.push(`${col} = $${idx++}`); vals.push(val); }
    };

    maybe('submitted_at',               patch.submittedAt);
    maybe('approved_at',                patch.approvedAt);
    maybe('assigned_at',                patch.assignedAt);
    maybe('started_at',                 patch.startedAt);
    maybe('completed_at',               patch.completedAt);
    maybe('closed_at',                  patch.closedAt);
    maybe('canceled_at',                patch.canceledAt);
    maybe('rejection_reason',           patch.rejectionReason);
    maybe('rejected_at',                patch.rejectedAt);
    maybe('assigned_party_chief_id',    patch.assignedPartyChiefId);
    maybe('assigned_instrument_man_id', patch.assignedInstrumentManId);
    maybe('survey_lead_id',             patch.surveyLeadId);
    maybe('survey_superintendent_id',   patch.surveySuperintendentId);
    maybe('survey_manager_id',          patch.surveyManagerId);
    maybe('pending_field_status',       patch.pendingFieldStatus);
    maybe('pending_field_reason',       patch.pendingFieldReason);
    maybe('pending_field_initiated_by', patch.pendingFieldInitiatedBy);
    maybe('delayed_reason',             patch.delayedReason);
    maybe('cancel_reason',              patch.cancelReason);
    maybe('cancel_initiated_by',        patch.cancelInitiatedBy);
    maybe('cancel_initiated_at',        patch.cancelInitiatedAt);
    maybe('cancel_initiator_role',      patch.cancelInitiatorRole);
    maybe('cancel_approved_by',        patch.cancelApprovedBy);
    if (patch.priority !== undefined) maybe('is_priority', patch.priority === 'HIGH');
    maybe('priority',                   patch.priority);
    maybe('priority_set_by',            patch.prioritySetBy);
    maybe('priority_set_reason',        patch.prioritySetReason);
    maybe('department_id',              patch.departmentId);
    maybe('ticket_number',              patch.ticketNumber);
    maybe('ticket_type',                patch.ticketType);
    maybe('aor_node_id',                patch.aorNodeId);
    maybe('craft',                      patch.craft);
    maybe('description',                patch.description);
    maybe('requested_date',             patch.requestedDate);
    maybe('draft_last_saved_at',        patch.draftLastSavedAt);
    maybe('draft_deleted_at',           patch.draftDeletedAt);
    maybe('draft_deleted_reason',       patch.draftDeletedReason);
    maybe('priority_elevated_by',       patch.priorityElevatedBy);
    maybe('priority_elevated_reason',   patch.priorityElevatedReason);

    await db.query(
      `UPDATE tickets SET ${cols.join(', ')} WHERE id = $1 AND tenant_id = $2`,
      vals,
    );
  }

  async list(db: DbClient, tenantId: UUID, opts: ListTicketsOptions): Promise<Page<Ticket>> {
    const baseVals: unknown[] = [tenantId, opts.projectId];
    const conditions: string[] = ['t.tenant_id = $1', 't.project_id = $2',
      "t.status <> 'DRAFT'", 't.draft_deleted_at IS NULL'];

    const { sql: visSql, params: visParams } = buildVisibilityClause(
      opts.visibility,
      baseVals.length + 1,
    );
    if (visSql) {
      conditions.push(visSql.replace(/^AND /, ''));
      baseVals.push(...visParams);
    }

    const where = conditions.join(' AND ');

    const { rows: countRows } = await db.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM tickets t WHERE ${where}`,
      baseVals,
    );
    const total = parseInt(countRows[0]?.total ?? '0', 10);

    const limitIdx  = baseVals.length + 1;
    const offsetIdx = baseVals.length + 2;

    const { rows } = await db.query<TicketRow>(
      `SELECT t.* FROM tickets t
       WHERE ${where}
       ORDER BY t.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...baseVals, opts.limit, opts.offset],
    );

    return { data: rows.map(rowToTicket), total, limit: opts.limit, offset: opts.offset };
  }

  async operationalGroups(db:DbClient,query:OperationalReportQuery,visibility:VisibilityScope):Promise<OperationalGroup[]> {
    const dimensions={
      project:{key:'t.project_id::text',label:'p.name'},
      area:{key:'t.aor_node_id::text',label:'a.name'},
      craft:{key:'t.craft',label:'t.craft'},
      partyChief:{key:'t.assigned_party_chief_id::text',label:'pc.name'},
      instrumentMan:{key:'t.assigned_instrument_man_id::text',label:'im.name'},
    };
    const dimension=dimensions[query.dimension];
    const visibilityClause=buildVisibilityClause(visibility,3);
    const values:unknown[]=[query.tenantId,query.projectId,...visibilityClause.params];
    const limitIndex=values.length+1,offsetIndex=values.length+2;
    return (await db.query<OperationalGroup>(`WITH counts AS (
      SELECT ${dimension.key} AS key,${dimension.label} AS label,t.status,count(*)::int AS count
      FROM tickets t JOIN projects p ON p.id=t.project_id AND p.tenant_id=t.tenant_id
      LEFT JOIN aor_nodes a ON a.id=t.aor_node_id AND a.project_id=t.project_id AND a.tenant_id=t.tenant_id
      LEFT JOIN users pc ON pc.id=t.assigned_party_chief_id AND pc.tenant_id=t.tenant_id
      LEFT JOIN users im ON im.id=t.assigned_instrument_man_id AND im.tenant_id=t.tenant_id
      WHERE t.tenant_id=$1 AND t.project_id=$2 AND t.status<>'DRAFT'
        AND t.draft_deleted_at IS NULL ${visibilityClause.sql}
      GROUP BY ${dimension.key},${dimension.label},t.status
    ) SELECT key,label,sum(count)::int AS total,jsonb_object_agg(status,count) AS statuses
      FROM counts GROUP BY key,label ORDER BY label NULLS FIRST,key NULLS FIRST
      LIMIT $${limitIndex} OFFSET $${offsetIndex}`,[...values,query.limit,query.offset])).rows;
  }

  async dailyActivity(db:DbClient,query:DailyReportQuery,visibility:VisibilityScope):Promise<DailyActivity[]> {
    const filter=buildVisibilityClause(visibility,6);
    return (await db.query<DailyActivity>(`SELECT e.event_type AS "eventType",
      count(DISTINCT e.ticket_id)::int AS requests,count(*)::int AS events
      FROM ticket_events e JOIN tickets t ON t.id=e.ticket_id AND t.tenant_id=e.tenant_id
      WHERE t.tenant_id=$1 AND t.project_id=$2 AND e.tenant_id=$1
        AND t.status<>'DRAFT' AND t.draft_deleted_at IS NULL
        AND e.created_at >= $3::timestamptz AND e.created_at < $4::timestamptz
        AND e.event_type=ANY($5::text[])
        AND (e.event_type<>'ticket.created' OR t.workflow_variant='DIRECT_ASSIGNMENT')
        ${filter.sql}
      GROUP BY e.event_type ORDER BY e.event_type`,
    [query.tenantId,query.projectId,query.from,query.until,[...dailyReportEvents],...filter.params])).rows;
  }

  async findUserCompanyInfo(
    db: DbClient, tenantId: UUID, userId: UUID,
  ): Promise<{ companyId: UUID; companyType: 'GC' | 'SUBCONTRACTOR' | 'OWNER_REP' } | null> {
    const { rows } = await db.query<{ company_id: string; type: string }>(
      `SELECT u.company_id, c.type
       FROM users u JOIN companies c ON c.id = u.company_id
       WHERE u.id = $1 AND u.tenant_id = $2 AND c.tenant_id = $2
       LIMIT 1`,
      [userId, tenantId],
    );
    if (!rows[0]) return null;
    return { companyId: rows[0].company_id as UUID,
      companyType: rows[0].type as 'GC' | 'SUBCONTRACTOR' | 'OWNER_REP' };
  }

  async findUserEmail(db: DbClient, tenantId: UUID, userId: UUID): Promise<string | null> {
    const { rows } = await db.query<{ email: string }>(
      `SELECT email FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [userId, tenantId],
    );
    return rows[0]?.email ?? null;
  }

  async findPartyChiefForInstrumentMan(
    db: DbClient, tenantId: UUID, projectId: UUID, instrumentManId: UUID,
  ): Promise<UUID | null> {
    const { rows } = await db.query<{ party_chief_id: string }>(
      `SELECT party_chief_id FROM crew_rosters
       WHERE tenant_id = $1 AND project_id = $2 AND instrument_man_id = $3
         AND deactivated_at IS NULL
       LIMIT 1`,
      [tenantId, projectId, instrumentManId],
    );
    return (rows[0]?.party_chief_id as UUID) ?? null;
  }

  async findAorNodeIdsForUser(
    db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID,
  ): Promise<UUID[]> {
    const { rows } = await db.query<{ id: string }>(
      `WITH RECURSIVE visible_nodes AS (
         SELECT n.id FROM aor_assignments aa
         JOIN aor_nodes n ON n.id=aa.aor_node_id AND n.project_id=aa.project_id
           AND n.tenant_id=aa.tenant_id AND n.retired_at IS NULL
         WHERE aa.tenant_id=$1 AND aa.project_id=$2 AND aa.user_id=$3
           AND aa.deactivated_at IS NULL
         UNION
         SELECT child.id FROM aor_nodes child
         JOIN visible_nodes parent ON child.parent_id=parent.id
         WHERE child.tenant_id=$1 AND child.project_id=$2 AND child.retired_at IS NULL
       ) SELECT DISTINCT id FROM visible_nodes`,
      [tenantId, projectId, userId],
    );
    return rows.map(r => r.id as UUID);
  }

  async isAorNodeInSurveyRoleScope(db: DbClient, tenantId: UUID,
    projectId: UUID, userId: UUID, aorNodeId: UUID,
    role: 'SURVEY_SUPERINTENDENT' | 'PARTY_CHIEF'): Promise<boolean> {
    const { rows } = await db.query<{ allowed: boolean }>(
      `WITH RECURSIVE ancestors AS (
         SELECT id, parent_id FROM aor_nodes
         WHERE id = $4 AND project_id = $2 AND tenant_id = $1
         UNION ALL
         SELECT parent.id, parent.parent_id FROM aor_nodes parent
         JOIN ancestors child ON child.parent_id = parent.id
         WHERE parent.project_id = $2 AND parent.tenant_id = $1
       )
       SELECT EXISTS (
         SELECT 1 FROM ancestors node
         JOIN aor_assignments aa ON aa.aor_node_id = node.id
           AND aa.project_id = $2 AND aa.tenant_id = $1
           AND aa.user_id = $3 AND aa.deactivated_at IS NULL
         JOIN project_memberships pm ON pm.project_id = $2
           AND pm.user_id = $3 AND pm.role = $5
         JOIN users u ON u.id = $3 AND u.tenant_id = $1
           AND u.deactivated_at IS NULL
       ) AS allowed`,
      [tenantId, projectId, userId, aorNodeId, role],
    );
    return rows[0]?.allowed === true;
  }

  async findResponsibleSuperintendent(
    db: DbClient, tenantId: UUID, projectId: UUID, aorNodeId: UUID,
  ): Promise<UUID | null> {
    const { rows } = await db.query<{ user_id: string }>(
      `WITH RECURSIVE ancestors AS (
         SELECT id, parent_id, 0 AS distance FROM aor_nodes
         WHERE id=$3 AND project_id=$2 AND tenant_id=$1
         UNION ALL
         SELECT parent.id, parent.parent_id, child.distance+1
         FROM aor_nodes parent JOIN ancestors child ON parent.id=child.parent_id
         WHERE parent.project_id=$2 AND parent.tenant_id=$1
       )
       SELECT aa.user_id FROM ancestors a
       JOIN aor_assignments aa ON aa.aor_node_id=a.id AND aa.tenant_id=$1
         AND aa.project_id=$2 AND aa.deactivated_at IS NULL
       JOIN project_memberships pm ON pm.project_id=$2 AND pm.user_id=aa.user_id
         AND pm.role='SURVEY_SUPERINTENDENT'
       ORDER BY a.distance, aa.created_at LIMIT 1`,
      [tenantId, projectId, aorNodeId],
    );
    return rows[0]?.user_id as UUID ?? null;
  }
}
