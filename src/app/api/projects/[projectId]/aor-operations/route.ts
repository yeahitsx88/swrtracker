import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getProjectConfigRole } from '@/lib/get-project-config-role';
import { parseUuid } from '@/lib/parse-uuid';
import { withTransaction } from '@/lib/with-transaction';
import {
  assignAorScope, deactivateCrewRoster, moveAorAssignment,
  retireAorNode, setCrewRoster,
} from '@/modules/tenancy/application/aor-operations';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';

export const dynamic = 'force-dynamic';

function requiredUuid(value: unknown, field: string) {
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a UUID`);
  return parseUuid(value, field);
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
      actorId: auth.userId, actorRole };
    const repo = new TenancyRepository();
    if (input.action === 'retireNode') {
      const nodeId = requiredUuid(input.nodeId, 'nodeId');
      await withTransaction((db) => retireAorNode(repo, db,
        { ...context, nodeId }));
      return NextResponse.json({ retired: true });
    }
    if (input.action === 'assignScope') {
      const nodeId = requiredUuid(input.nodeId, 'nodeId');
      const userId = input.userId === undefined || input.userId === null
        ? null : requiredUuid(input.userId, 'userId');
      const departmentId = input.departmentId === undefined || input.departmentId === null
        ? null : requiredUuid(input.departmentId, 'departmentId');
      const assignmentId = await withTransaction((db) => assignAorScope(repo, db,
        { ...context, nodeId, userId, departmentId }));
      return NextResponse.json({ assignmentId }, { status: 201 });
    }
    if (input.action === 'moveScope') {
      const assignmentId = requiredUuid(input.assignmentId, 'assignmentId');
      const nodeId = requiredUuid(input.nodeId, 'nodeId');
      await withTransaction((db) => moveAorAssignment(repo, db,
        { ...context, assignmentId, nodeId }));
      return NextResponse.json({ moved: true });
    }
    if (input.action === 'setRoster') {
      const partyChiefId = requiredUuid(input.partyChiefId, 'partyChiefId');
      const instrumentManId = requiredUuid(input.instrumentManId, 'instrumentManId');
      const rosterId = await withTransaction((db) => setCrewRoster(repo, db,
        { ...context, partyChiefId, instrumentManId }));
      return NextResponse.json({ rosterId }, { status: 201 });
    }
    if (input.action === 'deactivateRoster') {
      const instrumentManId = requiredUuid(input.instrumentManId, 'instrumentManId');
      await withTransaction((db) => deactivateCrewRoster(repo, db,
        { ...context, instrumentManId }));
      return NextResponse.json({ deactivated: true });
    }
    throw new ValidationError('Unknown AOR or roster action');
  } catch (error) {
    return errorResponse(error);
  }
}
