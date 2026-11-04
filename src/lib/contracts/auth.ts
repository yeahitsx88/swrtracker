export interface AuthUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
}

export interface LoginRequest {
  /** Optional (Decision 58): sent only after choosing among matched organizations. */
  tenantId?: string;
  email: string;
  password: string;
}

export interface OrganizationChoice {
  tenantId: string;
  name: string;
}

/** The password matched in several organizations; no session was issued. */
export interface OrganizationChoiceResponse {
  organizations: OrganizationChoice[];
}

export type LoginResponse = AuthResponse | OrganizationChoiceResponse;

export interface RegisterRequest {
  tenantId: string;
  email: string;
  password: string;
  name: string;
  inviteToken: string;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface ForgotPasswordRequest {
  /** Optional (Decision 58): without it every organization with this email is covered. */
  tenantId?: string;
  email: string;
}

export interface ForgotPasswordResponse {
  success: boolean;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  success: boolean;
}

export interface InviteValidationResponse {
  invite: {
    tenantId: string;
    tenantName: string;
    projectId: string;
    email: string;
    role: string;
    expiresAt: string;
  };
}
