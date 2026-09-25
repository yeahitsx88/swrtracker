/**
 * POST /api/auth/register
 *
 * Invitation-bound registration flow:
 * 1. Parse and validate input.
 * 2. Lock and validate a single-use invitation inside the registration transaction.
 * 3. Bind tenant, project, company, email, and role from the invitation.
 */
import type { NextRequest } from 'next/server';
import { handlePostRegister } from './handler';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return handlePostRegister(req);
}
