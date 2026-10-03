import { coordinateAuthenticatedMutation } from '@/lib/tenant-lifecycle-lock';
import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';
import { withTransaction } from '@/lib/with-transaction';
import { NextResponse, type NextRequest } from 'next/server';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { readJsonBody } from '@/lib/read-json-body';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { errorResponse } from '@/lib/api-error';
import { requireActiveAuth as requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getTenantRole } from '@/lib/get-tenant-role';
import { createProject } from '@/modules/tenancy/application/create-project';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { CrewBuild } from '@/modules/tenancy/domain/types';
import type { UUID } from '@/shared/types';


export interface ProjectCreateDeps { requireAuth: typeof requireAuth; getTenantRole: typeof getTenantRole; repo: import('@/modules/tenancy/application/ports').ITenancyRepository; db: import('@/shared/types').DbClient; withTransaction: typeof withTransaction }
const defaults:ProjectCreateDeps={requireAuth,getTenantRole,repo:new TenancyRepository(),db:pool,withTransaction};

const VALID_CREW_BUILDS: CrewBuild[] = ['FULL', 'MEDIUM', 'SLIM'];

export async function handlePostProject(req: NextRequest, deps:ProjectCreateDeps=defaults) {
  try {
    const auth = await deps.requireAuth(req);
    const body = await readJsonBody(req);
    // Optional for existing clients; the UI always supplies a retained command key.
    const key = req.headers.has('idempotency-key') ? requireIdempotencyKey(req) : null;

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
    const result = await deps.withTransaction(async (client) => {
      await coordinateAuthenticatedMutation(client, req, auth, 'EXCLUSIVE', deps.requireAuth);
      const actorRole = await deps.getTenantRole(client, auth.tenantId, auth.userId, auth.sessionVersion);
      // Current authority is required even when returning a recorded result.
      if (actorRole !== 'TENANT_ADMIN') throw new ForbiddenError('Only TENANT_ADMIN can create projects');
      const repo = deps.repo;
      const mutation = async () => {
      const project = await createProject(repo, client, {
      tenantId: auth.tenantId,
      name,
      actorRole,
      crewBuild,
      templateId: templateId ? templateId as UUID : null,
    });
      await appendAdministrativeEvent(client, {
        auth, projectId: project.id, subjectUserId: null,
        eventType: 'project.created', authorityEvidence: { actorRole },
        changes: { result: project },
      });
      return {status:201,body:{project}};
      };
      return key ? executeIdempotentHttpMutation(client, {
        tenantId:auth.tenantId,actorId:auth.userId,endpoint:'POST /api/projects',idempotencyKey:key,
      }, body, mutation) : mutation();
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return errorResponse(err);
  }
}
