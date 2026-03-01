/**
 * Identity application layer — public surface.
 * Other modules import from here, not from sub-files directly.
 */
export type { User, UserWithCredentials, ProjectMembership, Role, ProjectRole, TenantRole }
  from '../domain/types';

export type { IUserRepository }     from './ports';
export type { CreateUserParams }    from './create-user';
export type { AuthenticateParams, AuthenticateResult } from './authenticate';

export { createUser }       from './create-user';
export { authenticateUser } from './authenticate';
