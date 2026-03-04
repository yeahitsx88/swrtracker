export interface AuthUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
}

export interface LoginRequest {
  tenantId: string;
  email: string;
  password: string;
}

export interface RegisterRequest {
  tenantId: string;
  companyId: string;
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface ForgotPasswordRequest {
  tenantId: string;
  email: string;
}

export interface ForgotPasswordResponse {
  success: boolean;
  debugResetToken?: string | null;
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
    projectId: string;
    email: string;
    role: string;
    expiresAt: string;
  };
}
