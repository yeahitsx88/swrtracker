import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveAuth } from '@/lib/auth';
import { getProjectRole } from '@/lib/get-project-role';
import { withTransaction } from '@/lib/with-transaction';
import { errorResponse } from '@/lib/api-error';
import { ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { readSurveyOrganization, type OrganizationReadRepositories } from '@/modules/tenancy/application/read-survey-organization';
import { SurveyTeamsPgRepository } from '@/modules/tenancy/infrastructure/survey-teams.repository';
import { SurveyStaffingPgRepository } from '@/modules/tenancy/infrastructure/survey-staffing.repository';
import { readSuperintendentOrganization, type SuperintendentOrganizationRepository } from '@/modules/tenancy/application/read-superintendent-organization';
import { SuperintendentOrganizationPgRepository } from '@/modules/tenancy/infrastructure/superintendent-organization.repository';
import { SuperintendentAreasPgRepository } from '@/modules/tenancy/infrastructure/superintendent-areas.repository';

export interface OrganizationReadDeps {
  requireAuth: typeof requireActiveAuth;
  getProjectRole: typeof getProjectRole;
  withTransaction: <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;
  repos: OrganizationReadRepositories;
  superintendent?: SuperintendentOrganizationRepository;
}
const defaults: OrganizationReadDeps = { requireAuth: requireActiveAuth, getProjectRole, withTransaction, superintendent: new SuperintendentOrganizationPgRepository(),
  repos: { teams: new SurveyTeamsPgRepository(), staffing: new SurveyStaffingPgRepository(), superintendentAreas: new SuperintendentAreasPgRepository() } };
type Context = { params: Promise<{ projectId: string }> };

export async function handleGetSurveyOrganization(req: NextRequest, { params }: Context, deps: OrganizationReadDeps = defaults) {
  try {
    await deps.requireAuth(req);
    const rawProjectId = (await params).projectId;
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(rawProjectId) || req.nextUrl.searchParams.size) {
      throw new ValidationError('Choose a valid project without additional organization filters');
    }
    const projectId = rawProjectId.toLowerCase() as UUID;
    const result = await deps.withTransaction(async db => {
      // One database snapshot for every bounded existing read, with writes forbidden.
      await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const current = await deps.requireAuth(req, db);
      const actorRole = await deps.getProjectRole(db, current.tenantId, projectId, current.userId, current.sessionVersion);
      if(actorRole==='SURVEY_SUPERINTENDENT'){
        if(!deps.superintendent)throw new Error('Superintendent organization repository required');
        return readSuperintendentOrganization(deps.superintendent,deps.repos.teams,db,{tenantId:current.tenantId,projectId,actorId:current.userId,actorRole,sessionVersion:current.sessionVersion});
      }
      return readSurveyOrganization(deps.repos, db, { tenantId: current.tenantId, projectId, actorId: current.userId, actorRole, sessionVersion: current.sessionVersion }, current);
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
}
