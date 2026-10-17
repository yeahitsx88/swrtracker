import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { errorResponse } from '@/lib/api-error';
import { requireAuth, requireActiveAuth } from '@/lib/auth';
import { getProjectRole } from '@/lib/get-project-role';
import {acquireTenantLifecycleLock,assertMutationIdentity} from '@/lib/tenant-lifecycle-lock';
import { withTransaction } from '@/lib/with-transaction';
import { authorizeStaffingMutation, readStaffingSnapshot, saveSurveyStaffing, type SurveyStaffingInput, type SurveyStaffingRepository } from '@/modules/tenancy/application/save-survey-staffing';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { SurveyStaffingPgRepository } from '@/modules/tenancy/infrastructure/survey-staffing.repository';
import { readSurveyStaffing, type SurveyStaffingReadRepository } from '@/modules/tenancy/application/read-survey-staffing';
import { unlinkSurveyStaffing, type StaffingUnlinkInput, type SurveyStaffingUnlinkRepository } from '@/modules/tenancy/application/unlink-survey-staffing';

type TransactionRunner = <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;
export interface StaffingDeps {
  requireAuth: typeof requireAuth | typeof requireActiveAuth;
  getProjectRole: typeof getProjectRole;
  withTransaction: TransactionRunner;
  repo: SurveyStaffingRepository & SurveyStaffingReadRepository;
  executeIdempotent: typeof executeIdempotentHttpMutation;
}

