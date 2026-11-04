/**
 * Identity application layer — public surface.
 * Other modules import from here, not from sub-files directly.
 */
export type { User, UserWithCredentials, ProjectMembership, Role, ProjectRole, TenantRole }
  from '../domain/types';

export type { EmailAccount, IEmailAccountLookup, IUserRepository } from './ports';
export type { CreateUserParams }    from './create-user';
export type {
  AuthenticateParams,
  AuthenticateResult,
  EmailSignInParams,
  EmailSignInResult,
  OrganizationChoice,
} from './authenticate';
export type {
  IPasswordResetRepository,
  PasswordResetToken,
  RequestPasswordResetParams,
  RequestPasswordResetResult,
  ResetPasswordParams,
} from './password-reset';

export { createUser }       from './create-user';
export { authenticateUser, signInByEmail, MAX_EMAIL_SIGN_IN_ACCOUNTS } from './authenticate';
export { requestPasswordReset, resetPassword, hashPasswordResetToken } from './password-reset';
