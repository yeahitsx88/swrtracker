import type { Pool, PoolClient } from 'pg';
import type { UUID } from '@/shared/types';
import { getProjectContinuityHealth } from '@/modules/tenancy/application/continuity-health';
import { ContinuityHealthRepository } from '@/modules/tenancy/infrastructure/continuity-health.repository';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type {
  ContinuityAlertKind, ContinuityAlertRepository, PendingContinuityAlert,
} from '../application/continuity-alerts';

type ProjectRow = { id: UUID; tenant_id: UUID };
type DeliveryRow = {
  id: UUID; tenant_id: UUID; project_id: UUID; alert_kind: ContinuityAlertKind;
  source_id: UUID; reminder_day: number; recipient_user_id: UUID;
  email: string; project_name: string;
};

/** Uses the Tenancy health rules so read and email escalation windows agree. */
export class PgContinuityAlertRepository implements ContinuityAlertRepository {
  private readonly tenancy = new TenancyRepository();
  private readonly health = new ContinuityHealthRepository();

  constructor(private readonly pool: Pool) {}

  private getHealth(db: PoolClient, tenantId: UUID, projectId: UUID, now: Date) {
    return getProjectContinuityHealth(this.tenancy, this.health, db,
      { tenantId, projectId, actorRole: 'TENANT_ADMIN' }, now);
  }

  async ingestDueAlerts(limit: number, now: Date): Promise<number> {
    const client = await this.pool.connect();
    let inserted = 0;
    let afterId: UUID | null = null;
    try {
      while (inserted < limit) {
        const projectRows: ProjectRow[] = (await client.query<ProjectRow>(
          `SELECT id,tenant_id FROM projects
           WHERE status='ACTIVE' AND ($1::uuid IS NULL OR id>$1)
           ORDER BY id LIMIT 100`, [afterId])).rows;
        if (projectRows.length === 0) break;
        for (const project of projectRows) {
          afterId = project.id;
          const health = await this.getHealth(client, project.tenant_id, project.id, now);
          for (const grant of health.activeGrants) {
            if (!grant.confirmationOverdue || grant.reminderDay === null) continue;
            inserted += await this.insertRecipients(client, project,
              'ACTING_CONFIRMATION_OVERDUE', grant.grantId, grant.reminderDay, now);
          }
          for (const vacancy of health.crewVacancies) {
            if (!vacancy.escalationDue || vacancy.reminderDay === null) continue;
            inserted += await this.insertRecipients(client, project,
              'CREW_VACANCY_OVERDUE', vacancy.eventId, vacancy.reminderDay, now);
          }
          if (inserted >= limit) break;
        }
        if (projectRows.length < 100) break;
      }
      return inserted;
    } finally {
      client.release();
    }
  }

  private async insertRecipients(client: PoolClient, project: ProjectRow,
    kind: ContinuityAlertKind, sourceId: UUID, day: number, now: Date): Promise<number> {
    const result = await client.query(
      `INSERT INTO continuity_alert_deliveries
         (tenant_id,project_id,alert_kind,source_id,reminder_day,recipient_user_id,next_attempt_at)
       SELECT $1,$2,$3,$4,$5,admins.user_id,$6 FROM (
         SELECT tm.user_id FROM tenant_memberships tm
         WHERE tm.tenant_id=$1 AND tm.role='TENANT_ADMIN'
         UNION
         SELECT pm.user_id FROM project_memberships pm
         WHERE pm.project_id=$2 AND pm.role='PROJECT_ADMIN'
       ) admins
       JOIN users u ON u.id=admins.user_id AND u.tenant_id=$1
         AND u.deactivated_at IS NULL
       ON CONFLICT (tenant_id,project_id,alert_kind,source_id,
                    reminder_day,recipient_user_id) DO NOTHING`,
      [project.tenant_id, project.id, kind, sourceId, day, now]);
    return result.rowCount ?? 0;
  }

