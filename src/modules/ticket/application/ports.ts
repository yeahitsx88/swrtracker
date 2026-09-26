/**
 * Repository ports for the Ticket module.
 * Implemented by infrastructure/ticket.repository.ts.
 */
import type { DbClient, UUID, Page } from '@/shared/types';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type { Ticket, TicketStatus } from '../domain/types';

export interface TicketStatusPatch {
  status:                   TicketStatus;
  submittedAt?:             Date | null;
  approvedAt?:              Date | null;
  assignedAt?:              Date | null;
  startedAt?:               Date | null;
  completedAt?:             Date | null;
  closedAt?:                Date | null;
  canceledAt?:              Date | null;
  rejectionReason?:         string | null;
  rejectedAt?:              Date | null;
  assignedPartyChiefId?:    UUID | null;
  assignedInstrumentManId?: UUID | null;
  surveyLeadId?:            UUID | null;
  surveySuperintendentId?:  UUID | null;
  surveyManagerId?:         UUID | null;
  pendingFieldStatus?:      Ticket['pendingFieldStatus'];
  pendingFieldReason?:      string | null;
  pendingFieldInitiatedBy?: UUID | null;
  delayedReason?:           string | null;
  cancelReason?:            string | null;
  cancelInitiatedBy?:       UUID | null;
  cancelInitiatedAt?:       Date | null;
  cancelInitiatorRole?:     string | null;
  cancelApprovedBy?:       UUID | null;
  priority?:                Ticket['priority'];
  prioritySetBy?:           UUID | null;
  prioritySetReason?:       string | null;
  departmentId?:           UUID | null;
  ticketNumber?:           string | null;
  ticketType?:             Ticket['ticketType'];
  aorNodeId?:              UUID | null;
  craft?:                  string | null;
  description?:            string | null;
  requestedDate?:          Date | null;
  draftLastSavedAt?:       Date | null;
  draftDeletedAt?:         Date | null;
  draftDeletedReason?:     Ticket['draftDeletedReason'];
  priorityElevatedBy?:      UUID | null;
  priorityElevatedReason?:  string | null;
}

/**
 * Role-based visibility options for list/findById queries.
 * The repository applies the correct filter based on the actor's role.
 */
export interface VisibilityScope {
  actorId:   UUID;
  actorRole: ProjectRole | TenantRole;
  /** The actor's company_id — used for SUBCONTRACTOR isolation on top of role scoping. */
  companyId: UUID;
  companyType: 'GC' | 'SUBCONTRACTOR' | 'OWNER_REP';
  /** Assigned AOR nodes and descendants for AOR-scoped roles. */
  aorNodeIds?: UUID[];
  /**
   * The Party Chief ID the actor reports to — required for INSTRUMENT_MAN role
   * so the repository can filter to that Party Chief's tickets.
   */
  partyChiefId?: UUID;
}

export interface ListTicketsOptions {
  projectId:         UUID;
  visibility:        VisibilityScope;
  limit:             number;
  offset:            number;
}

export interface ITicketRepository {
  /** Return the build only for an active project in this tenant. */
  findActiveProjectCrewBuild(db: DbClient, tenantId: UUID, projectId: UUID):
    Promise<'FULL' | 'MEDIUM' | 'SLIM' | null>;
  /** Validate that an assignee has the required role on this tenant's project. */
  isProjectAssignee(
    db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID,
    role: 'PARTY_CHIEF' | 'INSTRUMENT_MAN' | 'CAD_TECHNICIAN' | 'CAD_LEAD',
  ): Promise<boolean>;
  /** Returns null if ticket doesn't exist or actor cannot see it under visibility rules. */
  findById(db: DbClient, tenantId: UUID, ticketId: UUID, visibility: VisibilityScope): Promise<Ticket | null>;

  /**
   * Internal fetch bypassing visibility scoping — for use cases that need a ticket
   * before they can enforce RBAC (e.g. performTransition, submitTicket, elevateToPrority).
   * RBAC is always enforced separately by the use case; do not call from route handlers.
   */
  findByIdInternal(db: DbClient, tenantId: UUID, ticketId: UUID): Promise<Ticket | null>;

