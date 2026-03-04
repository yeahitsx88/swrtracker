/**
 * POST /api/projects/[projectId]/aor
 *
 * Phase 2 AOR setup surface:
 * - kind=LEVEL creates an AOR level
 * - kind=NODE creates an AOR node
 *
 * Current route authorization is PROJECT_ADMIN-only because the workspace does
 * not currently expose a tenant-admin role resolver.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getProjectRole } from '@/lib/get-project-role';
import { getTenantRole } from '@/lib/get-tenant-role';
import { withTransaction } from '@/lib/with-transaction';
import { createAorLevel } from '@/modules/tenancy/application/create-aor-level';
import { createAorNode } from '@/modules/tenancy/application/create-aor-node';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { DbClient, UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

export type ProjectSetupActorRole = 'PROJECT_ADMIN' | 'TENANT_ADMIN';

export async function resolveProjectSetupActorRole(
  db: DbClient,
  tenantId: UUID,
  projectId: UUID,
  userId: UUID,
): Promise<ProjectSetupActorRole> {
  const tenantRole = await getTenantRole(db, tenantId, userId);
  const actorRole =
    tenantRole === 'TENANT_ADMIN'
      ? 'TENANT_ADMIN'
      : await getProjectRole(db, tenantId, projectId, userId);
  if (actorRole !== 'PROJECT_ADMIN' && actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only PROJECT_ADMIN or TENANT_ADMIN may manage the AOR setup surface');
  }
  return actorRole;
}

export async function assertProjectSetupMutable(
  db: DbClient,
  tenantId: UUID,
  projectId: UUID,
): Promise<void> {
  const project = await new TenancyRepository().findProjectById(db, tenantId, projectId);
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  if (project.status === 'ACTIVE') {
    throw new ConflictError('Project setup is locked after activation');
  }
  if (project.status === 'ARCHIVED') {
    throw new ConflictError('Archived projects are read-only');
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = requireAuth(req);
    const { projectId } = await params;
    const body = await req.json() as Record<string, unknown>;

    if (!body || typeof body !== 'object' || typeof body.kind !== 'string') {
      throw new ValidationError('kind is required');
    }

    const actorRole = await resolveProjectSetupActorRole(
      pool,
      auth.tenantId,
      projectId as UUID,
      auth.userId,
    );
    await assertProjectSetupMutable(pool, auth.tenantId, projectId as UUID);

    const repo = new TenancyRepository();

    if (body.kind === 'LEVEL') {
      if (typeof body.depth !== 'number' || typeof body.label !== 'string') {
        throw new ValidationError('LEVEL requires depth and label');
      }

      const { depth, label } = body as { depth: number; label: string };

      const level = await withTransaction((client) =>
        createAorLevel(repo, client, {
          tenantId: auth.tenantId,
          projectId: projectId as UUID,
          depth,
          label,
          actorRole,
        }),
      );

      return NextResponse.json({ level }, { status: 201 });
    }

    if (body.kind === 'NODE') {
      if (
        typeof body.levelId !== 'string' ||
        typeof body.name !== 'string' ||
        typeof body.code !== 'string' ||
        (
          body.parentId !== undefined &&
          body.parentId !== null &&
          typeof body.parentId !== 'string'
        )
      ) {
        throw new ValidationError('NODE requires levelId, name, code, and optional parentId');
      }

      const {
        levelId,
        parentId,
        name,
        code,
      } = body as { levelId: string; parentId?: string | null; name: string; code: string };

      const node = await withTransaction((client) =>
        createAorNode(repo, client, {
          tenantId: auth.tenantId,
          projectId: projectId as UUID,
          levelId: levelId as UUID,
          parentId: (parentId ?? null) as UUID | null,
          name,
          code,
          actorRole,
        }),
      );

      return NextResponse.json({ node }, { status: 201 });
    }

    throw new ValidationError('kind must be LEVEL or NODE');
  } catch (err) {
    return errorResponse(err);
  }
}

interface AorLevelRow {
  id: string;
  depth: number;
  label: string;
}

interface AorNodeRow {
  id: string;
  level_id: string;
  parent_id: string | null;
  name: string;
  code: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = requireAuth(req);
    const { projectId } = await params;

    // Membership gate only; visibility details stay in backend ticket queries.
    await getProjectRole(pool, auth.tenantId, projectId as UUID, auth.userId);

    const levelsResult = await pool.query<AorLevelRow>(
      `SELECT id, depth, label
       FROM aor_levels
       WHERE tenant_id = $1
         AND project_id = $2
       ORDER BY depth ASC`,
      [auth.tenantId, projectId],
    );

    const nodesResult = await pool.query<AorNodeRow>(
      `SELECT id, level_id, parent_id, name, code
       FROM aor_nodes
       WHERE tenant_id = $1
         AND project_id = $2
         AND retired_at IS NULL
       ORDER BY name ASC`,
      [auth.tenantId, projectId],
    );

    return NextResponse.json({
      levels: levelsResult.rows.map((level) => ({
        id: level.id,
        depth: level.depth,
        label: level.label,
      })),
      nodes: nodesResult.rows.map((node) => ({
        id: node.id,
        levelId: node.level_id,
        parentId: node.parent_id,
        name: node.name,
        code: node.code,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
