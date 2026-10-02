import { coordinateAuthenticatedMutation } from '@/lib/tenant-lifecycle-lock';
import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';
import { withTransaction } from '@/lib/with-transaction';
/**
 * PATCH /api/project-templates/[templateId]
 * DELETE /api/project-templates/[templateId]
 * Both require TENANT_ADMIN.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireActiveAuth as requireAuth } from '@/lib/auth';
import { getTenantRole } from '@/lib/get-tenant-role';
import {
  deleteProjectTemplate,
  updateProjectTemplate,
} from '@/modules/tenancy/application/project-templates';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { CrewBuild } from '@/modules/tenancy/domain/types';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

const VALID_CREW_BUILDS: CrewBuild[] = ['FULL', 'MEDIUM', 'SLIM'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const { templateId } = await params;
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

    const template = await withTransaction(async (client) => {
      await coordinateAuthenticatedMutation(client, req, auth, 'EXCLUSIVE', requireAuth);
      const actorRole = await getTenantRole(client, auth.tenantId, auth.userId, auth.sessionVersion);
      const repo = new TenancyRepository();
      const template = await updateProjectTemplate(repo, client, {
      tenantId: auth.tenantId,
      templateId: templateId as UUID,
      actorRole,
      name: body.name as string,
      crewBuild: body.crewBuild as CrewBuild,
      aorDepth: body.aorDepth as number,
      aorLevelLabels: body.aorLevelLabels as string[],
      disciplineGroups: body.disciplineGroups as string[],
    });

      await appendAdministrativeEvent(client, {
        auth, projectId: null, subjectUserId: null,
        eventType: 'tenant.template_updated', authorityEvidence: { actorRole },
        changes: { result: template },
      });
      return template;
    });
    return NextResponse.json({ template });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const { templateId } = await params;
    await withTransaction(async (client) => {
      await coordinateAuthenticatedMutation(client, req, auth, 'EXCLUSIVE', requireAuth);
      const actorRole = await getTenantRole(client, auth.tenantId, auth.userId, auth.sessionVersion);
      const repo = new TenancyRepository();
      await deleteProjectTemplate(repo, client, {
      tenantId: auth.tenantId,
      templateId: templateId as UUID,
      actorRole,
    });
      await appendAdministrativeEvent(client, {
        auth, projectId: null, subjectUserId: null,
        eventType: 'tenant.template_deleted', authorityEvidence: { actorRole },
        changes: { templateId },
      });
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