  async claimDeliveries(limit: number, now: Date): Promise<PendingContinuityAlert[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<DeliveryRow>(
        `SELECT d.id,d.tenant_id,d.project_id,d.alert_kind,d.source_id,
                d.reminder_day,d.recipient_user_id,u.email,p.name AS project_name
         FROM continuity_alert_deliveries d
         JOIN projects p ON p.id=d.project_id AND p.tenant_id=d.tenant_id
         JOIN users u ON u.id=d.recipient_user_id AND u.tenant_id=d.tenant_id
         WHERE (d.status='PENDING' AND d.next_attempt_at<=$2)
            OR (d.status='SENDING' AND d.claimed_until<=$2)
         ORDER BY d.next_attempt_at,d.created_at,d.id
         LIMIT $1 FOR UPDATE OF d SKIP LOCKED`, [limit, now]);
      const deliveries: PendingContinuityAlert[] = [];
      for (const row of rows) {
        const health = await this.getHealth(client, row.tenant_id, row.project_id, now);
        const activeGrant = row.alert_kind === 'ACTING_CONFIRMATION_OVERDUE'
          ? health.activeGrants.find(grant => grant.grantId === row.source_id &&
            grant.confirmationOverdue && grant.reminderDay === row.reminder_day)
          : undefined;
        const activeVacancy = row.alert_kind === 'CREW_VACANCY_OVERDUE'
          ? health.crewVacancies.find(vacancy => vacancy.eventId === row.source_id &&
            vacancy.escalationDue && vacancy.reminderDay === row.reminder_day)
          : undefined;
        const authorized = await client.query<{ allowed: boolean }>(
          `SELECT u.deactivated_at IS NULL AND (
             EXISTS (SELECT 1 FROM tenant_memberships tm
                     WHERE tm.tenant_id=$1 AND tm.user_id=$3
                       AND tm.role='TENANT_ADMIN')
             OR EXISTS (SELECT 1 FROM project_memberships pm
                        WHERE pm.project_id=$2 AND pm.user_id=$3
                          AND pm.role='PROJECT_ADMIN')
           ) AS allowed FROM users u WHERE u.id=$3 AND u.tenant_id=$1`,
          [row.tenant_id, row.project_id, row.recipient_user_id]);
        if ((!activeGrant && !activeVacancy) || !authorized.rows[0]?.allowed) {
          await client.query(`UPDATE continuity_alert_deliveries
            SET status='SKIPPED',claimed_until=NULL WHERE id=$1`, [row.id]);
          continue;
        }
        await client.query(`UPDATE continuity_alert_deliveries
          SET status='SENDING',attempts=attempts+1,
              claimed_until=$2::timestamptz+INTERVAL '5 minutes'
          WHERE id=$1`, [row.id, now]);
        deliveries.push({
          id: row.id, tenantId: row.tenant_id, projectId: row.project_id,
          kind: row.alert_kind, sourceId: row.source_id,
          reminderDay: row.reminder_day, recipientEmail: row.email,
          projectName: row.project_name,
          vacancyRole: activeVacancy?.role ?? null,
        });
      }
      await client.query('COMMIT');
      return deliveries;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async markSent(id: UUID): Promise<void> {
    const result = await this.pool.query(`UPDATE continuity_alert_deliveries
      SET status='SENT',sent_at=NOW(),claimed_until=NULL,last_error=NULL
      WHERE id=$1 AND status='SENDING'`, [id]);
    if (result.rowCount !== 1) throw new Error('Continuity alert claim expired');
  }

  async markFailed(id: UUID, error: string): Promise<void> {
    const result = await this.pool.query(`UPDATE continuity_alert_deliveries
      SET status='PENDING',claimed_until=NULL,last_error=$2,
          next_attempt_at=NOW()+LEAST(3600,30*POWER(2,LEAST(attempts-1,7))) * INTERVAL '1 second'
      WHERE id=$1 AND status='SENDING'`, [id, error]);
    if (result.rowCount !== 1) throw new Error('Continuity alert claim expired');
  }
}
