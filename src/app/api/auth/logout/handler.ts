import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, requireAuth, sessionTokenHash } from '@/lib/auth';
import { withTransaction } from '@/lib/with-transaction';
import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';
import { errorResponse } from '@/lib/api-error';
import { UnauthorizedError } from '@/shared/errors';

export async function handlePostLogout(req: NextRequest, runTransaction: typeof withTransaction = withTransaction) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (token) {
      try {
        const auth = requireAuth(req);
        await runTransaction(async db => {
          const {rows} = await db.query(
            `INSERT INTO revoked_auth_sessions (token_hash, tenant_id, user_id, expires_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (token_hash) DO NOTHING RETURNING token_hash`,
            [sessionTokenHash(token), auth.tenantId, auth.userId, auth.expiresAt],
          );
          if(rows.length) await appendAdministrativeEvent(db,{
            auth,projectId:null,subjectUserId:auth.userId,eventType:'session.logged_out',
            authorityEvidence:{kind:'CURRENT_SESSION'},changes:{presentedSessionRevoked:true},
          });
        },{req,auth,mode:'EXCLUSIVE',authorize:async()=>{}});
      } catch (err) {
        // There is no valid bearer to revoke, but still clear a stale cookie.
        if (!(err instanceof UnauthorizedError)) throw err;
      }
    }
    const res = NextResponse.json({ success: true });
    res.cookies.set(COOKIE_NAME, '', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', path: '/', maxAge: 0,
    });
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
