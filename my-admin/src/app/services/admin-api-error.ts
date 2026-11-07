import { HttpErrorResponse } from '@angular/common/http';

export function adminApiError(error: HttpErrorResponse, fallback = 'Yêu cầu không thành công. Vui lòng thử lại.'): string {
  if (error.status === 0) return 'Không nhận được phản hồi từ Backend/API: có thể do mạng, server hoặc CORS. Kiểm tra localhost:3002; nếu server chưa chạy, chạy "npm run dev" trong my-server.';
  if (error.status === 401) return 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.';
  if (error.status === 403) return error.error?.message || 'Không được phép thực hiện yêu cầu (quyền truy cập, origin hoặc CSRF).';
  if (error.status === 429) {
    const value = error.headers.get('Retry-After');
    const seconds = value && /^\d+$/.test(value) ? Number(value) : value ? Math.ceil((Date.parse(value) - Date.now()) / 1000) : NaN;
    return Number.isFinite(seconds) && seconds > 0
      ? `Quá nhiều yêu cầu. Vui lòng thử lại sau ${Math.ceil(seconds)} giây.`
      : 'Quá nhiều yêu cầu. Vui lòng chờ trước khi thử lại.';
  }
  if (error.status >= 500) return error.error?.message || `Backend báo lỗi HTTP ${error.status}. Vui lòng thử lại sau.`;
  return error.error?.message || fallback;
}
