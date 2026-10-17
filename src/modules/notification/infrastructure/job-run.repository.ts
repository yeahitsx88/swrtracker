import type { BackgroundJobRunRepository } from '@/modules/notification/application/worker';
import type { DbClient, UUID } from '@/shared/types';

export class PgBackgroundJobRunRepository implements BackgroundJobRunRepository {
  async startRun(
    db: DbClient,
    params: {
      runId: UUID;
      tenantId?: UUID | null;
      jobName: string;
      details: Record<string, unknown>;
    },
  ): Promise<void> {
    await db.query(
      `INSERT INTO background_job_runs (
         id,
         tenant_id,
         job_name,
         status,
         details,
         started_at
       ) VALUES ($1, $2, $3, 'STARTED', $4, NOW())`,
      [
        params.runId,
        params.tenantId ?? null,
        params.jobName,
        JSON.stringify(params.details),
      ],
    );
  }

  async finishRunSuccess(
    db: DbClient,
    params: {
      runId: UUID;
      details: Record<string, unknown>;
    },
  ): Promise<void> {
    await db.query(
      `UPDATE background_job_runs
       SET status = 'SUCCEEDED',
           details = COALESCE(details, '{}'::jsonb) || $2::jsonb,
           finished_at = NOW(),
           error_message = NULL
       WHERE id = $1`,
      [params.runId, JSON.stringify(params.details)],
    );
  }

  async finishRunFailure(
    db: DbClient,
    params: {
      runId: UUID;
      errorMessage: string;
      details: Record<string, unknown>;
    },
  ): Promise<void> {
    await db.query(
      `UPDATE background_job_runs
       SET status = 'FAILED',
           details = COALESCE(details, '{}'::jsonb) || $2::jsonb,
           finished_at = NOW(),
           error_message = $3
       WHERE id = $1`,
      [params.runId, JSON.stringify(params.details), params.errorMessage],
    );
  }
}
