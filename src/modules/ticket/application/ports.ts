/**
 * Repository ports for the Ticket module.
 * Implemented by infrastructure/ticket.repository.ts.
 */
import type { DbClient, UUID, Page } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { PendingPcOutcome, Ticket, TicketPriority, TicketStatus } from '../domain/types';
import type { ProjectStatus } from '@/modules/tenancy/domain/types';
import type { ProjectLeadTimeConfig } from '../domain/lead-time-policy';

export interface TicketStatusPatch {
  status:                   TicketStatus;
  departmentId?:            UUID | null;
  ticketNumber?:            string | null;
  submittedAt?:             Date | null;
  approvedAt?:              Date | null;
  assignedAt?:              Date | null;
  startedAt?:               Date | null;
  pendingPcOutcome?:        PendingPcOutcome | null;
  pendingPcReason?:         string | null;
  surveyCancelRequestedBy?: UUID | null;
  surveyCancelRequestedRole?: string | null;
  surveyCancelReason?:      string | null;
  surveyCancelRequestedAt?: Date | null;
  completedAt?:             Date | null;
  closedAt?:                Date | null;
  rejectionReason?:         string | null;
  assignedPartyChiefId?:    UUID | null;
  assignedInstrumentManId?: UUID | null;
  surveyLeadId?:            UUID | null;
  priority?:                TicketPriority;
  prioritySetBy?:           UUID | null;
  prioritySetReason?:       string | null;
}

export interface PatchTicketOptions {
  expectedStatus?: TicketStatus;
  expectedRowVersion?: number;
}

/**
 * Role-based visibility options for list/findById queries.
 * The repository applies the correct filter based on the actor's role.
 */
export interface VisibilityScope {
  actorId:   UUID;
  actorRole: ProjectRole;
  /** The actor's project department membership, when visibility depends on department tags. */
  departmentId?: UUID;
  /** The actor's company_id — used for SUBCONTRACTOR isolation on top of role scoping. */
  companyId: UUID;
  /** The actor's company type — SUBCONTRACTOR triggers company-level isolation. */
  companyType?: string;
  /** AOR node IDs the actor may see — includes descendants for AOR-scoped roles. */
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

  /** Fetch the AOR node code string for ticket number generation. */
  findAorNodeCode(db: DbClient, tenantId: UUID, aorNodeId: UUID): Promise<string | null>;
  findDepartmentById(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
    departmentId: UUID,
  ): Promise<{ id: UUID } | null>;
  findRequesterDepartmentMembership(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
    requesterId: UUID,
  ): Promise<{ departmentId: UUID; title: string | null } | null>;
  findDepartmentTitlePriority(
    db: DbClient,
    tenantId: UUID,
    departmentId: UUID,
    title: string,
  ): Promise<TicketPriority | null>;
  isEmailWhitelisted(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
    email: string,
  ): Promise<boolean>;

  /** Patch ticket status + associated timestamp / field changes. */
  patchTicket(
    db: DbClient,
    tenantId: UUID,
    ticketId: UUID,
    patch: TicketStatusPatch,
    options?: PatchTicketOptions,
  ): Promise<void>;

  /** Paginated list, always scoped to tenantId + visibility rules. */
  list(db: DbClient, tenantId: UUID, opts: ListTicketsOptions): Promise<Page<Ticket>>;

  /** Look up the company_id and company type for a user (for visibility scoping). */
  findUserCompanyInfo(
    db: DbClient, tenantId: UUID, userId: UUID,
  ): Promise<{ companyId: UUID; companyType: string } | null>;

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
   * Find all AOR node IDs assigned to a user, including descendants.
   * Used for AOR-scoped visibility.
   */
  findAorNodeIdsForUser(
    db: DbClient, projectId: UUID, userId: UUID,
  ): Promise<UUID[]>;

  findProjectStatus(db: DbClient, tenantId: UUID, projectId: UUID): Promise<ProjectStatus | null>;
  findProjectLeadTimeConfig?(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
  ): Promise<ProjectLeadTimeConfig | null>;
}
