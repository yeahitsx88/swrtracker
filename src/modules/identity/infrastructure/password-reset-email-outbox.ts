import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import { createEmailTransportFromEnv, sendPasswordResetEmail } from '@/lib/email';
import { logError } from '@/lib/observability';
import type { DbClient, UUID } from '@/shared/types';

interface ResetMessage {
  tenantId: UUID;
  recipientEmail: string;
  resetToken: string;
  appBaseUrl: string;
}

function encryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required for reset email delivery');
  return createHash('sha256').update('swr-password-reset-outbox-v1\0').update(secret).digest();
}

function encrypt(message: ResetMessage): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(message), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decrypt(payload: string): ResetMessage {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Invalid reset email payload');
  const iv = Buffer.from(parts[0]!, 'base64url');
  const tag = Buffer.from(parts[1]!, 'base64url');
  const ciphertext = Buffer.from(parts[2]!, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')) as ResetMessage;
}

export async function enqueuePasswordResetEmail(db: DbClient, message: ResetMessage): Promise<void> {
  await db.query(
    `INSERT INTO password_reset_email_outbox
       (id, tenant_id, encrypted_payload, expires_at)
     VALUES ($1, $2, $3, NOW() + interval '60 minutes')`,
    [randomUUID(), message.tenantId, encrypt(message)],
  );
}

interface ClaimedMessage {
  id: UUID;
  tenant_id: UUID;
  encrypted_payload: string;
  expires_at: Date;
}

export async function dispatchPasswordResetEmails(db: DbClient): Promise<number> {
  const { rows } = await db.query<ClaimedMessage>(
    `UPDATE password_reset_email_outbox o
     SET locked_until = NOW() + interval '2 minutes', attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM password_reset_email_outbox
       WHERE status = 'PENDING' AND next_attempt_at <= NOW()
         AND (locked_until IS NULL OR locked_until < NOW())
       ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED
     )
     RETURNING o.id, o.tenant_id, o.encrypted_payload, o.expires_at`,
  );
  let sent = 0;
  for (const row of rows) {
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await db.query(
        `UPDATE password_reset_email_outbox
         SET status = 'EXPIRED', encrypted_payload = NULL, locked_until = NULL
         WHERE id = $1`, [row.id],
      );
      continue;
    }
    try {
      await sendPasswordResetEmail(createEmailTransportFromEnv(), decrypt(row.encrypted_payload));
      await db.query(
        `UPDATE password_reset_email_outbox
         SET status = 'SENT', encrypted_payload = NULL, sent_at = NOW(), locked_until = NULL
         WHERE id = $1`, [row.id],
      );
      sent += 1;
    } catch (err) {
      logError('Password reset email dispatch failed', {
        eventType: 'auth.password_reset.email.failed', tenantId: row.tenant_id,
        ticketId: null, actorId: null, outbox_id: row.id,
      }, err);
      await db.query(
        `UPDATE password_reset_email_outbox
         SET next_attempt_at = NOW() + interval '1 minute', locked_until = NULL
         WHERE id = $1`, [row.id],
      );
    }
  }
  return sent;
}

export async function pruneExpiredAuthSecurityRecords(db: DbClient): Promise<void> {
  await db.query(`DELETE FROM revoked_auth_sessions WHERE expires_at <= NOW()`);
  await db.query(`DELETE FROM auth_password_reset_rate_limits WHERE updated_at < NOW() - interval '1 day'`);
  await db.query(`DELETE FROM auth_login_rate_limits WHERE updated_at < NOW() - interval '1 day' AND (blocked_until IS NULL OR blocked_until <= NOW())`);
  await db.query(
    `DELETE FROM password_reset_email_outbox
     WHERE status IN ('SENT', 'EXPIRED') AND created_at < NOW() - interval '1 day'`,
  );
}
