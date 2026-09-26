export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', credentials: 'same-origin' });
  const body = await response.json();
  if (!response.ok) {
    throw new ApiError(body.error?.message ?? 'The request could not be completed.', response.status);
  }
  return body as T;
}

export function jsonBody(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

export function safeReturnPath(value?: string): string {
  if (value === undefined || value === '/projects') return '/projects';
  if (value === '/drafts' || value === '/' || value === '/audit' || value === '/tenant-health') return value;
  if (value && /^\/invites\/accept\?token=[a-f0-9-]{36}$/i.test(value)) return value;
  return value && /^(?:\/project\/[a-f0-9-]{36}\/(?:help|reports|deleted-drafts|requests|request(?:\?draft=[a-f0-9-]{36})?)|\/tickets\/[a-f0-9-]{36})$/i.test(value)
    ? value : '/drafts';
}
