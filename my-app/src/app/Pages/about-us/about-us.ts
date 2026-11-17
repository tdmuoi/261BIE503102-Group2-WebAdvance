import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { EngagementService, NEWSLETTER_DUPLICATE_STATUS } from '../../services/engagement-service';
import { MISSION_VISION } from '../policies/policy-content';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trang Về Lightbook — nội dung tĩnh lấy đúng theo Figma "Pages/about-us · Về Lightbook" */
@Component({
  selector: 'app-about-us',
  standalone: false,
  styleUrls: ['./about-us.css', './about-us-sections.css', './about-join.css', './about-hero.css'],
  templateUrl: './about-us.html',
})
export class AboutUs {
  private readonly engagement = inject(EngagementService);
  private readonly destroyRef = inject(DestroyRef);
  /** Đoạn "Sứ Mệnh & Tầm Nhìn" lấy từ Content 1.docx */
  readonly mission = MISSION_VISION;

  /** Các mảng chính của Lightbook (theo Sứ mệnh trong Content 1.docx) — hiện ở phần đầu trang */
  readonly pillars = [
    { label: 'Sách mới', tone: 'pink' },
    { label: 'Sách cũ tuyển chọn', tone: 'yellow' },
    { label: 'Ebook', tone: 'mint' },
    { label: 'Thủ thư AI tư vấn', tone: 'white' },
  ];

  readonly marquee = [
    'READING MADE SIMPLE',
    'HANDPICKED INDIE TITLES',
    'CURATED BOOKS DELIVERED',
    'MONTHLY AUTHOR DISCUSSIONS',
    'COZY WEEKEND SANCTUARY',
  ];

  readonly milestones = [
    { year: '2019', title: 'Mở cửa hàng đầu tiên', text: 'Một kệ sách, ba chiếc ghế và ấm trà gừng ở 442 Cộng Hòa.' },
    { year: '2021', title: 'Seasonal Reading Box', text: 'Hộp sách theo mùa giao tận nhà, mỗi hộp 3 cuốn tuyển chọn.' },
    { year: '2023', title: 'Lightbook Author Talk', text: 'Buổi giao lưu tác giả hằng tháng đầu tiên — 40 ghế kín chỗ.' },
    { year: '2025', title: 'Website & cộng đồng', text: '12.000+ độc giả đọc, review và đổi sách cùng nhau.' },
  ];

  readonly values = [
    { tone: 'pink', icon: 'book-open', eyebrow: 'HANDPICKED INDIE TITLES', title: 'Chọn lọc sách indie', text: 'Mỗi đầu sách đều được đọc trước và chọn vì giá trị, không vì xu hướng.' },
    { tone: 'yellow', icon: 'truck', eyebrow: 'CURATED BOOKS DELIVERED', title: 'Giao sách tuyển chọn', text: 'Gói cẩn thận, kèm bookmark và vài dòng giới thiệu viết tay.' },
    { tone: 'mint', icon: 'users', eyebrow: 'MONTHLY AUTHOR DISCUSSIONS', title: 'Giao lưu tác giả hằng tháng', text: 'Lightbook Author Talk: gặp tác giả, dịch giả, biên tập viên.' },
    { tone: 'white', icon: 'bookmark', eyebrow: 'COZY WEEKEND SANCTUARY', title: 'Không gian đọc cuối tuần', text: 'Góc đọc chậm mở cửa cả ngày thứ Bảy và Chủ nhật.' },
  ];

  readonly stats = [
    { value: '12.000+', label: 'độc giả trong cộng đồng' },
    { value: '3.500', label: 'đầu sách tuyển chọn' },
    { value: '48', label: 'buổi Author Talk đã tổ chức' },
    { value: '4,9★', label: 'đánh giá trung bình đơn hàng' },
  ];

