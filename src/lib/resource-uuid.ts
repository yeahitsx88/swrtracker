import { ValidationError } from '@/shared/errors';

/** Match PostgreSQL UUID identifiers without imposing a particular UUID version. */
export function requireResourceUuid(value: string, field: string): void {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) {
    throw new ValidationError(`Invalid ${field}`);
  }
}
