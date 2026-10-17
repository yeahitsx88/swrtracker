/**
 * Application error types — Section 8 of CLAUDE.md.
 * All errors produced by the application layer must be one of these types.
 * HTTP handlers map these to the correct status code and JSON shape.
 */

export class ValidationError extends Error {
  readonly type = 'ValidationError' as const;
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

export class UnauthorizedError extends Error {
  readonly type = 'UnauthorizedError' as const;
  readonly code?: string;
  constructor(message = 'Not authenticated', code?: string) {
    super(message);
    this.name = 'UnauthorizedError';
    this.code = code;
  }
}

export class ForbiddenError extends Error {
  readonly type = 'ForbiddenError' as const;
  readonly code?: string;
  constructor(message = 'Insufficient permissions', code?: string) {
    super(message);
    this.name = 'ForbiddenError';
    this.code = code;
  }
}

export class NotFoundError extends Error {
  readonly type = 'NotFoundError' as const;
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'NotFoundError';
    this.code = code;
  }
}

export class ConflictError extends Error {
  readonly type = 'ConflictError' as const;
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ConflictError';
    this.code = code;
  }
}

export class RateLimitError extends Error {
  readonly type = 'RateLimitError' as const;
  readonly code?: string;
  constructor(message = 'Too many requests', code?: string) {
    super(message);
    this.name = 'RateLimitError';
    this.code = code;
  }
}

export class InternalError extends Error {
  readonly type = 'InternalError' as const;
  readonly code?: string;
  constructor(message = 'An unexpected error occurred', code?: string) {
    super(message);
    this.name = 'InternalError';
    this.code = code;
  }
}

export type AppError =
  | ValidationError
  | UnauthorizedError
  | ForbiddenError
  | NotFoundError
  | ConflictError
  | RateLimitError
  | InternalError;
