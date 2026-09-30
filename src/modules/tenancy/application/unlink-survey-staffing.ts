import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { authorizeStaffingMutation, type StaffingActor, type SurveyStaffingRepository } from './save-survey-staffing';

export type StaffingLinkKind = 'roster' | 'reporting' | 'area';
export interface StaffingUnlinkInput {
  action: 'unlink'; kind: StaffingLinkKind; linkId: UUID; partyChiefId: UUID;
  expectedSnapshot: string; confirmUnlink: true;
}
export interface StaffingLink {
  id: UUID; partyChiefId: UUID; instrumentManId?: UUID; superintendentId?: UUID;
  areaId?: UUID; departmentId?: UUID | null;
}
export interface SurveyStaffingUnlinkRepository extends SurveyStaffingRepository {
  lockLink(db: DbClient, tenantId: UUID, projectId: UUID, chiefId: UUID, kind: StaffingLinkKind, linkId: UUID): Promise<StaffingLink | null>;
  hasDependentReporting(db: DbClient, tenantId: UUID, projectId: UUID, chiefId: UUID, areaId: UUID): Promise<boolean>;
  deactivateLink(db: DbClient, tenantId: UUID, projectId: UUID, chiefId: UUID, kind: StaffingLinkKind, linkId: UUID): Promise<boolean>;
}

/** Caller owns the transaction. No ticket, role, account or protected-grant writes. */
export async function unlinkSurveyStaffing(repo: SurveyStaffingUnlinkRepository, db: DbClient, actor: StaffingActor & { input: StaffingUnlinkInput }) {
  const { tenantId, projectId, actorId, input } = actor;
  await authorizeStaffingMutation(repo, db, actor);
  await repo.lockSubjects(db, tenantId, projectId, [input.partyChiefId]);
  const assertSnapshot = async () => {
    if (await repo.snapshot(db, tenantId, projectId) !== input.expectedSnapshot) {
      throw new ConflictError('Project staffing changed; reload current assignments before unlinking', 'STALE_STAFFING');
    }
  };
  await assertSnapshot();
  const chief = await repo.member(db, tenantId, projectId, input.partyChiefId);
  if (chief?.role !== 'PARTY_CHIEF') throw new ValidationError('Choose an active project Party Chief');
  const link = await repo.lockLink(db, tenantId, projectId, input.partyChiefId, input.kind, input.linkId);
  if (!link) throw new NotFoundError('Current staffing link not found for this Party Chief');
  if (input.kind === 'area') {
    if (link.departmentId !== null) throw new ConflictError('Department Area assignments remain administration-managed');
    if (await repo.hasDependentReporting(db, tenantId, projectId, input.partyChiefId, link.areaId!)) {
      throw new ConflictError('Unlink or replace the dependent Superintendent reporting link before removing this Area', 'DEPENDENT_REPORTING');
    }
  }
  await assertSnapshot();
  if (!await repo.deactivateLink(db, tenantId, projectId, input.partyChiefId, input.kind, input.linkId)) {
    throw new ConflictError('The selected link is no longer current; reload staffing', 'STALE_STAFFING');
  }
  await repo.record(db, tenantId, projectId, actorId, { action: 'unlink', kind: input.kind, linkId: input.linkId,
    partyChiefId: input.partyChiefId, previousLink: link, roleChanges: [] });
  return { changed: true };
}
