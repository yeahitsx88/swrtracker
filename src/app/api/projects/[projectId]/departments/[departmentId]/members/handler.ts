import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';
import { coordinateAuthenticatedMutation } from '@/lib/tenant-lifecycle-lock';
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth, requireActiveAuth } from '@/lib/auth';
import { resolveProjectCapabilities } from '@/lib/project-capabilities';
import { getProjectRole } from '@/lib/get-project-role';
import { getTenantRole } from '@/lib/get-tenant-role';
import { withTransaction } from '@/lib/with-transaction';
import { addDepartmentMember } from '@/modules/tenancy/application/add-department-member';
import { assignDepartmentTitle } from '@/modules/tenancy/application/assign-department-title';
import { reassignDepartmentMember } from '@/modules/tenancy/application/reassign-department-member';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { DbClient, UUID } from '@/shared/types';
import { assertProjectSetupMutable } from '../../../aor/shared';

type TransactionRunner = <T>(fn: (client: DbClient) => Promise<T>) => Promise<T>;
type DepartmentMembershipActorRole = 'TENANT_ADMIN' | ProjectRole;

export interface DepartmentMembersRouteDeps {
  requireAuth: typeof requireAuth | typeof requireActiveAuth;
  resolveActorRole: typeof resolveDepartmentMembershipActorRole;
  assertProjectSetupMutable: typeof assertProjectSetupMutable;
  createRepo: () => ITenancyRepository;
  withTransaction: TransactionRunner;
}

const defaultDeps: DepartmentMembersRouteDeps = {
  requireAuth: requireActiveAuth,
  resolveActorRole: resolveDepartmentMembershipActorRole,
  assertProjectSetupMutable,
  createRepo: () => new TenancyRepository(),
  withTransaction,
};

export async function resolveDepartmentMembershipActorRole(
  db: DbClient,
  tenantId: UUID,
  projectId: UUID,
  userId: UUID,
  sessionVersion?: number,
  titleContext?: {departmentId: UUID; title: string},
): Promise<DepartmentMembershipActorRole> {
  const tenantRole = await getTenantRole(db, tenantId, userId, sessionVersion);
  // Stacked operational roles retain their delegated superintendent-layer powers.
  if (titleContext) {
    const operational = sessionVersion !== undefined
      ? (await resolveProjectCapabilities(db,{tenantId,userId,sessionVersion},projectId)).operationalRole
      : tenantRole === 'TENANT_ADMIN' ? null : await getProjectRole(db,tenantId,projectId,userId,sessionVersion);
    if (operational === 'DEPARTMENT_MANAGER' || operational === 'DEPARTMENT_LEAD') {
      const title = await new TenancyRepository().findDepartmentTitleByName(db,tenantId,titleContext.departmentId,titleContext.title.trim());
      if (title?.assignmentLayer === 'SUPERINTENDENT') return operational;
    }
  }
  if (tenantRole === 'TENANT_ADMIN') return 'TENANT_ADMIN';
  if (sessionVersion !== undefined) {
    const capabilities = await resolveProjectCapabilities(db, {tenantId, userId, sessionVersion}, projectId);
    if (capabilities.canAdminister) return 'PROJECT_ADMIN';
  }
  return getProjectRole(db, tenantId, projectId, userId, sessionVersion);
}

