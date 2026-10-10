export interface ApiErrorPayload {
  error: {
    type: string;
    message: string;
    code?: string;
    correlationId?: string;
    status?: number;
  };
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly type: string;
  readonly code?: string;
  readonly correlationId?: string;

  constructor(
    type: string,
    message: string,
    status: number,
    code?: string,
    correlationId?: string,
  ) {
    super(message);
    this.type = type;
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
  }
}

export function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  if (!value || typeof value !== 'object') return false;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return false;
  const typed = error as {
    type?: unknown;
    message?: unknown;
    code?: unknown;
    correlationId?: unknown;
    status?: unknown;
  };

  if (typeof typed.type !== 'string' || typeof typed.message !== 'string') {
    return false;
  }
  if (typed.code !== undefined && typeof typed.code !== 'string') {
    return false;
  }
  if (typed.correlationId !== undefined && typeof typed.correlationId !== 'string') {
    return false;
  }
  if (typed.status !== undefined && typeof typed.status !== 'number') {
    return false;
  }
  return true;
}

/**
 * The request never produced a server response (offline, DNS, dropped connection).
 * Deliberately not an ApiClientError: callers treat it as an uncertain outcome and
 * keep the exact retry intent, exactly as they did for the browser's raw TypeError.
 */
export class NetworkError extends Error {
  constructor() {
    super(NETWORK_MESSAGE);
    this.name = 'NetworkError';
  }
}

export const NETWORK_MESSAGE = 'Couldn’t reach SWRTracker, so the result isn’t confirmed. Check your connection, then try again. Your entries on this page are kept.';
const SESSION_MESSAGE = 'Your sign-in has ended or changed. Sign in again to continue. Your entries on this page are kept until you leave it.';
const RATE_LIMIT_MESSAGE = 'Too many attempts in a short time. Wait a minute, then try again.';

/** Plain-language status wording for responses that carried no usable explanation. */
export function statusMessage(status: number): string {
  if (status === 401) return SESSION_MESSAGE;
  if (status === 403) return 'You don’t have permission to do this. Contact your project administrator if you believe this is incorrect.';
  if (status === 404) return 'This item could not be found. It may have been removed, or you may no longer have access.';
  if (status === 409) return 'This changed while you were working. Reload to see the latest, then try again.';
  if (status === 413) return 'That file or request is too large. Choose a smaller file and try again.';
  if (status === 429) return RATE_LIMIT_MESSAGE;
  if (status >= 500) return 'Something went wrong on our side, so the result isn’t confirmed. Try again in a moment.';
  return 'The request could not be completed. Check your entries and try again.';
}

const ROLE_WORDS: Array<[RegExp, string]> = [
  [/\bTENANT_ADMIN\b/g, 'Tenant Admin'], [/\bPROJECT_ADMIN\b/g, 'Project Admin'], [/\bSURVEY_MANAGER\b/g, 'Survey Manager'],
  [/\bSURVEY_SUPERINTENDENT\b/g, 'Survey Superintendent'], [/\bPARTY_CHIEF\b/g, 'Party Chief'], [/\bINSTRUMENT_MAN\b/g, 'Instrument Man'],
  [/\bAOR assignments\b/g, 'Area assignments'], [/\bAOR node\b/g, 'Area'],
];
const sentence = (text: string) => { const trimmed = text.trim(); return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`; };
const isSessionProblem = (error: ApiClientError) =>
  error.code === 'AUTH_SESSION_REVOKED' || /session|authentication required|mutation identity|sign in again/i.test(error.message);

/**
 * User-facing wording for any failure. Server explanations are kept (they name the
 * domain rule) but role codes are humanized and the next step is added where the
 * status implies one. Network, session and unexpected failures never show raw text.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof NetworkError) return error.message;
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) return NETWORK_MESSAGE;
  if (error instanceof ApiClientError) {
    const raw = ROLE_WORDS.reduce((text, [pattern, word]) => text.replace(pattern, word), error.message.trim())
      // Internal record IDs mean nothing to operators.
      .replace(/\bTicket [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12} not found\b/gi, 'This request was not found')
      .replace(/\s*\(?\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b\)?/gi, '');
    if (error.status >= 500 || error.type === 'InternalError') {
      const reference = error.correlationId ? ` If it keeps happening, contact support and mention reference ${error.correlationId.slice(0, 8)}.` : '';
      return `${sentence(fallback)} ${statusMessage(500)}${reference}`;
    }
    if (error.status === 401 && isSessionProblem(error)) return SESSION_MESSAGE;
    if (error.status === 429) return RATE_LIMIT_MESSAGE;
    if (!raw) return error.status ? statusMessage(error.status) : fallback;
    if (error.status === 403 && !/contact|administrator|ask /i.test(raw)) return `${sentence(raw)} Contact your project administrator if you believe this is incorrect.`;
    if (error.status === 404 && !/removed|no longer/i.test(raw)) return `${sentence(raw)} It may have been removed, or you may no longer have access.`;
    return raw;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}
