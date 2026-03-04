import { NextResponse, type NextRequest } from 'next/server';
import { ConflictError, NotFoundError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface InviteRow {
  tenant_id: string;
  project_id: string;
  email: string;
  role: string;
  expires_at: Date;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const { rows } = await pool.query<InviteRow>(
      `SELECT tenant_id, project_id, email, role, expires_at
       FROM invites
       WHERE token = $1
         AND accepted_at IS NULL
         AND canceled_at IS NULL
       LIMIT 1`,
      [token],
    );

    const invite = rows[0];
    if (!invite) {
      throw new NotFoundError('Invite token is invalid');
    }
    if (invite.expires_at.getTime() <= Date.now()) {
      throw new ConflictError('Invite token is expired');
    }

    return NextResponse.json({
      invite: {
        tenantId: invite.tenant_id,
        projectId: invite.project_id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expires_at.toISOString(),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