export async function handlePostDepartmentMembers(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; departmentId: string }> },
  deps: DepartmentMembersRouteDeps = defaultDeps,
) {
  try {
    const auth = await deps.requireAuth(req);
    const { projectId, departmentId } = await params;
    const body = await req.json() as Record<string, unknown>;
    if (typeof body.userId !== 'string') {
      throw new ValidationError('userId is required');
    }

    const repo = deps.createRepo();

    const membership = await deps.withTransaction(async (client) => {
      await coordinateAuthenticatedMutation(client, req, auth, 'EXCLUSIVE', deps.requireAuth);
      const actorRole = await deps.resolveActorRole(
        client,
        auth.tenantId,
        projectId as UUID,
        auth.userId,
        auth.sessionVersion,
      );
      await deps.assertProjectSetupMutable(client, auth.tenantId, projectId as UUID);
      const changed = await addDepartmentMember(repo, client, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        departmentId: departmentId as UUID,
        userId: body.userId as UUID,
        actorRole: actorRole as 'PROJECT_ADMIN' | 'TENANT_ADMIN',
      });
      await appendAdministrativeEvent(client, {
        auth, projectId: projectId as UUID, subjectUserId: body.userId as UUID,
        eventType: 'project.configuration_changed', authorityEvidence: { actorRole },
        changes: { resource: 'DEPARTMENT_MEMBER', result: changed },
      });
      return changed;
    });

    return NextResponse.json({ membership }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function handlePatchDepartmentMembers(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; departmentId: string }> },
  deps: DepartmentMembersRouteDeps = defaultDeps,
) {
  try {
    const auth = await deps.requireAuth(req);
    const { projectId, departmentId } = await params;
    const body = await req.json() as Record<string, unknown>;
    if (typeof body.kind !== 'string' || typeof body.userId !== 'string') {
      throw new ValidationError('kind and userId are required');
    }

    const repo = deps.createRepo();

    if (body.kind === 'ASSIGN_TITLE') {
      if (typeof body.title !== 'string') {
        throw new ValidationError('title is required for ASSIGN_TITLE');
      }
      const { title } = body as { title: string };

      const membership = await deps.withTransaction(async (client) => {
        await coordinateAuthenticatedMutation(client, req, auth, 'EXCLUSIVE', deps.requireAuth);
        const actorRole = await deps.resolveActorRole(
        client,
        auth.tenantId,
        projectId as UUID,
        auth.userId,
        auth.sessionVersion,
        {departmentId: departmentId as UUID, title},

      );
        await deps.assertProjectSetupMutable(client, auth.tenantId, projectId as UUID);
        const changed = await assignDepartmentTitle(repo, client, {
          tenantId: auth.tenantId,
          projectId: projectId as UUID,
          departmentId: departmentId as UUID,
          userId: body.userId as UUID,
          title,
          actorId: auth.userId,
          actorRole,
          superintendentId: typeof body.superintendentId === 'string'
          ? body.superintendentId as UUID
          : null,
        });
        await appendAdministrativeEvent(client, {
          auth, projectId: projectId as UUID, subjectUserId: body.userId as UUID,
          eventType: 'project.configuration_changed', authorityEvidence: { actorRole },
          changes: { resource: 'DEPARTMENT_TITLE_ASSIGNMENT', result: changed },
        });
        return changed;
      });
      return NextResponse.json({ membership });
    }

    if (body.kind === 'REASSIGN_MEMBER') {
      const membership = await deps.withTransaction(async (client) => {
        await coordinateAuthenticatedMutation(client, req, auth, 'EXCLUSIVE', deps.requireAuth);
        const actorRole = await deps.resolveActorRole(
        client,
        auth.tenantId,
        projectId as UUID,
        auth.userId,
        auth.sessionVersion,

      );
        await deps.assertProjectSetupMutable(client, auth.tenantId, projectId as UUID);
        const changed = await reassignDepartmentMember(repo, client, {
          tenantId: auth.tenantId,
          projectId: projectId as UUID,
          departmentId: departmentId as UUID,
          userId: body.userId as UUID,
          actorRole: actorRole as 'PROJECT_ADMIN' | 'TENANT_ADMIN',
        });
        await appendAdministrativeEvent(client, {
          auth, projectId: projectId as UUID, subjectUserId: body.userId as UUID,
          eventType: 'project.configuration_changed', authorityEvidence: { actorRole },
          changes: { resource: 'DEPARTMENT_MEMBER_REASSIGNED', result: changed },
        });
        return changed;
      });
      return NextResponse.json({ membership });
    }

    throw new ValidationError('kind must be ASSIGN_TITLE or REASSIGN_MEMBER');
  } catch (err) {
    return errorResponse(err);
  }
}
