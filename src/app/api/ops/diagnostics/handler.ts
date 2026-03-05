import { NextResponse, type NextRequest } from 'next/server';
import { ForbiddenError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getTenantRole } from '@/lib/get-tenant-role';
import { logInfo } from '@/lib/observability';
import type { UUID } from '@/shared/types';

interface CountRow {
  count: string;
}

interface JobRunRow {
  id: string;
  job_name: string;
  status: 'STARTED' | 'SUCCEEDED' | 'FAILED';
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
  details: unknown;
}

export interface OpsDiagnosticsDeps {
  requireAuth: typeof requireAuth;
  getTenantRole: typeof getTenantRole;
  countStaleSubmitted: (tenantId: UUID) => Promise<number>;
  countStalePcApproval: (tenantId: UUID) => Promise<number>;
  countDelayedActive: (tenantId: UUID) => Promise<number>;
  countApproverTimeoutCandidates: (tenantId: UUID) => Promise<number>;
  countVacancyEscalations: (tenantId: UUID) => Promise<number>;
  countOrphanWorkflowCandidates: (tenantId: UUID) => Promise<number>;
  countIdempotencyLedger24h: (tenantId: UUID) => Promise<number>;
  listRecentJobRuns: (tenantId: UUID) => Promise<JobRunRow[]>;
  listRecentJobFailures: (tenantId: UUID) => Promise<JobRunRow[]>;
}

