import { ValidationError } from '@/shared/errors';
import type { UUID } from '@/shared/types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseUuid(value: string, field: string): UUID {
  if (!UUID_PATTERN.test(value)) throw new ValidationError(`${field} must be a UUID`);
  return value as UUID;
}
