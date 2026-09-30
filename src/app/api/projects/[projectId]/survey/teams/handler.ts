import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { errorResponse } from '@/lib/api-error';
import { requireAuth, requireActiveAuth } from '@/lib/auth';
import { getProjectRole } from '@/lib/get-project-role';
import { withTransaction } from '@/lib/with-transaction';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { authorizeTeamMutation, deactivateSurveyTeam, readSurveyTeams, readTeamPersonnel, saveSurveyTeam,
  type SaveSurveyTeamInput, type TeamActor, type TeamPageQuery } from '@/modules/tenancy/application/survey-teams';
import { SurveyTeamsPgRepository } from '@/modules/tenancy/infrastructure/survey-teams.repository';
import { changeSurveyRole, type ChangeSurveyRoleInput, type ManagedSurveyRole, type SurveyRoleRepository } from '@/modules/tenancy/application/change-survey-role';
import type { ProjectRole } from '@/modules/identity/domain/types';

type TransactionRunner = <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;
type Context = { params: Promise<{ projectId: string }> };
export interface TeamDeps {
  requireAuth: typeof requireAuth | typeof requireActiveAuth;
  getProjectRole: typeof getProjectRole;
  withTransaction: TransactionRunner;
  repo: SurveyRoleRepository;
  executeIdempotent: typeof executeIdempotentHttpMutation;
}
const defaults: TeamDeps = { requireAuth: requireActiveAuth, getProjectRole, withTransaction, repo: new SurveyTeamsPgRepository(), executeIdempotent: executeIdempotentHttpMutation };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(value: unknown, label: string): UUID {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new ValidationError(`${label} must be a valid ID`);
  return value.toLowerCase() as UUID;
}
function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new ValidationError('The current team version is required');
  return value as number;
}
async function body(req: NextRequest): Promise<Record<string, unknown>> {
  let value: unknown;
  try { value = await req.json(); } catch { throw new ValidationError('A valid JSON body is required'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('Team details are required');
  return value as Record<string, unknown>;
}
export function parseTeamInput(value: Record<string, unknown>): SaveSurveyTeamInput {
  const teamId = value.teamId == null ? null : uuid(value.teamId, 'Team');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(value.name)) {
    throw new ValidationError('Team name must contain 1–80 characters without control characters');
  }
  if (!Array.isArray(value.memberIds) || value.memberIds.length < 1 || value.memberIds.length > 100) {
    throw new ValidationError('Select between 1 and 100 team members');
  }
  const memberIds = value.memberIds.map(id => uuid(id, 'Member'));
  if (new Set(memberIds).size !== memberIds.length) throw new ValidationError('Each team member may be selected only once');
  if (!teamId && value.expectedVersion != null) throw new ValidationError('A new team must not specify an existing version');
  return { teamId, expectedVersion: teamId ? version(value.expectedVersion) : null, name: value.name.trim(),
    areaId: uuid(value.areaId, 'Area'), leadUserId: uuid(value.leadUserId, 'Team lead'), memberIds };
}
export function parseSurveyRoleInput(value: Record<string, unknown>): ChangeSurveyRoleInput {
  const targets = ['SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN','REQUESTER'];
  const sources = [...targets,'VIEWER'];
  if (value.action !== 'set-role' || typeof value.role !== 'string' || !targets.includes(value.role) ||
      typeof value.expectedRole !== 'string' || !sources.includes(value.expectedRole) || typeof value.confirmRoleChanges !== 'boolean') {
    throw new ValidationError('Select a supported survey role, its current role and an explicit role-change confirmation');
  }
  return { userId: uuid(value.userId, 'Person'), role: value.role as ManagedSurveyRole, expectedRole: value.expectedRole as ProjectRole,
    expectedRoleVersion: version(value.expectedRoleVersion), confirmRoleChanges: value.confirmRoleChanges };
}
export function parseTeamPage(req: NextRequest): TeamPageQuery {
  const values = req.nextUrl.searchParams;
  const search = (values.get('search') ?? '').trim();
  const rawLimit = values.get('limit') ?? '25', rawOffset = values.get('offset') ?? '0';
  if (!/^\d+$/.test(rawLimit) || ![10,25,50,100].includes(Number(rawLimit)) ||
      !/^\d+$/.test(rawOffset) || !Number.isSafeInteger(Number(rawOffset)) || Number(rawOffset) > 1000000 || search.length > 120) {
    throw new ValidationError('Use a page size of 10, 25, 50 or 100, a valid offset and search up to 120 characters');
  }
  return { search, limit: Number(rawLimit), offset: Number(rawOffset) };
}

async function transact<T>(req: NextRequest, ctx: Context, deps: TeamDeps, fn: (db: DbClient, actor: TeamActor) => Promise<T>) {
  const auth = await deps.requireAuth(req);
  const projectId = uuid((await ctx.params).projectId, 'Project');
  return deps.withTransaction(async db => {
    const actorRole = await deps.getProjectRole(db, auth.tenantId, projectId, auth.userId, auth.sessionVersion);
    return fn(db, { tenantId: auth.tenantId, projectId, actorId: auth.userId, actorRole, sessionVersion: auth.sessionVersion });
  });
}

export async function handleGetSurveyTeams(req: NextRequest, ctx: Context, deps: TeamDeps = defaults) {
  try {
    const query = parseTeamPage(req);
    const mode = req.nextUrl.searchParams.get('mode') ?? 'teams';
    if (mode !== 'teams' && mode !== 'personnel') throw new ValidationError('Unknown Team Management view');
    const rawId = req.nextUrl.searchParams.get('teamId');
    const teamId = rawId === null ? undefined : uuid(rawId, 'Team');
    if (mode === 'personnel' && teamId) throw new ValidationError('Team detail and personnel pages are separate views');
    const result = await transact(req, ctx, deps, async (db, actor) => {
      if (mode === 'personnel') return readTeamPersonnel(deps.repo, db, actor, query);
      return readSurveyTeams(deps.repo, db, actor, query, teamId);
    });
    return NextResponse.json(result);
  } catch (error) { return errorResponse(error); }
}

export async function handlePostSurveyTeam(req: NextRequest, ctx: Context, deps: TeamDeps = defaults) {
  try {
    const input = parseTeamInput(await body(req));
    const idempotencyKey = requireIdempotencyKey(req);
    const result = await transact(req, ctx, deps, async (db, actor) => {
      await authorizeTeamMutation(deps.repo, db, actor);
      return deps.executeIdempotent(db, { tenantId: actor.tenantId, actorId: actor.actorId,
        endpoint: `POST:/api/projects/${actor.projectId}/survey/teams`, idempotencyKey }, input,
        async () => ({ status: input.teamId ? 200 : 201, body: await saveSurveyTeam(deps.repo, db, actor, input) }));
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) { return errorResponse(error); }
}

export async function handleDeleteSurveyTeam(req: NextRequest, ctx: Context, deps: TeamDeps = defaults) {
  try {
    const value = await body(req);
    if (value.confirmDelete !== true) throw new ValidationError('Confirm team deletion; personnel and request history will be retained');
    const teamId = uuid(value.teamId, 'Team'), expectedVersion = version(value.expectedVersion);
    const idempotencyKey = requireIdempotencyKey(req);
    const result = await transact(req, ctx, deps, async (db, actor) => {
      await authorizeTeamMutation(deps.repo, db, actor);
      return deps.executeIdempotent(db, { tenantId: actor.tenantId, actorId: actor.actorId,
        endpoint: `DELETE:/api/projects/${actor.projectId}/survey/teams`, idempotencyKey }, { teamId, expectedVersion, confirmDelete: true },
        async () => ({ status: 200, body: await deactivateSurveyTeam(deps.repo, db, actor, teamId, expectedVersion) }));
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) { return errorResponse(error); }
}

export async function handlePatchSurveyRole(req: NextRequest, ctx: Context, deps: TeamDeps = defaults) {
  try {
    const input = parseSurveyRoleInput(await body(req));
    const idempotencyKey = requireIdempotencyKey(req);
    const result = await transact(req, ctx, deps, async (db, actor) => {
      await authorizeTeamMutation(deps.repo, db, actor);
      return deps.executeIdempotent(db, { tenantId: actor.tenantId, actorId: actor.actorId,
        endpoint: `PATCH:/api/projects/${actor.projectId}/survey/teams`, idempotencyKey }, { action: 'set-role', ...input },
        async () => ({ status: 200, body: await changeSurveyRole(deps.repo, db, actor, input) }));
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) { return errorResponse(error); }
}