export async function handlePatchSurveyStaffing(req: NextRequest, { params }: { params: Promise<{ projectId: string }> },
  deps: StaffingDeps & { repo: SurveyStaffingUnlinkRepository & SurveyStaffingReadRepository } = { ...defaults, repo: new SurveyStaffingPgRepository() }) {
  try {
    const auth = await deps.requireAuth(req);
    const { projectId } = await params;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(projectId)) throw new ValidationError('Project must be a valid ID');
    let value: unknown;
    try { value = await req.json(); } catch { throw new ValidationError('A valid JSON body is required'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('A confirmed staffing unlink is required');
    const body = value as Record<string, unknown>;
    if (Object.keys(body).some(key => !['action','kind','linkId','partyChiefId','expectedSnapshot','confirmUnlink'].includes(key)) ||
      body.action !== 'unlink' || !['roster','reporting','area'].includes(body.kind as string) || body.confirmUnlink !== true ||
      typeof body.linkId !== 'string' || !uuid.test(body.linkId) || typeof body.partyChiefId !== 'string' || !uuid.test(body.partyChiefId) ||
      typeof body.expectedSnapshot !== 'string' || !/^[a-f0-9]{32}$/.test(body.expectedSnapshot)) {
      throw new ValidationError('Choose one current link, its Party Chief and snapshot, and confirm unlinking');
    }
    const input = body as unknown as StaffingUnlinkInput;
    const idempotencyKey = requireIdempotencyKey(req);
    const result = await deps.withTransaction(async db => {
      await acquireTenantLifecycleLock(db,auth.tenantId,'EXCLUSIVE');
      assertMutationIdentity(await deps.requireAuth(req,db),auth);
      const actorRole = await deps.getProjectRole(db, auth.tenantId, projectId as UUID, auth.userId, auth.sessionVersion);
      const actor = { tenantId: auth.tenantId, projectId: projectId as UUID, actorId: auth.userId, actorRole, sessionVersion: auth.sessionVersion };
      await authorizeStaffingMutation(deps.repo, db, actor);
      return deps.executeIdempotent(db, { tenantId: actor.tenantId, actorId: actor.actorId,
        endpoint: `PATCH:/api/projects/${actor.projectId}/survey/staffing`, idempotencyKey }, input,
        async () => ({ status: 200, body: { success: true, ...await unlinkSurveyStaffing(deps.repo, db, { ...actor, input }) } }));
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) { return errorResponse(error); }
}
const defaults: StaffingDeps = { requireAuth: requireActiveAuth, getProjectRole, withTransaction, repo: new SurveyStaffingPgRepository(), executeIdempotent: executeIdempotentHttpMutation };

export async function handleGetSurveyStaffing(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }, deps: StaffingDeps = defaults) {
  try {
    const auth = await deps.requireAuth(req);
    const { projectId } = await params;
    const values = req.nextUrl.searchParams;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) throw new ValidationError('Project must be a valid ID');
    if (values.get('mode') === 'snapshot' && [...values.keys()].length === 1) {
      const snapshot = await deps.withTransaction(async db => {
        const actorRole = await deps.getProjectRole(db, auth.tenantId, projectId as UUID, auth.userId, auth.sessionVersion);
        return readStaffingSnapshot(deps.repo, db, { tenantId: auth.tenantId, projectId: projectId as UUID,
          actorId: auth.userId, actorRole, sessionVersion: auth.sessionVersion });
      });
      return NextResponse.json(snapshot);
    }
    for (const key of values.keys()) {
      if (!['partyChiefId','search','limit','offset'].includes(key) || values.getAll(key).length !== 1) {
        throw new ValidationError('Use only one value for each supported staffing filter');
      }
    }
    const rawLimit = values.get('limit') ?? '25', rawOffset = values.get('offset') ?? '0';
    if (!/^\d+$/.test(rawLimit) || !/^\d+$/.test(rawOffset)) throw new ValidationError('Use valid numeric staffing pagination');
    const result = await deps.withTransaction(async db => {
      const actorRole = await deps.getProjectRole(db, auth.tenantId, projectId as UUID, auth.userId, auth.sessionVersion);
      return readSurveyStaffing(deps.repo, db, { tenantId: auth.tenantId, projectId: projectId as UUID, actorRole,
        partyChiefId: (values.get('partyChiefId') ?? '') as UUID,
        query: { search: (values.get('search') ?? '').trim(), limit: Number(rawLimit), offset: Number(rawOffset) } });
    });
    return NextResponse.json({ staffing: result });
  } catch (error) { return errorResponse(error); }
}

function parseInput(value: unknown): SurveyStaffingInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('Staffing details are required');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['expectedSnapshot','partyChiefId','areaId','superintendentId','instrumentManIds','confirmRoleChanges'].includes(key)) ||
      typeof body.expectedSnapshot !== 'string' || !/^[a-f0-9]{32}$/.test(body.expectedSnapshot) ||
      typeof body.partyChiefId !== 'string' || typeof body.areaId !== 'string' ||
      (body.superintendentId !== null && body.superintendentId !== undefined && typeof body.superintendentId !== 'string') ||
      !Array.isArray(body.instrumentManIds) || !body.instrumentManIds.every(id => typeof id === 'string') ||
      typeof body.confirmRoleChanges !== 'boolean') {
    throw new ValidationError('Party Chief, Area, Superintendent and Instrument Man selections are invalid');
  }
  return {
    expectedSnapshot: body.expectedSnapshot,
    partyChiefId: body.partyChiefId as UUID,
    areaId: body.areaId as UUID,
    superintendentId: (body.superintendentId ?? null) as UUID | null,
    instrumentManIds: [...body.instrumentManIds as UUID[]].sort(),
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
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) throw new ValidationError('Project must be a valid ID');
    let value: unknown;
    try { value = await req.json(); } catch { throw new ValidationError('A valid JSON body is required'); }
    const input = parseInput(value);
    const idempotencyKey = requireIdempotencyKey(req);
    const result = await deps.withTransaction(async db => {
      await acquireTenantLifecycleLock(db,auth.tenantId,'EXCLUSIVE');
      assertMutationIdentity(await deps.requireAuth(req,db),auth);
      const actorRole = await deps.getProjectRole(db, auth.tenantId, projectId as UUID, auth.userId, auth.sessionVersion);
      const actor = { tenantId: auth.tenantId, projectId: projectId as UUID, actorId: auth.userId, actorRole, sessionVersion: auth.sessionVersion };
      await authorizeStaffingMutation(deps.repo, db, actor);
      return deps.executeIdempotent(db, { tenantId: actor.tenantId, actorId: actor.actorId,
        endpoint: `POST:/api/projects/${actor.projectId}/survey/staffing`, idempotencyKey }, input,
        async () => ({ status: 200, body: { success: true, ...await saveSurveyStaffing(deps.repo, db, { ...actor, input }) } }));
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return errorResponse(error);
  }
}
