import { NextResponse, type NextRequest } from 'next/server';
import { ConflictError, NotFoundError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';

interface InviteRow {
  tenant_id: string;
  tenant_name: string;
  project_id: string;
  company_id: string | null;
  email: string;
  role: string;
  expires_at: Date;
}

export interface InviteTokenRouteDeps {
  queryInvite: (token: string) => Promise<InviteRow | null>;
  now: () => number;
}

const defaultDeps: InviteTokenRouteDeps = {
  queryInvite: async (token) => {
    const { rows } = await pool.query<InviteRow>(
      `SELECT i.tenant_id, t.name AS tenant_name, i.project_id, i.company_id, i.email, i.role, i.expires_at
       FROM invites i
       JOIN tenants t ON t.id = i.tenant_id
       WHERE i.token = $1
         AND i.accepted_at IS NULL
         AND i.canceled_at IS NULL
       LIMIT 1`,
      [token],
    );

    return rows[0] ?? null;
  },
  now: () => Date.now(),
};

export async function handleGetInviteToken(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
  deps: InviteTokenRouteDeps = defaultDeps,
) {
  try {
    const { token } = await params;
    const invite = await deps.queryInvite(token);
    if (!invite) {
      throw new NotFoundError('Invite token is invalid');
    }
    if (invite.expires_at.getTime() <= deps.now()) {
      throw new ConflictError('Invite token is expired');
    }
    if (!invite.company_id) {
      throw new ConflictError('Invite is not bound to a company');
    }

    return NextResponse.json({
      invite: {
        tenantId: invite.tenant_id,
        tenantName: invite.tenant_name,
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
