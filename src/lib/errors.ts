export interface ApiErrorPayload {
  error: {
    type: string;
    message: string;
  };
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly type: string;

  constructor(type: string, message: string, status: number) {
    super(message);
    this.type = type;
    this.status = status;
  }
}

export function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  if (!value || typeof value !== 'object') return false;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return false;
  const typed = error as { type?: unknown; message?: unknown };
  return typeof typed.type === 'string' && typeof typed.message === 'string';
}
