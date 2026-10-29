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

/** Đăng ký thành công: đăng nhập luôn + mã giảm giá thành viên mới */
export interface RegisterResponse extends AuthResponse {
  coupon?: { code: string } | null;
}

/** Body lỗi khi đăng ký (409: email / số điện thoại đã có người dùng) */
export interface RegisterError {
  message?: string;
  field?: 'email' | 'phone';
}

/** Kết quả POST /api/auth/forgot-password (luôn 200 dù email có tồn tại hay không) */
export interface ForgotPasswordResponse {
  message?: string;
  /** Số giây phải chờ trước khi được gửi lại */
  resendAfter?: number;
}
