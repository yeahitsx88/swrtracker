/**
 * GET  /api/project-templates
 * POST /api/project-templates
 * Both require TENANT_ADMIN.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getTenantRole } from '@/lib/get-tenant-role';
import { listProjectTemplates } from '@/modules/tenancy/application/list-project-templates';
import { createProjectTemplate } from '@/modules/tenancy/application/project-templates';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { CrewBuild } from '@/modules/tenancy/domain/types';

export const dynamic = 'force-dynamic';

const VALID_CREW_BUILDS: CrewBuild[] = ['FULL', 'MEDIUM', 'SLIM'];

export interface ProjectTemplatesRouteDeps {
  requireAuth: typeof requireAuth;
  getTenantRole: typeof getTenantRole;
  createRepo: () => ITenancyRepository;
}

const defaultDeps: ProjectTemplatesRouteDeps = {
  requireAuth,
  getTenantRole,
  createRepo: () => new TenancyRepository(),
};

export async function handleGetProjectTemplates(
  req: NextRequest,
  deps: ProjectTemplatesRouteDeps = defaultDeps,
) {
  try {
    const auth = deps.requireAuth(req);
    const actorRole = await deps.getTenantRole(pool, auth.tenantId, auth.userId, auth.sessionVersion);
    const repo = deps.createRepo();
    const templates = await listProjectTemplates(repo, pool, {
      tenantId: auth.tenantId,
      actorRole,
    });

    return NextResponse.json({ templates });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function handlePostProjectTemplates(
  req: NextRequest,
  deps: ProjectTemplatesRouteDeps = defaultDeps,
) {
  try {
    const auth = deps.requireAuth(req);
    const body = await req.json() as Record<string, unknown>;
    if (
      !body ||
      typeof body !== 'object' ||
      typeof body.name !== 'string' ||
      typeof body.crewBuild !== 'string' ||
      !VALID_CREW_BUILDS.includes(body.crewBuild as CrewBuild) ||
      typeof body.aorDepth !== 'number' ||
      !Array.isArray(body.aorLevelLabels) ||
      !body.aorLevelLabels.every((label) => typeof label === 'string') ||
      !Array.isArray(body.disciplineGroups) ||
      !body.disciplineGroups.every((group) => typeof group === 'string')
    ) {
      throw new ValidationError(
        'name, crewBuild, aorDepth, aorLevelLabels[], and disciplineGroups[] are required',
      );
    }

    const actorRole = await deps.getTenantRole(pool, auth.tenantId, auth.userId, auth.sessionVersion);
    const repo = deps.createRepo();
    const template = await createProjectTemplate(repo, pool, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      actorRole,
      name: body.name,
      crewBuild: body.crewBuild as CrewBuild,
      aorDepth: body.aorDepth,
      aorLevelLabels: body.aorLevelLabels as string[],
      disciplineGroups: body.disciplineGroups as string[],
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(req: NextRequest) {
  return handleGetProjectTemplates(req);
}

export async function POST(req: NextRequest) {
  return handlePostProjectTemplates(req);
}
