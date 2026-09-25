import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getProjectConfigRole } from '@/lib/get-project-config-role';
import { parseUuid } from '@/lib/parse-uuid';
import { withTransaction } from '@/lib/with-transaction';
import type {
  DepartmentAssignmentLayer, DepartmentPriority,
} from '@/modules/tenancy/domain/types';
import {
  assignMissingDepartmentManager, reassignDepartmentAor,
  reassignDepartmentTitle, removeDepartmentMember,
  updateDepartmentCatalogTitle,
} from '@/modules/tenancy/application/department-operations';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';

export const dynamic = 'force-dynamic';

function requiredUuid(value: unknown, field: string) {
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a UUID`);
  return parseUuid(value, field);
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string') throw new ValidationError(`${field} must be text`);
  return value;
}

export async function POST(
  req: NextRequest, { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const projectId = parseUuid((await params).projectId, 'projectId');
    const actorRole = await getProjectConfigRole(pool,
      auth.tenantId, projectId, auth.userId);
    const body = await req.json() as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ValidationError('Request body must be an object');
    }
    const input = body as Record<string, unknown>;
    const context = { tenantId: auth.tenantId, projectId,
      actorId: auth.userId, actorRole,
      departmentId: requiredUuid(input.departmentId, 'departmentId') };
    const repo = new TenancyRepository();
    if (input.action === 'reassignTitle') {
      await withTransaction((db) => reassignDepartmentTitle(repo, db,
        { ...context, userId: requiredUuid(input.userId, 'userId'),
          title: requiredText(input.title, 'title') }));
      return NextResponse.json({ reassigned: true });
    }
    if (input.action === 'removeMember') {
      await withTransaction((db) => removeDepartmentMember(repo, db,
        { ...context, userId: requiredUuid(input.userId, 'userId'),
          reason: requiredText(input.reason ?? '', 'reason') }));
      return NextResponse.json({ removed: true });
    }
    if (input.action === 'updateCatalogTitle') {
      const defaultPriority = requiredText(input.defaultPriority, 'defaultPriority');
      const assignmentLayer = requiredText(input.assignmentLayer, 'assignmentLayer');
      if (!['HIGH', 'MED_HIGH', 'MEDIUM', 'NORMAL'].includes(defaultPriority) ||
          !['MANAGER', 'SUPERINTENDENT'].includes(assignmentLayer)) {
        throw new ValidationError('Invalid defaultPriority or assignmentLayer');
      }
      await withTransaction((db) => updateDepartmentCatalogTitle(repo, db,
        { ...context, oldTitle: requiredText(input.oldTitle, 'oldTitle'),
          title: requiredText(input.title, 'title'),
          defaultPriority: defaultPriority as DepartmentPriority,
          assignmentLayer: assignmentLayer as DepartmentAssignmentLayer }));
      return NextResponse.json({ updated: true });
    }
    if (input.action === 'assignManager') {
      await withTransaction((db) => assignMissingDepartmentManager(repo, db,
        { ...context, userId: requiredUuid(input.userId, 'userId') }));
      return NextResponse.json({ assigned: true });
    }
    if (input.action === 'moveAor') {
      await withTransaction((db) => reassignDepartmentAor(repo, db,
        { ...context, assignmentId: requiredUuid(input.assignmentId, 'assignmentId'),
          nodeId: requiredUuid(input.nodeId, 'nodeId') }));
      return NextResponse.json({ moved: true });
    }
    throw new ValidationError('Unknown department action');
  } catch (error) {
    return errorResponse(error);
  }
}
