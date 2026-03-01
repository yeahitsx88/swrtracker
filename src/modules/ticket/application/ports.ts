/**
 * Repository ports for the Ticket module.
 * Implemented by infrastructure/ticket.repository.ts.
 */
import type { DbClient, UUID, Page } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket, TicketStatus } from '../domain/types';

export interface TicketStatusPatch {
  status:                   TicketStatus;
  submittedAt?:             Date | null;
  approvedAt?:              Date | null;
  assignedAt?:              Date | null;
  startedAt?:               Date | null;
  completedAt?:             Date | null;
  closedAt?:                Date | null;
  rejectionReason?:         string | null;
  assignedPartyChiefId?:    UUID | null;
  assignedInstrumentManId?: UUID | null;
  surveyLeadId?:            UUID | null;
  isPriority?:              boolean;
  priorityElevatedBy?:      UUID | null;
  priorityElevatedReason?:  string | null;
}

/**
 * Role-based visibility options for list/findById queries.
 * The repository applies the correct filter based on the actor's role.
 */
export interface VisibilityScope {
  actorId:   UUID;
  actorRole: ProjectRole;
  /** The actor's company_id — used for SUBCONTRACTOR isolation on top of role scoping. */
  companyId: UUID;
  /** Area IDs the actor may see — only required/used for AREA_VIEWER role. */
  areaIds?:  UUID[];
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

  /** Fetch the area code string for ticket number generation. */
  findAreaCode(db: DbClient, tenantId: UUID, areaId: UUID): Promise<string | null>;

  /** Patch ticket status + associated timestamp / field changes. */
  patchTicket(db: DbClient, tenantId: UUID, ticketId: UUID, patch: TicketStatusPatch): Promise<void>;

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
   * Find all area IDs assigned to a user via area_memberships.
   * Used for AREA_VIEWER visibility scoping.
   */
  findAreaIdsForUser(
    db: DbClient, projectId: UUID, userId: UUID,
  ): Promise<UUID[]>;
}