const defaultDeps: OpsDiagnosticsDeps = {
  requireAuth,
  getTenantRole,
  countStaleSubmitted: async (tenantId) => {
    const { rows } = await pool.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM tickets t
       JOIN projects p
         ON p.id = t.project_id
        AND p.tenant_id = t.tenant_id
       WHERE t.tenant_id = $1
         AND p.status = 'ACTIVE'
         AND t.status = 'SUBMITTED'
         AND t.submitted_at IS NOT NULL
         AND NOW() - t.submitted_at > interval '24 hours'`,
      [tenantId],
    );
    return Number(rows[0]?.count ?? '0');
  },
  countStalePcApproval: async (tenantId) => {
    const { rows } = await pool.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM tickets t
       JOIN projects p
         ON p.id = t.project_id
        AND p.tenant_id = t.tenant_id
       WHERE t.tenant_id = $1
         AND p.status = 'ACTIVE'
         AND t.status = 'PENDING_PC_APPROVAL'
         AND NOW() - t.updated_at > interval '4 hours'`,
      [tenantId],
    );
    return Number(rows[0]?.count ?? '0');
  },
  countDelayedActive: async (tenantId) => {
    const { rows } = await pool.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM tickets t
       JOIN projects p
         ON p.id = t.project_id
        AND p.tenant_id = t.tenant_id
       WHERE t.tenant_id = $1
         AND p.status = 'ACTIVE'
         AND t.status = 'DELAYED'`,
      [tenantId],
    );
    return Number(rows[0]?.count ?? '0');
  },
  countApproverTimeoutCandidates: async (tenantId) => {
    const { rows } = await pool.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM tickets t
       JOIN projects p
         ON p.id = t.project_id
        AND p.tenant_id = t.tenant_id
       WHERE t.tenant_id = $1
         AND p.status = 'ACTIVE'
         AND t.status = 'SUBMITTED'
         AND t.submitted_at IS NOT NULL
         AND NOW() - t.submitted_at >= interval '18 hours'`,
      [tenantId],
    );
    return Number(rows[0]?.count ?? '0');
  },
  countVacancyEscalations: async (tenantId) => {
    const { rows } = await pool.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM acting_grants ag
       JOIN projects p
         ON p.id = ag.project_id
        AND p.tenant_id = ag.tenant_id
       WHERE ag.tenant_id = $1
         AND p.status = 'ACTIVE'
         AND ag.revoked_at IS NULL
         AND ag.role IN ('SURVEY_MANAGER', 'PARTY_CHIEF', 'INSTRUMENT_MAN')
         AND NOW() - ag.created_at >= CASE
           WHEN ag.role = 'SURVEY_MANAGER' THEN interval '24 hours'
           ELSE interval '48 hours'
         END`,
      [tenantId],
    );
    return Number(rows[0]?.count ?? '0');
  },
  countOrphanWorkflowCandidates: async (tenantId) => {
    const { rows } = await pool.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM tickets t
       JOIN projects p
         ON p.id = t.project_id
        AND p.tenant_id = t.tenant_id
       LEFT JOIN users pc
         ON pc.id = t.assigned_party_chief_id
        AND pc.tenant_id = t.tenant_id
       LEFT JOIN users im
         ON im.id = t.assigned_instrument_man_id
        AND im.tenant_id = t.tenant_id
       LEFT JOIN users sl
         ON sl.id = t.survey_lead_id
        AND sl.tenant_id = t.tenant_id
       WHERE t.tenant_id = $1
         AND p.status = 'ACTIVE'
         AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'PENDING_PC_APPROVAL', 'DELAYED')
         AND (
           (t.assigned_party_chief_id IS NOT NULL AND pc.deactivated_at IS NOT NULL) OR
           (t.assigned_instrument_man_id IS NOT NULL AND im.deactivated_at IS NOT NULL) OR
           (t.survey_lead_id IS NOT NULL AND sl.deactivated_at IS NOT NULL)
         )`,
      [tenantId],
    );
    return Number(rows[0]?.count ?? '0');
  },
  countIdempotencyLedger24h: async (tenantId) => {
    const { rows } = await pool.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM api_idempotency
       WHERE tenant_id = $1
         AND created_at >= NOW() - interval '24 hours'`,
      [tenantId],
    );
    return Number(rows[0]?.count ?? '0');
  },
  listRecentJobRuns: async (tenantId) => {
    const { rows } = await pool.query<JobRunRow>(
      `SELECT id, job_name, status, started_at::text, finished_at::text, error_message, details
       FROM background_job_runs
       WHERE tenant_id = $1 OR tenant_id IS NULL
       ORDER BY started_at DESC
       LIMIT 20`,
      [tenantId],
    );
    return rows;
  },
  listRecentJobFailures: async (tenantId) => {
    const { rows } = await pool.query<JobRunRow>(
      `SELECT id, job_name, status, started_at::text, finished_at::text, error_message, details
       FROM background_job_runs
       WHERE (tenant_id = $1 OR tenant_id IS NULL)
         AND status = 'FAILED'
       ORDER BY started_at DESC
       LIMIT 20`,
      [tenantId],
    );
    return rows;
  },
};

export async function handleGetOpsDiagnostics(
  req: NextRequest,
  deps: OpsDiagnosticsDeps = defaultDeps,
) {
  try {
    const auth = deps.requireAuth(req);
    const tenantRole = await deps.getTenantRole(pool, auth.tenantId, auth.userId, auth.sessionVersion);
    if (tenantRole !== 'TENANT_ADMIN') {
      throw new ForbiddenError('Only TENANT_ADMIN can access operational diagnostics');
    }

    const [
      staleSubmittedCount,
      stalePcApprovalCount,
      delayedActiveCount,
      approverTimeoutCandidates,
      vacancyEscalations,
      orphanWorkflowCandidates,
      idempotencyLedger24h,
      recentJobRuns,
      recentJobFailures,
    ] = await Promise.all([
      deps.countStaleSubmitted(auth.tenantId),
      deps.countStalePcApproval(auth.tenantId),
      deps.countDelayedActive(auth.tenantId),
      deps.countApproverTimeoutCandidates(auth.tenantId),
      deps.countVacancyEscalations(auth.tenantId),
      deps.countOrphanWorkflowCandidates(auth.tenantId),
      deps.countIdempotencyLedger24h(auth.tenantId),
      deps.listRecentJobRuns(auth.tenantId),
      deps.listRecentJobFailures(auth.tenantId),
    ]);

    logInfo('Operational diagnostics queried', {
      eventType: 'ops.diagnostics.read',
      tenantId: auth.tenantId,
      actorId: auth.userId,
      ticketId: null,
      stale_submitted: staleSubmittedCount,
      stale_pc_approval: stalePcApprovalCount,
    });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      workflowHealth: {
        staleSubmittedCount,
        stalePcApprovalCount,
        delayedActiveCount,
      },
      notificationBacklog: {
        approverTimeoutCandidates,
        vacancyEscalations,
      },
      hardeningMetrics: {
        orphanWorkflowCandidates,
        idempotencyLedger24h,
      },
      jobRuns: {
        recent: recentJobRuns,
        failures: recentJobFailures,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
