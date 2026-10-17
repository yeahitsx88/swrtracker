import { ValidationError } from '@/shared/errors';
import type { UUID } from '@/shared/types';

export type CustomRoleBase = 'REQUESTER' | 'VIEWER';
export interface CustomRole {
  id: UUID;
  name: string;
  baseRole: CustomRoleBase;
  version: number;
  assignmentCount: number;
}
const systemNames = new Set(['tenant admin','central it','billing viewer','requester','project admin',
  'survey manager','survey superintendent','party chief','instrument man','cad technician','cad lead',
  'department manager','department lead','viewer','area viewer','subcontracts coordinator']);
export function validateCustomRole(input: {name: unknown; baseRole: unknown}) {
  if (typeof input.name !== 'string') throw new ValidationError('Enter a role name.');
  const name = input.name.normalize('NFKC').trim().replace(/\s+/g,' ');
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new ValidationError('Use a role name of 1–80 characters without control characters.');
  if (systemNames.has(name.toLowerCase().replace(/[\s_-]+/g,' '))) throw new ValidationError('System role names are reserved. Choose a different name.');
  if (input.baseRole !== 'REQUESTER' && input.baseRole !== 'VIEWER') throw new ValidationError('Choose Requester or Viewer as the permission template.');
  return {name, baseRole: input.baseRole as CustomRoleBase};
}