  // Ảnh đội ngũ do nhóm cung cấp (public/images/about/team); initials dùng khi ảnh lỗi
  readonly team = [
    { initials: 'TD', tone: 'pink', name: 'Thùy Dung', role: 'Người sáng lập', photo: 'images/about/team/thuy-dung.jpg' },
    { initials: 'MA', tone: 'mint', name: 'Mai Anh', role: 'Biên tập viên', photo: 'images/about/team/mai-anh.jpg' },
    { initials: 'KH', tone: 'yellow', name: 'Khánh Hằng', role: 'Phụ trách góc Đọc chậm', photo: 'images/about/team/khanh-hang.jpg' },
    { initials: 'NK', tone: 'pink', name: 'H Nhiên Kpor', role: 'Cộng đồng & sự kiện', photo: 'images/about/team/nhien-kpor.jpg' },
    // Ảnh dọc, mặt ở phía trên → căn top để không bị cắt mặt trong khung tròn
    { initials: 'DT', tone: 'mint', name: 'Trần Duy Thanh', role: 'Cố vấn doanh nghiệp', photo: 'images/about/team/tran-duy-thanh.png', focus: 'center top' },
  ];

  /** Ảnh đội ngũ / logo đối tác tải lỗi thì hiện chữ viết tắt */
  readonly brokenPhotos = signal(new Set<string>());

  markBroken(name: string): void {
    this.brokenPhotos.update((s) => new Set(s).add(name));
  }

  /**
   * Đối tác: logo lấy từ website chính thức của từng đơn vị (public/images/partners), hiện trong khung tròn.
   * Chưa có logo (Đông A, NXB Hội Nhà Văn: chưa lấy được logo chính thức) hoặc ảnh lỗi thì hiện chữ viết tắt.
   * fit: 'left' — logo ngang (NXB Trẻ) chỉ lấy phần biểu tượng bên trái; 'zoom' — ảnh nhiều lề trắng (AZ) phóng to.
   */
  readonly partners: { mark: string; name: string; logo?: string; fit?: 'left' | 'zoom' }[] = [
    { mark: 'TR', name: 'NXB Trẻ', logo: 'images/partners/nxb-tre.png', fit: 'left' },
    { mark: 'NN', name: 'Nhã Nam', logo: 'images/partners/nha-nam.png' },
    { mark: 'ĐA', name: 'Đông A' },
    { mark: 'KĐ', name: 'NXB Kim Đồng', logo: 'images/partners/nxb-kim-dong.png' },
    { mark: 'OP', name: 'Omega Plus', logo: 'images/partners/omega-plus.png' },
    { mark: 'AZ', name: 'AZ Việt Nam', logo: 'images/partners/az-viet-nam.jpg', fit: 'zoom' },
    { mark: 'HNV', name: 'NXB Hội Nhà Văn' },
    { mark: 'PN', name: 'Phương Nam Book', logo: 'images/partners/phuong-nam.jpg' },
  ];

  readonly benefits = [
    'Mã giảm 10% cho đơn đầu tiên',
    'Ưu tiên giữ chỗ Lightbook Author Talk',
    'Tích điểm đổi bookmark & quà tặng tác giả',
  ];

  // ---------------- Pop-up "Tham gia miễn phí": đăng ký nhận bản tin (POST /api/newsletter) ----------------
  readonly joinOpen = signal(false);
  readonly joinEmail = signal('');
  readonly joinState = signal<'idle' | 'sending' | 'done' | 'duplicate'>('idle');
  readonly joinError = signal<string | null>(null);

  openJoin(): void {
    this.joinOpen.set(true);
    this.joinState.set('idle');
    this.joinError.set(null);
  }

  closeJoin(): void {
    this.joinOpen.set(false);
  }

  onJoinEmail(event: Event): void {
    this.joinEmail.set((event.target as HTMLInputElement).value);
    this.joinError.set(null);
  }

  submitJoin(): void {
    const email = this.joinEmail().trim();
    if (this.joinState() === 'sending') return;
    if (!EMAIL_PATTERN.test(email)) {
      this.joinError.set('Email chưa đúng định dạng');
      return;
    }
    this.joinState.set('sending');
    this.engagement
      .subscribeNewsletter(email, 'news')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.joinState.set('done'),
        error: (err: unknown) => {
          if (err instanceof HttpErrorResponse && err.status === NEWSLETTER_DUPLICATE_STATUS) {
            this.joinState.set('duplicate');
            return;
          }
          this.joinState.set('idle');
          this.joinError.set(err instanceof HttpErrorResponse && err.status === 0 ? 'Không kết nối được máy chủ, vui lòng thử lại' : 'Chưa đăng ký được, vui lòng thử lại');
        },
      });
  }
}
