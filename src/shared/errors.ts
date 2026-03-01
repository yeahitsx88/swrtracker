/**
 * Application error types — Section 8 of CLAUDE.md.
 * All errors produced by the application layer must be one of these types.
 * HTTP handlers map these to the correct status code and JSON shape.
 */

export class ValidationError extends Error {
  readonly type = 'ValidationError' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends Error {
  readonly type = 'UnauthorizedError' as const;
  constructor(message = 'Not authenticated') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  readonly type = 'ForbiddenError' as const;
  constructor(message = 'Insufficient permissions') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  readonly type = 'NotFoundError' as const;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  readonly type = 'ConflictError' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class InternalError extends Error {
  readonly type = 'InternalError' as const;
  constructor(message = 'An unexpected error occurred') {
    super(message);
    this.name = 'InternalError';
  }
}

export type AppError =
  | ValidationError
  | UnauthorizedError
  | ForbiddenError
  | NotFoundError
  | ConflictError
  | InternalError;
