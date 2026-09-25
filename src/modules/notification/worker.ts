/** Run with `pnpm worker:notifications` alongside the web process. */
import { getPool } from '@/lib/db';
import { runNotificationCycle } from './application/index';
import { inviteBaseUrlFromEnv, runInviteDeliveryCycle } from './application/invite-delivery';
import { runContinuityAlertCycle } from './application/continuity-alerts';
import { SmtpEmailTransport, smtpConfigFromEnv } from './infrastructure/index';
import { PgNotificationRepository } from './infrastructure/notification.repository';
import { PgInviteDeliveryRepository } from './infrastructure/invite-delivery.repository';
import { PgContinuityAlertRepository } from './infrastructure/continuity-alert.repository';

async function main(): Promise<void> {
  // Fail at startup without a real transport. No delivery is claimed as sent.
  const transport = new SmtpEmailTransport(smtpConfigFromEnv());
  const inviteBaseUrl = inviteBaseUrlFromEnv();
  const pool = getPool();
  const repository = new PgNotificationRepository(pool);
  const inviteRepository = new PgInviteDeliveryRepository(pool);
  const continuityRepository = new PgContinuityAlertRepository(pool);
  const pollMs = Number(process.env.NOTIFICATION_POLL_MS ?? '10000');
  if (!Number.isInteger(pollMs) || pollMs < 1000 || pollMs > 300000) {
    throw new Error('NOTIFICATION_POLL_MS must be from 1000 to 300000');
  }
  let stopping = false;
  process.once('SIGINT', () => { stopping = true; });
  process.once('SIGTERM', () => { stopping = true; });
  try {
    while (!stopping) {
      try {
        const result = await runNotificationCycle(repository, transport);
        if (result.ingested || result.sent || result.failed) {
          process.stdout.write(`notifications: ${JSON.stringify(result)}\n`);
        }
      } catch (error) {
        process.stderr.write(`notification cycle failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
      }
      try {
        const result = await runInviteDeliveryCycle(inviteRepository, transport, inviteBaseUrl);
        if (result.ingested || result.sent || result.failed) {
          process.stdout.write(`invite notifications: ${JSON.stringify(result)}\n`);
        }
      } catch (error) {
        process.stderr.write(`invite notification cycle failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
      }
      try {
        const result = await runContinuityAlertCycle(continuityRepository, transport);
        if (result.ingested || result.sent || result.failed) {
          process.stdout.write(`continuity alerts: ${JSON.stringify(result)}\n`);
        }
      } catch (error) {
        process.stderr.write(`continuity alert cycle failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
      }
      if (!stopping) await new Promise(resolve => setTimeout(resolve, pollMs));
    }
  } finally {
    await pool.end();
  }
}

void main().catch(error => {
  process.stderr.write(`notification worker stopped: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});
