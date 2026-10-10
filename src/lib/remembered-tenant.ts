/**
 * The organization (tenant) id this device last signed in to. A per-device
 * convenience only: sign-out and session redirects go to a bare /login, and
 * nobody should have to retype an internal id. Storage may be unavailable.
 */
const KEY = 'swr:last-tenant';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readRememberedTenant(): string {
  try { const value = window.localStorage.getItem(KEY) ?? ''; return ID.test(value) ? value : ''; } catch { return ''; }
}

export function rememberTenant(tenantId: string): void {
  try { if (ID.test(tenantId)) window.localStorage.setItem(KEY, tenantId); } catch { /* Sign-in still works without storage. */ }
}

export const TENANT_HELP = 'Your organization’s ID from your invitation or sign-in link. This device remembers it after you sign in.';
