/**
 * POST /api/auth/register
 *
 * Self-registration flow (CLAUDE.md §8):
 * 1. Parse and validate input.
 * 2. Validate companyId within the tenant.
 * 3. Check allowed_domains or validate inviteToken.
 *    - Domain match -> registration proceeds and requester memberships are seeded.
 *    - Valid inviteToken -> registration proceeds with the invite's project role.
 *    - No match -> 403 ForbiddenError.
 */
import type { NextRequest } from 'next/server';
import { handlePostRegister } from './handler';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return handlePostRegister(req);
}
