/**
 * PATCH /api/project-templates/[templateId]
 * DELETE /api/project-templates/[templateId]
 * Both require TENANT_ADMIN.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
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
    const auth = requireAuth(req);
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

    const actorRole = await getTenantRole(pool, auth.tenantId, auth.userId, auth.sessionVersion);
    const repo = new TenancyRepository();
    const template = await updateProjectTemplate(repo, pool, {
      tenantId: auth.tenantId,
      templateId: templateId as UUID,
      actorRole,
      name: body.name,
      crewBuild: body.crewBuild as CrewBuild,
      aorDepth: body.aorDepth,
      aorLevelLabels: body.aorLevelLabels as string[],
      disciplineGroups: body.disciplineGroups as string[],
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
    const auth = requireAuth(req);
    const { templateId } = await params;
    const actorRole = await getTenantRole(pool, auth.tenantId, auth.userId, auth.sessionVersion);
    const repo = new TenancyRepository();
    await deleteProjectTemplate(repo, pool, {
      tenantId: auth.tenantId,
      templateId: templateId as UUID,
      actorRole,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
