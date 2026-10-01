import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireActiveAuth as requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getTenantRole } from '@/lib/get-tenant-role';
import { createProject } from '@/modules/tenancy/application/create-project';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { CrewBuild } from '@/modules/tenancy/domain/types';
import type { UUID } from '@/shared/types';


export interface ProjectCreateDeps { requireAuth: typeof requireAuth; getTenantRole: typeof getTenantRole; repo: import('@/modules/tenancy/application/ports').ITenancyRepository; db: import('@/shared/types').DbClient }
const defaults:ProjectCreateDeps={requireAuth,getTenantRole,repo:new TenancyRepository(),db:pool};

const VALID_CREW_BUILDS: CrewBuild[] = ['FULL', 'MEDIUM', 'SLIM'];

export async function handlePostProject(req: NextRequest, deps:ProjectCreateDeps=defaults) {
  try {
    const auth = await deps.requireAuth(req);
    const body = await req.json() as unknown;

    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).name !== 'string' ||
        (
          (body as Record<string, unknown>).crewBuild !== undefined &&
          (
            typeof (body as Record<string, unknown>).crewBuild !== 'string' ||
            !VALID_CREW_BUILDS.includes((body as Record<string, unknown>).crewBuild as CrewBuild)
          )
        ) ||
        (
          (body as Record<string, unknown>).templateId !== undefined &&
          (body as Record<string, unknown>).templateId !== null &&
          typeof (body as Record<string, unknown>).templateId !== 'string'
        )) {
      throw new ValidationError('name is required; crewBuild must be FULL|MEDIUM|SLIM; templateId must be a string when provided');
    }

    const {
      name,
      crewBuild,
      templateId,
    } = body as { name: string; crewBuild?: CrewBuild; templateId?: string | null };
    const actorRole = await deps.getTenantRole(deps.db, auth.tenantId, auth.userId, auth.sessionVersion);
    const repo = deps.repo;
    const project = await createProject(repo, deps.db, {
      tenantId: auth.tenantId,
      name,
      actorRole,
      crewBuild,
      templateId: templateId ? templateId as UUID : null,
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
