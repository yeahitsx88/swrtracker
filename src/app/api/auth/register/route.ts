/**
 * POST /api/auth/register
 *
 * Self-registration flow (CLAUDE.md §8):
 * 1. Parse and validate input.
 * 2. Check the email domain against allowed_domains for this tenant.
 *    - Domain match -> registration proceeds, user gets REQUESTER role.
 *    - No match -> 403 ForbiddenError.
 * Invite-based registration is handled separately via /api/auth/invite/:token (future).
 */
import type { NextRequest } from 'next/server';
import { handlePostRegister } from './handler';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return handlePostRegister(req);
}
