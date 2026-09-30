import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { errorResponse } from '@/lib/api-error';
import { requireAuth, requireActiveAuth } from '@/lib/auth';
import { getProjectRole } from '@/lib/get-project-role';
import { withTransaction } from '@/lib/with-transaction';
import { saveSurveyStaffing, type SurveyStaffingInput, type SurveyStaffingRepository } from '@/modules/tenancy/application/save-survey-staffing';
import { SurveyStaffingPgRepository } from '@/modules/tenancy/infrastructure/survey-staffing.repository';

type TransactionRunner = <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;
export interface StaffingDeps {
  requireAuth: typeof requireAuth | typeof requireActiveAuth;
  getProjectRole: typeof getProjectRole;
  withTransaction: TransactionRunner;
  repo: SurveyStaffingRepository;
}
const defaults: StaffingDeps = { requireAuth: requireActiveAuth, getProjectRole, withTransaction, repo: new SurveyStaffingPgRepository() };

function parseInput(value: unknown): SurveyStaffingInput {
  if (!value || typeof value !== 'object') throw new ValidationError('Staffing details are required');
  const body = value as Record<string, unknown>;
  if (typeof body.partyChiefId !== 'string' || typeof body.areaId !== 'string' ||
      (body.superintendentId !== null && body.superintendentId !== undefined && typeof body.superintendentId !== 'string') ||
      !Array.isArray(body.instrumentManIds) || !body.instrumentManIds.every(id => typeof id === 'string') ||
      typeof body.confirmRoleChanges !== 'boolean') {
    throw new ValidationError('Party Chief, Area, Superintendent and Instrument Man selections are invalid');
  }
  return {
    partyChiefId: body.partyChiefId as UUID,
    areaId: body.areaId as UUID,
    superintendentId: (body.superintendentId ?? null) as UUID | null,
    instrumentManIds: body.instrumentManIds as UUID[],
    confirmRoleChanges: body.confirmRoleChanges,
  };
}

export async function handlePostSurveyStaffing(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
  deps: StaffingDeps = defaults,
) {
  try {
    const auth = await deps.requireAuth(req);
    const { projectId } = await params;
    const input = parseInput(await req.json());
    const result = await deps.withTransaction(async db => {
      const actorRole = await deps.getProjectRole(db, auth.tenantId, projectId as UUID, auth.userId, auth.sessionVersion);
      return saveSurveyStaffing(deps.repo, db, {
        tenantId: auth.tenantId, projectId: projectId as UUID, actorId: auth.userId, actorRole, input,
      });
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
