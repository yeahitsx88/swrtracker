/**
 * Maps application errors to the JSON error shape specified in CLAUDE.md §8.
 *
 * All API route handlers catch errors and call errorResponse(err).
 * Never let unknown errors propagate to Next.js unhandled.
 */
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getCorrelationId } from './correlation';
import {
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalError,
  type AppError,
} from '@/shared/errors';

const HTTP_STATUS: Record<AppError['type'], number> = {
  ValidationError:   400,
  UnauthorizedError: 401,
  ForbiddenError:    403,
  NotFoundError:     404,
  ConflictError:     409,
  RateLimitError:    429,
  InternalError:     500,
};

const DEFAULT_CODE: Record<AppError['type'], string> = {
  ValidationError: 'VALIDATION_ERROR',
  UnauthorizedError: 'AUTH_UNAUTHORIZED',
  ForbiddenError: 'AUTH_FORBIDDEN',
  NotFoundError: 'NOT_FOUND',
  ConflictError: 'CONFLICT',
  RateLimitError: 'RATE_LIMITED',
  InternalError: 'INTERNAL_ERROR',
};

function isAppError(err: unknown): err is AppError {
  return (
    err instanceof ValidationError  ||
    err instanceof UnauthorizedError ||
    err instanceof ForbiddenError    ||
    err instanceof NotFoundError     ||
    err instanceof ConflictError     ||
    err instanceof RateLimitError    ||
    err instanceof InternalError
  );
}

export function errorResponse(err: unknown): NextResponse {
  const correlationId = getCorrelationId() ?? randomUUID();

  if (isAppError(err)) {
    const status = HTTP_STATUS[err.type];
    return NextResponse.json(
      {
        error: {
          type: err.type,
          code: err.code ?? DEFAULT_CODE[err.type],
          message: err.message,
          correlationId,
          status,
        },
      },
      { status },
    );
  }
  return NextResponse.json(
    {
      error: {
        type: 'InternalError',
        code: DEFAULT_CODE.InternalError,
        message: 'An unexpected error occurred',
        correlationId,
        status: 500,
      },
    },
    { status: 500 },
  );
}
