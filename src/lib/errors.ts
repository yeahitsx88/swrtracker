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

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    const codeSuffix = error.code ? ` ${error.code}` : '';
    return `${error.status}${codeSuffix}: ${error.message}`;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}