  /** Insert a new ticket row. Does NOT insert cad_work — caller handles that. */
  save(db: DbClient, ticket: Ticket): Promise<void>;

  /** Insert the cad_work row (created alongside every new ticket). */
  saveCadWork(db: DbClient, ticketId: UUID, tenantId: UUID): Promise<void>;

  /**
   * Atomically claim the next sequence number for a project.
   * Uses INSERT ... ON CONFLICT DO UPDATE RETURNING.
   * Must be called inside a transaction.
   */
  nextSequence(db: DbClient, projectId: UUID): Promise<number>;

  /** Validate all creation relationships and return the AOR code for numbering. */
  findCreationAorCode(db: DbClient, params: {
    tenantId: UUID; projectId: UUID; aorNodeId: UUID;
    companyId: UUID; requesterId: UUID;
    allowRetired?: boolean;
  }): Promise<string | null>;
  findRejectedParent(db: DbClient, tenantId: UUID, projectId: UUID,
    requesterId: UUID, parentTicketId: UUID): Promise<Ticket | null>;
  isDraftOwnerAllowed(db: DbClient, tenantId: UUID, projectId: UUID,
    requesterId: UUID, companyId: UUID): Promise<boolean>;
  listDrafts(db: DbClient, tenantId: UUID, requesterId: UUID,
    limit: number, offset: number): Promise<Page<Ticket>>;
  listDeletedDrafts(db: DbClient, tenantId: UUID, projectId: UUID,
    actorId: UUID, limit: number, offset: number): Promise<Page<Ticket>>;
  findStaleDraftsForExpiry(db: DbClient, tenantId: UUID, limit: number): Promise<Ticket[]>;
  findDraftsForPurge(db: DbClient, tenantId: UUID, limit: number): Promise<Ticket[]>;
  purgeDraft(db: DbClient, tenantId: UUID, ticketId: UUID): Promise<void>;
  resolveCreationDepartment(db: DbClient, params: {
    tenantId: UUID; projectId: UUID; requesterId: UUID; selectedDepartmentId?: UUID;
  }): Promise<{ departmentId: UUID; priority: Ticket['priority'] } | null>;

  /** Patch ticket status + associated timestamp / field changes. */
  patchTicket(db: DbClient, tenantId: UUID, ticketId: UUID, patch: TicketStatusPatch): Promise<void>;

  /** Paginated list, always scoped to tenantId + visibility rules. */
  list(db: DbClient, tenantId: UUID, opts: ListTicketsOptions): Promise<Page<Ticket>>;

  /** Look up the company_id and company type for a user (for visibility scoping). */
  findUserCompanyInfo(
    db: DbClient, tenantId: UUID, userId: UUID,
  ): Promise<{ companyId: UUID; companyType: 'GC' | 'SUBCONTRACTOR' | 'OWNER_REP' } | null>;

  /** Look up the email of a user (for whitelist check at ticket creation). */
  findUserEmail(db: DbClient, tenantId: UUID, userId: UUID): Promise<string | null>;

  /**
   * Find the Party Chief assigned to an Instrument Man on a project.
   * Used for INSTRUMENT_MAN visibility scoping.
   */
  findPartyChiefForInstrumentMan(
    db: DbClient, tenantId: UUID, projectId: UUID, instrumentManId: UUID,
  ): Promise<UUID | null>;

  /**
   * Find assigned AOR nodes and descendants for an AOR-scoped user.
   */
  findAorNodeIdsForUser(
    db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID,
  ): Promise<UUID[]>;
  /** Include retired ticket nodes when checking an active survey role's AOR. */
  isAorNodeInSurveyRoleScope(db: DbClient, tenantId: UUID,
    projectId: UUID, userId: UUID, aorNodeId: UUID,
    role: 'SURVEY_SUPERINTENDENT' | 'PARTY_CHIEF'): Promise<boolean>;
  findResponsibleSuperintendent(db: DbClient, tenantId: UUID, projectId: UUID,
    aorNodeId: UUID): Promise<UUID | null>;
}
