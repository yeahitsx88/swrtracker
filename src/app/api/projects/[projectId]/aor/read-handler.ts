import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getProjectRole } from '@/lib/get-project-role';
import type { UUID } from '@/shared/types';

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

export interface AorReadRouteDeps {
  requireAuth: typeof requireAuth;
  getProjectRole: typeof getProjectRole;
  queryLevels: (tenantId: UUID, projectId: UUID) => Promise<AorLevelRow[]>;
  queryNodes: (tenantId: UUID, projectId: UUID) => Promise<AorNodeRow[]>;
}

const defaultAorReadDeps: AorReadRouteDeps = {
  requireAuth,
  getProjectRole,
  queryLevels: async (tenantId, projectId) => {
    const levelsResult = await pool.query<AorLevelRow>(
      `SELECT id, depth, label
       FROM aor_levels
       WHERE tenant_id = $1
         AND project_id = $2
       ORDER BY depth ASC`,
      [tenantId, projectId],
    );
    return levelsResult.rows;
  },
  queryNodes: async (tenantId, projectId) => {
    const nodesResult = await pool.query<AorNodeRow>(
      `SELECT id, level_id, parent_id, name, code
       FROM aor_nodes
       WHERE tenant_id = $1
         AND project_id = $2
         AND retired_at IS NULL
       ORDER BY name ASC`,
      [tenantId, projectId],
    );
    return nodesResult.rows;
  },
};

export async function handleGetAor(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
  deps: AorReadRouteDeps = defaultAorReadDeps,
) {
  try {
    const auth = deps.requireAuth(req);
    const { projectId } = await params;
    const projectUuid = projectId as UUID;

    await deps.getProjectRole(pool, auth.tenantId, projectUuid, auth.userId);

    const levels = await deps.queryLevels(auth.tenantId, projectUuid);
    const nodes = await deps.queryNodes(auth.tenantId, projectUuid);

    return NextResponse.json({
      levels: levels.map((level) => ({
        id: level.id,
        depth: level.depth,
        label: level.label,
      })),
      nodes: nodes.map((node) => ({
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
