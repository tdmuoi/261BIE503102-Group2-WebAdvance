/** Tài khoản khách hàng đang đăng nhập (dữ liệu my-server trả về khi đăng nhập) */
export interface User {
  _id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  avatar?: string | null;
}

/** Đăng nhập bằng email hoặc số điện thoại */
export type LoginMethod = 'email' | 'phone';

/** Body gửi lên POST /api/auth/login */
export interface LoginRequest {
  identifier: string;
  type: LoginMethod;
  password: string;
  remember: boolean;
}

/** Kết quả đăng nhập thành công */
export interface AuthResponse {
  token: string;
  user: User;
}

/** Body lỗi server trả về khi đăng nhập thất bại (401 sai thông tin, 423 tạm khoá) */
export interface LoginError {
  message?: string;
  /** Số lần thử còn lại trước khi bị khoá */
  remainingAttempts?: number;
  /** Thời điểm hết khoá (ISO) */
  lockedUntil?: string;
}

/** Body gửi lên POST /api/auth/register */
export interface RegisterRequest {
  fullName: string;
  email: string;
  /** Không bắt buộc */
  phone: string | null;
  password: string;
  /** Nhận bản tin sách mới mỗi thứ Năm */
  newsletter: boolean;
}

/** Mục đích của mã OTP gửi qua email */
/** register: đăng ký mới (tài khoản chỉ được tạo khi nhập đúng mã) */
export type OtpPurpose = 'register' | 'verify_email' | 'login_2fa' | 'reset_password';

/** Server đã gửi mã OTP 6 số qua email; trang gửi lại challengeId kèm mã khi xác nhận */
export interface OtpChallenge {
  challengeId: string;
  purpose: OtpPurpose;
  /** Email đã che bớt, vd. ma*****n@gmail.com */
  email: string;
  /** Số giây phải chờ trước khi được gửi lại mã */
  resendAfter: number;
  /** Số giây còn hiệu lực của mã */
  expiresIn: number;
}

/** Đăng nhập / đăng ký cần nhập OTP trước khi có phiên */
export interface OtpRequired extends OtpChallenge {
  /** Email chưa xác minh (tài khoản mới đăng ký) */
  verificationRequired?: boolean;
  /** Khách đã bật xác thực 2 lớp */
  twoFactorRequired?: boolean;
}

/** POST /api/auth/login: đăng nhập thẳng hoặc phải nhập OTP */
export type LoginResponse = AuthResponse | OtpRequired;

export function needsOtp(res: LoginResponse): res is OtpRequired {
  return 'challengeId' in res && typeof res.challengeId === 'string';
}

/** Đăng ký thành công: server gửi OTP xác minh email (chưa đăng nhập) */
export type RegisterResponse = OtpRequired;

/** Nhập đúng OTP: có phiên đăng nhập; xác minh email lần đầu thì kèm mã giảm giá thành viên mới */
export interface VerifiedResponse extends AuthResponse {
  coupon?: { code: string } | null;
}

/** Body lỗi khi nhập / gửi lại OTP */
export interface OtpError {
  message?: string;
  code?: 'OTP_INVALID' | 'OTP_EXPIRED' | 'OTP_SESSION_EXPIRED' | 'OTP_TOO_MANY_ATTEMPTS' | 'OTP_TOO_MANY_SENDS';
  remainingAttempts?: number;
  /** Phải chờ thêm bao nhiêu giây mới gửi lại được */
  retryAfter?: number;
}

/** Body lỗi khi đăng ký (409: email / số điện thoại đã có người dùng) */
export interface RegisterError {
  message?: string;
  field?: 'email' | 'phone';
}

/** Kết quả POST /api/auth/forgot-password (luôn 200 dù email có tồn tại hay không) */
export interface ForgotPasswordResponse extends Partial<OtpChallenge> {
  deliveryAvailable?: boolean;
  message?: string;
  /** Số giây phải chờ trước khi được gửi lại */
  resendAfter?: number;
}
