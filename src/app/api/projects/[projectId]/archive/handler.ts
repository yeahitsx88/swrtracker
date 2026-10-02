import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';
import { coordinateAuthenticatedMutation } from '@/lib/tenant-lifecycle-lock';
import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { requireAuth, requireActiveAuth } from '@/lib/auth';
import { getTenantRole } from '@/lib/get-tenant-role';
import { withTransaction } from '@/lib/with-transaction';
import { archiveProject } from '@/modules/tenancy/application/archive-project';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { DbClient, UUID } from '@/shared/types';

type TransactionRunner = <T>(fn: (client: DbClient) => Promise<T>) => Promise<T>;

export interface ProjectArchiveRouteDeps {
  requireAuth: typeof requireAuth | typeof requireActiveAuth;
  getTenantRole: typeof getTenantRole;
  createRepo: () => ITenancyRepository;
  withTransaction: TransactionRunner;
}

const defaultDeps: ProjectArchiveRouteDeps = {
  requireAuth: requireActiveAuth,
  getTenantRole,
  createRepo: () => new TenancyRepository(),
  withTransaction,
};

export async function handlePostProjectArchive(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
  deps: ProjectArchiveRouteDeps = defaultDeps,
) {
  try {
    const auth = await deps.requireAuth(req);
    const { projectId } = await params;
    const repo = deps.createRepo();

    const project = await deps.withTransaction(async (client) => {
      await coordinateAuthenticatedMutation(client, req, auth, 'EXCLUSIVE', deps.requireAuth);
      const actorRole = await deps.getTenantRole(client, auth.tenantId, auth.userId, auth.sessionVersion);
      const changed = await archiveProject(repo, client, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        actorId: auth.userId,
        actorRole,
      });
      await appendAdministrativeEvent(client, {
        auth, projectId: projectId as UUID, subjectUserId: null,
        eventType: 'project.archived', authorityEvidence: { actorRole },
        changes: { resource: 'ARCHIVE', result: changed },
      });
      return changed;
    });

    return NextResponse.json({ project });
  } catch (err) {
    return errorResponse(err);
  }
}
