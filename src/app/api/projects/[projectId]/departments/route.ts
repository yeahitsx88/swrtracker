import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getProjectConfigRole } from '@/lib/get-project-config-role';
import { parseUuid } from '@/lib/parse-uuid';
import { withTransaction } from '@/lib/with-transaction';
import { createDepartment, listProjectDepartments } from '@/modules/tenancy/application/create-department';
import {
  addDepartmentMember, addDepartmentTitle, assignDepartmentTitle,
} from '@/modules/tenancy/application/manage-department';
import type {
  DepartmentAssignmentLayer, DepartmentPriority,
} from '@/modules/tenancy/domain/types';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest, { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const projectId = parseUuid((await params).projectId, 'projectId');
    const actorRole = await getProjectConfigRole(pool, auth.tenantId, projectId, auth.userId);
    const departments = await listProjectDepartments(new TenancyRepository(), pool, {
      tenantId: auth.tenantId, projectId, actorRole,
    });
    return NextResponse.json({ departments });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  req: NextRequest, { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const projectId = parseUuid((await params).projectId, 'projectId');
    const body = await req.json() as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ValidationError('Department request must be an object');
    }
    const input = body as Record<string, unknown>;
    const actorRole = await getProjectConfigRole(pool, auth.tenantId, projectId, auth.userId);
    if (input.operation === 'addMember') {
      if (typeof input.departmentId !== 'string' || typeof input.userId !== 'string') {
        throw new ValidationError('departmentId and userId are required');
      }
      await withTransaction((client) => addDepartmentMember(new TenancyRepository(), client, {
        tenantId: auth.tenantId, projectId, actorId: auth.userId, actorRole,
        departmentId: parseUuid(input.departmentId as string, 'departmentId'),
        userId: parseUuid(input.userId as string, 'userId'),
      }));
      return NextResponse.json({ added: true }, { status: 201 });
    }
    if (input.operation === 'addTitle') {
      if (typeof input.departmentId !== 'string' || typeof input.title !== 'string' ||
          typeof input.defaultPriority !== 'string' ||
          typeof input.assignmentLayer !== 'string') {
        throw new ValidationError('departmentId, title, defaultPriority, and assignmentLayer are required');
      }
      const title = await withTransaction((client) => addDepartmentTitle(
        new TenancyRepository(), client, {
          tenantId: auth.tenantId, projectId, actorId: auth.userId, actorRole,
          departmentId: parseUuid(input.departmentId as string, 'departmentId'),
          title: input.title as string,
          defaultPriority: input.defaultPriority as DepartmentPriority,
          assignmentLayer: input.assignmentLayer as DepartmentAssignmentLayer,
        },
      ));
      return NextResponse.json({ title }, { status: 201 });
    }
    if (input.operation === 'assignTitle') {
      if (typeof input.departmentId !== 'string' || typeof input.userId !== 'string' ||
          typeof input.title !== 'string') {
        throw new ValidationError('departmentId, userId, and title are required');
      }
      await withTransaction((client) => assignDepartmentTitle(new TenancyRepository(), client, {
        tenantId: auth.tenantId, projectId, actorId: auth.userId, actorRole,
        departmentId: parseUuid(input.departmentId as string, 'departmentId'),
        userId: parseUuid(input.userId as string, 'userId'),
        title: input.title as string,
      }));
      return NextResponse.json({ assigned: true });
    }
    if (input.operation !== undefined && input.operation !== 'create') {
      throw new ValidationError('Unknown department operation');
    }
    if (typeof input.name !== 'string' || typeof input.managerTitle !== 'string' ||
        !Array.isArray(input.aorNodeIds) ||
        input.aorNodeIds.length > 128 ||
        !input.aorNodeIds.every((id) => typeof id === 'string')) {
      throw new ValidationError('name, managerTitle, and aorNodeIds are required');
    }
    const department = await withTransaction((client) => createDepartment(
      new TenancyRepository(), client,
      { tenantId: auth.tenantId, projectId, actorId: auth.userId, actorRole,
        name: input.name as string, managerTitle: input.managerTitle as string,
        aorNodeIds: (input.aorNodeIds as string[]).map(
          (id) => parseUuid(id, 'aorNodeId')) },
    ));
    return NextResponse.json({ department }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
