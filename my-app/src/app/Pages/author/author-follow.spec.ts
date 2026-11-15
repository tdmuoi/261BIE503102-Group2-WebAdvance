import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '../../services/auth-service';
import { EngagementService } from '../../services/engagement-service';
import { ToastService } from '../../services/toast-service';
import { AuthorFollow } from './author-follow';

describe('AuthorFollow', () => {
  const user = signal<{ fullName: string } | null>({ fullName: 'Trí Hưng' });
  let engagement: { getFollowedAuthors: ReturnType<typeof vi.fn>; followAuthor: ReturnType<typeof vi.fn>; unfollowAuthor: ReturnType<typeof vi.fn> };
  let follow: AuthorFollow;

  beforeEach(() => {
    user.set({ fullName: 'Trí Hưng' });
    engagement = {
      getFollowedAuthors: vi.fn(() => of(['a1'])),
      followAuthor: vi.fn(() => of({})),
      unfollowAuthor: vi.fn(() => of({})),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user, token: 't' } },
        { provide: EngagementService, useValue: engagement },
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    });
    follow = TestBed.inject(AuthorFollow);
    TestBed.tick();
  });

  it('tải danh sách đang theo dõi khi đã đăng nhập', () => {
    expect(follow.isFollowing('a1')).toBe(true);
    expect(follow.isFollowing('a2')).toBe(false);
  });

  it('bấm nút đổi "Theo dõi" ↔ "Đã theo dõi"', () => {
    follow.toggle('a2', 'Higashino Keigo');
    expect(engagement.followAuthor).toHaveBeenCalledWith('a2');
    expect(follow.isFollowing('a2')).toBe(true);

    follow.toggle('a2', 'Higashino Keigo');
    expect(engagement.unfollowAuthor).toHaveBeenCalledWith('a2');
    expect(follow.isFollowing('a2')).toBe(false);
  });

  it('lỗi mạng thì trả nút về trạng thái cũ', () => {
    engagement.followAuthor.mockReturnValueOnce(throwError(() => new Error('offline')));
    follow.toggle('a3', 'Tác giả');
    expect(follow.isFollowing('a3')).toBe(false);
  });

  it('chưa đăng nhập thì chuyển sang trang đăng nhập, không gọi API', () => {
    user.set(null);
    TestBed.tick();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    follow.toggle('a2', 'Tác giả');
    expect(engagement.followAuthor).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login'], expect.objectContaining({ queryParams: expect.any(Object) }));
    expect(follow.isFollowing('a1')).toBe(false);
  });
});
