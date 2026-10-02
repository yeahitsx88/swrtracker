import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';
import { coordinateAuthenticatedMutation } from '@/lib/tenant-lifecycle-lock';
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth, requireActiveAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { withTransaction } from '@/lib/with-transaction';
import { getProjectRole } from '@/lib/get-project-role';
import { getTenantRole } from '@/lib/get-tenant-role';
import {
  getProjectRequestConfig,
  updateProjectRequestConfig,
} from '@/modules/tenancy/application/project-request-config';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type { DbClient, UUID } from '@/shared/types';

export interface ProjectRequestConfigRouteDeps {
  requireAuth: typeof requireAuth | typeof requireActiveAuth;
  getProjectRole: typeof getProjectRole;
  getTenantRole: typeof getTenantRole;
  createRepo: () => TenancyRepository;
  withTransaction: typeof withTransaction;
}

const defaultDeps: ProjectRequestConfigRouteDeps = {
  requireAuth: requireActiveAuth,
  getProjectRole,
  getTenantRole,
  createRepo: () => new TenancyRepository(),
  withTransaction,
};

async function resolveActorRoles(
  deps: ProjectRequestConfigRouteDeps,
  tenantId: UUID,
  projectId: UUID,
  userId: UUID,
  sessionVersion?: number,
  db: DbClient = pool,
): Promise<{ tenantRole: TenantRole | null; projectRole: ProjectRole | null }> {
  const tenantRole = await deps.getTenantRole(db, tenantId, userId, sessionVersion);
  if (tenantRole === 'TENANT_ADMIN') {
    return { tenantRole, projectRole: null };
  }

  const projectRole = await deps.getProjectRole(db, tenantId, projectId, userId, sessionVersion);
  return { tenantRole, projectRole };
}

export async function handleGetProjectRequestConfig(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
  deps: ProjectRequestConfigRouteDeps = defaultDeps,
) {
  try {
    const auth = await deps.requireAuth(req);
    const { projectId } = await params;
    const projectUuid = projectId as UUID;

    await resolveActorRoles(
      deps,
      auth.tenantId,
      projectUuid,
      auth.userId,
      auth.sessionVersion,
    );

    const repo = deps.createRepo();
    const config = await getProjectRequestConfig(repo, pool, {
      tenantId: auth.tenantId,
      projectId: projectUuid,
    });

    return NextResponse.json({ config });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function handlePatchProjectRequestConfig(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
  deps: ProjectRequestConfigRouteDeps = defaultDeps,
) {
  try {
    const auth = await deps.requireAuth(req);
    const { projectId } = await params;
    const projectUuid = projectId as UUID;
    const body = await req.json() as Record<string, unknown>;

    if (
      !body ||
      typeof body !== 'object' ||
      typeof body.leadTimeEnforcementEnabled !== 'boolean' ||
      typeof body.leadTimeDays !== 'number'
      || !(body.maxAttachmentsPerTicket === null || typeof body.maxAttachmentsPerTicket === 'number')
    ) {
      throw new ValidationError('leadTimeEnforcementEnabled, leadTimeDays, and maxAttachmentsPerTicket are required');
    }

    const repo = deps.createRepo();
    const config = await deps.withTransaction(async (client) => {
      await coordinateAuthenticatedMutation(client, req, auth, 'EXCLUSIVE', deps.requireAuth);
      const { tenantRole, projectRole } = await resolveActorRoles(
      deps,
      auth.tenantId,
      projectUuid,
      auth.userId,
      auth.sessionVersion,
      client,
      );

      const changed = await updateProjectRequestConfig(repo, client, {
        tenantId: auth.tenantId,
        projectId: projectUuid,
        actorProjectRole: projectRole,
        actorTenantRole: tenantRole,
        leadTimeEnforcementEnabled: body.leadTimeEnforcementEnabled as boolean,
        leadTimeDays: body.leadTimeDays as number,
        maxAttachmentsPerTicket: body.maxAttachmentsPerTicket as number | null,
      });
      await appendAdministrativeEvent(client, {
        auth, projectId: projectId as UUID, subjectUserId: null,
        eventType: 'project.configuration_changed', authorityEvidence: { tenantRole, projectRole },
        changes: { resource: 'REQUEST_CONFIG', result: changed },
      });
      return changed;
    });

    return NextResponse.json({ config });
  } catch (err) {
    return errorResponse(err);
  }
}
