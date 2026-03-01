/**
 * Maps application errors to the JSON error shape specified in CLAUDE.md §8.
 *
 * All API route handlers catch errors and call errorResponse(err).
 * Never let unknown errors propagate to Next.js unhandled.
 */
import { NextResponse } from 'next/server';
import {
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InternalError,
  type AppError,
} from '@/shared/errors';

const HTTP_STATUS: Record<AppError['type'], number> = {
  ValidationError:   400,
  UnauthorizedError: 401,
  ForbiddenError:    403,
  NotFoundError:     404,
  ConflictError:     409,
  InternalError:     500,
};

function isAppError(err: unknown): err is AppError {
  return (
    err instanceof ValidationError  ||
    err instanceof UnauthorizedError ||
    err instanceof ForbiddenError    ||
    err instanceof NotFoundError     ||
    err instanceof ConflictError     ||
    err instanceof InternalError
  );
}

export function errorResponse(err: unknown): NextResponse {
  if (isAppError(err)) {
    return NextResponse.json(
      { error: { type: err.type, message: err.message } },
      { status: HTTP_STATUS[err.type] },
    );
  }
  return NextResponse.json(
    { error: { type: 'InternalError', message: 'An unexpected error occurred' } },
    { status: 500 },
  );
}
