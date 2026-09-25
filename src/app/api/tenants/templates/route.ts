import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { requireTenantAdmin } from '@/lib/get-tenant-role';
import { parseUuid } from '@/lib/parse-uuid';
import { withTransaction } from '@/lib/with-transaction';
import type { CrewBuild } from '@/modules/tenancy/domain/project-readiness';
import {
  createProjectTemplate, deleteProjectTemplate,
  listProjectTemplates, updateProjectTemplate,
} from '@/modules/tenancy/application/project-templates';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';

export const dynamic = 'force-dynamic';

function templateInput(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const input = body as Record<string, unknown>;
  if (typeof input.name !== 'string' ||
      !['FULL', 'MEDIUM', 'SLIM'].includes(String(input.crewBuild)) ||
      !Array.isArray(input.aorLevelLabels) ||
      !input.aorLevelLabels.every((value) => typeof value === 'string') ||
      !Array.isArray(input.departmentNames) ||
      !input.departmentNames.every((value) => typeof value === 'string')) {
    throw new ValidationError('name, crewBuild, aorLevelLabels, and departmentNames are required');
  }
  return { name: input.name, crewBuild: input.crewBuild as CrewBuild,
    aorLevelLabels: input.aorLevelLabels as string[],
    departmentNames: input.departmentNames as string[] };
}

function requiredTemplateId(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      typeof (body as Record<string, unknown>).templateId !== 'string') {
    throw new ValidationError('templateId must be a UUID');
  }
  return parseUuid((body as { templateId: string }).templateId, 'templateId');
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const actorRole = await requireTenantAdmin(pool, auth.tenantId, auth.userId);
    const limit = Number(req.nextUrl.searchParams.get('limit') ?? '50');
    const offset = Number(req.nextUrl.searchParams.get('offset') ?? '0');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
        !Number.isSafeInteger(offset) || offset < 0) {
      throw new ValidationError('limit must be 1-100 and offset must be nonnegative');
    }
    const result = await listProjectTemplates(new TenancyRepository(), pool,
      { tenantId: auth.tenantId, actorRole, limit, offset });
    return NextResponse.json({ data: result.templates, total: result.total,
      limit, offset });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const actorRole = await requireTenantAdmin(pool, auth.tenantId, auth.userId);
    const input = templateInput(await req.json() as unknown);
    const template = await withTransaction((db) => createProjectTemplate(
      new TenancyRepository(), db,
      { tenantId: auth.tenantId, actorId: auth.userId, actorRole, ...input },
    ));
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const actorRole = await requireTenantAdmin(pool, auth.tenantId, auth.userId);
    const body = await req.json() as unknown;
    const templateId = requiredTemplateId(body);
    const input = templateInput(body);
    const template = await withTransaction((db) => updateProjectTemplate(
      new TenancyRepository(), db,
      { tenantId: auth.tenantId, actorId: auth.userId,
        actorRole, templateId, ...input },
    ));
    return NextResponse.json({ template });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const actorRole = await requireTenantAdmin(pool, auth.tenantId, auth.userId);
    const templateId = requiredTemplateId(await req.json() as unknown);
    await withTransaction((db) => deleteProjectTemplate(new TenancyRepository(), db,
      { tenantId: auth.tenantId, actorId: auth.userId, actorRole, templateId }));
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
