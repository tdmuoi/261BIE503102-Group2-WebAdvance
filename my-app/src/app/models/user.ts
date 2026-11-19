export interface User {
  _id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  avatar?: string | null;
}

export type LoginMethod = 'email' | 'phone';

export interface LoginRequest {
  identifier: string;
  type: LoginMethod;
  password: string;
  remember: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LoginError {
  message?: string;
  remainingAttempts?: number;
  lockedUntil?: string;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  phone: string | null;
  password: string;
  newsletter: boolean;
}

export type OtpPurpose = 'register' | 'verify_email' | 'login_2fa' | 'reset_password';

export interface OtpChallenge {
  challengeId: string;
  purpose: OtpPurpose;
  email: string;
  resendAfter: number;
  expiresIn: number;
}

export interface OtpRequired extends OtpChallenge {
  verificationRequired?: boolean;
  twoFactorRequired?: boolean;
}

export type LoginResponse = AuthResponse | OtpRequired;

export function needsOtp(res: LoginResponse): res is OtpRequired {
  return 'challengeId' in res && typeof res.challengeId === 'string';
}

export type RegisterResponse = OtpRequired;

export interface VerifiedResponse extends AuthResponse {
  coupon?: { code: string } | null;
}

export interface OtpError {
  message?: string;
  code?: 'OTP_INVALID' | 'OTP_EXPIRED' | 'OTP_SESSION_EXPIRED' | 'OTP_TOO_MANY_ATTEMPTS' | 'OTP_TOO_MANY_SENDS';
  remainingAttempts?: number;
  retryAfter?: number;
}

export interface RegisterError {
  message?: string;
  field?: 'email' | 'phone';
}

export interface ForgotPasswordResponse extends Partial<OtpChallenge> {
  deliveryAvailable?: boolean;
  message?: string;
  resendAfter?: number;
}
