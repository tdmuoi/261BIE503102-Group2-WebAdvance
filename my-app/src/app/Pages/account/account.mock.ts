import { Observable, delay, from, map, of } from 'rxjs';

import { AccountProfile, ChangePasswordRequest, UpdateProfileRequest } from '../../models/account';
import { User } from '../../models/user';

// TODO: thay bằng API — my-server chưa có /api/account/*.
// Khi backend xong: đổi USE_MOCK_ACCOUNT = false (hoặc xoá file này và các nhánh mock trong Pages/account).
export const USE_MOCK_ACCOUNT = true;

/** Hồ sơ mẫu theo từng tài khoản, giữ trong bộ nhớ để sửa xong chuyển trang vẫn còn */
const store = new Map<string, AccountProfile>();

export function mockGetProfile(user: User): Observable<AccountProfile> {
  let profile = store.get(user._id);
  if (!profile) {
    profile = {
      _id: user._id,
      fullName: user.fullName,
      username: user.email.split('@')[0],
      email: user.email,
      emailVerified: true,
      phone: user.phone ?? null,
      birthday: '2005-02-14',
      gender: 'female',
      avatar: user.avatar ?? null,
      tier: 'Thành viên Bạc',
      memberId: '7904217',
      passwordChangedAt: '2026-09-02T08:00:00.000Z',
      twoFactorEnabled: true,
    };
    store.set(user._id, profile);
  }
  return of({ ...profile }).pipe(delay(400));
}

export function mockUpdateProfile(id: string, body: UpdateProfileRequest): Observable<AccountProfile> {
  const next = { ...store.get(id)!, ...body };
  store.set(id, next);
  return of({ ...next }).pipe(delay(500));
}

/** Chưa có server lưu ảnh → dùng luôn ảnh dạng data URL để xem trước */
export function mockUploadAvatar(id: string, file: File): Observable<{ avatar: string }> {
  return from(readAsDataUrl(file)).pipe(
    map((avatar) => {
      store.set(id, { ...store.get(id)!, avatar });
      return { avatar };
    }),
    delay(300),
  );
}

export function mockDeleteAvatar(id: string): Observable<void> {
  store.set(id, { ...store.get(id)!, avatar: null });
  return of(undefined).pipe(delay(300));
}

/** Mock luôn nhận mật khẩu hiện tại là đúng */
export function mockChangePassword(id: string, _body: ChangePasswordRequest): Observable<{ passwordChangedAt: string }> {
  const passwordChangedAt = new Date().toISOString();
  store.set(id, { ...store.get(id)!, passwordChangedAt });
  return of({ passwordChangedAt }).pipe(delay(300));
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
