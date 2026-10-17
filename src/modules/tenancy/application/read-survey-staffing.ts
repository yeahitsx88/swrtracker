import type { DbClient, Page, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';

export interface StaffingPerson {
  userId: UUID; name: string; email: string; role: ProjectRole | null; active: boolean;
  rosterLinkId?: UUID;
}
export interface StaffingArea { id: UUID; name: string; retired: boolean; individualAssignmentId?: UUID | null }
export interface StaffingReadQuery { search: string; limit: number; offset: number }
export interface SurveyStaffingDetail {
  snapshotToken: string;
  partyChief: StaffingPerson;
  reporting: { id: UUID; superintendent: StaffingPerson; area: StaffingArea; assignedAt: string } | null;
  areas: { data: StaffingArea[]; total: number; limit: number; truncated: boolean };
  instrumentMen: Page<StaffingPerson>;
  instrumentManTotal: number;
}
export interface SurveyStaffingReadRepository {
  readStaffing(db: DbClient, tenantId: UUID, projectId: UUID, partyChiefId: UUID, query: StaffingReadQuery): Promise<SurveyStaffingDetail | null>;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Explicit current grants only. Named teams and ticket snapshots never establish reporting authority. */
export async function readSurveyStaffing(repo: SurveyStaffingReadRepository, db: DbClient, params: {
  tenantId: UUID; projectId: UUID; actorRole: ProjectRole; partyChiefId: UUID; query: StaffingReadQuery;
}): Promise<SurveyStaffingDetail> {
  if (params.actorRole !== 'SURVEY_MANAGER') throw new ForbiddenError('Only the Survey Manager can review staffing assignments');
  const { query } = params;
  if (!uuidPattern.test(params.projectId) || !uuidPattern.test(params.partyChiefId) ||
      typeof query.search !== 'string' || query.search.length > 120 || /[\u0000-\u001f\u007f]/.test(query.search) ||
      ![10,25,50,100].includes(query.limit) || !Number.isSafeInteger(query.offset) || query.offset < 0 || query.offset > 1000000) {
    throw new ValidationError('Choose a valid Party Chief, page size of 10, 25, 50 or 100, offset and search up to 120 characters');
  }
  const detail = await repo.readStaffing(db, params.tenantId, params.projectId, params.partyChiefId, query);
  if (!detail) throw new NotFoundError('Active project Party Chief not found');
  return detail;
}
