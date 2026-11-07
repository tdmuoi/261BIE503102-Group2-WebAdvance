import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  SecurityContext,
  ViewChild,
  inject,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgForm } from '@angular/forms';
import { Subscription, distinctUntilChanged, map } from 'rxjs';
import { AdminAuthService } from '../../../services/admin-auth-service';
import { NewsArticle, NewsService, newsError, newsPayload } from '../news-service';
@Component({
  selector: 'app-news-editor',
  standalone: false,
  templateUrl: './news-editor.html',
  styleUrl: './news-editor.css',
})
export class NewsEditor implements OnInit, OnDestroy {
  private service = inject(NewsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);
  auth = inject(AdminAuthService);
  @ViewChild('bodyEditor') bodyEditor?: ElementRef<HTMLElement>;
  article: NewsArticle = {
    title: '',
    desc: '',
    content: '',
    category: '',
    cover: '',
    slug: '',
    metaDescription: '',
    tags: [],
    status: 'draft',
  };
  categories = ['Review sách', 'Gợi ý đọc', 'Đọc tuần hoàn', 'Sự kiện', 'Khuyến mãi', 'Hướng dẫn'];
  tagsText = '';
  loading = false;
  saving = false;
  error = '';
  message = '';
  preview = false;
  dirty = false;
  initialContent = '';
  coverError = false;
  loadFailed = false;
  categoryError = '';
  schedule = false;
  scheduleDate = '';
  scheduleTime = '08:00';
  private subscriptions = new Subscription();
  private articleRequest?: Subscription;
  private saveRequest?: Subscription;
  private confirmedExit = false;
  private originalCover = '';
  get tagsPreview() {
    return this.tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  retryLoad() {
    if (this.loading) return;
    this.loadFailed = false;
    this.error = '';
    this.loadArticle(this.route.snapshot.paramMap.get('id'));
  }
  changeCover(input: HTMLInputElement) {
    if (this.article.cover.startsWith('data:')) this.article.cover = '';
    this.cdr.detectChanges();
    input.focus();
  }
  ngOnInit() {
    this.subscriptions.add(
      this.service.list({ limit: 1 }).subscribe({
        next: (page) => {
          this.categories = [...new Set([...this.categories, ...page.categories])];
          this.cdr.markForCheck();
        },
        error: () => {
          this.categoryError =
            'Chưa tải được chuyên mục từ server. Các lựa chọn cơ bản vẫn hiển thị.';
          this.cdr.markForCheck();
        },
      }),
    );
    this.subscriptions.add(this.route.paramMap.pipe(
      map((params) => params.get('id')),
      distinctUntilChanged(),
    ).subscribe((id) => this.loadArticle(id)));
  }
  private loadArticle(id: string | null) {
    this.articleRequest?.unsubscribe();
    this.saveRequest?.unsubscribe();
    this.saving = false;
    this.loading = false;
    this.loadFailed = false;
    this.error = '';
    this.message = '';
    this.dirty = false;
    this.coverError = false;
    this.preview = false;
    this.schedule = false;
    this.scheduleDate = '';
    this.scheduleTime = '08:00';
    this.article = {
      title: '', desc: '', content: '', category: '', cover: '',
      slug: '', metaDescription: '', tags: [], status: 'draft',
    };
    this.assign(this.article);
    if (id) {
      this.loading = true;
      this.articleRequest = this.service.get(id).subscribe({
          next: (article) => {
            this.assign(article);
            this.loading = false;
            this.cdr.markForCheck();
          },
          error: (e) => {
            this.error = newsError(e);
            this.loadFailed = true;
            this.loading = false;
            this.cdr.markForCheck();
          },
        });
    }
    this.cdr.markForCheck();
  }
  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    this.articleRequest?.unsubscribe();
    this.saveRequest?.unsubscribe();
  }
  canDeactivate(): boolean {
    return this.confirmedExit || (!this.dirty && !this.saving) || window.confirm(
      this.saving
        ? 'Yêu cầu lưu đang xử lý; rời trang không hủy thay đổi trên server. Rời trang?'
        : 'Bạn có thay đổi chưa lưu. Rời trang?',
    );
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent) {
    if (this.dirty || this.saving) event.preventDefault();
  }
  assign(article: NewsArticle) {
    this.article = {
      ...this.article,
      ...article,
      title: article.title || '',
      status: article.status || 'draft',
      desc: article.desc || '',
      category: article.category || '',
      slug: article.slug || '',
      metaDescription: article.metaDescription || '',
      cover: article.cover || article.img || '',
      updatedAt: article.updatedAt || article.createdAt || '',
    };
    const raw = article.content || '';
    const plain = article.contentFormat === 'plain-text' || !/<\/?[a-z][\s\S]*>/i.test(raw);
    const html = plain
      ? raw
          .split(/\n\s*\n/)
          .filter((block) => block.trim())
          .map(
            (block) =>
              '<p>' +
              block
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/\n/g, '<br>') +
              '</p>',
          )
          .join('')
      : raw;
    this.article.content = this.sanitizer.sanitize(SecurityContext.HTML, html) || '';
    this.article.contentFormat = 'html';
    this.initialContent = this.article.content;
    this.originalCover = this.article.cover;
    this.article.tags = article.tags || [];
    this.tagsText = this.article.tags.join(', ');
    this.schedule = article.status === 'scheduled';
    if (this.schedule && article.publishedAt && Number.isFinite(Date.parse(article.publishedAt))) {
      const local = new Date(new Date(article.publishedAt).getTime() + 7 * 3600000).toISOString();
      this.scheduleDate = local.slice(0, 10);
      this.scheduleTime = local.slice(11, 16);
    }
    if (article.category && !this.categories.includes(article.category))
      this.categories.push(article.category);
    if (this.bodyEditor) this.bodyEditor.nativeElement.innerHTML = this.article.content;
  }
  titleChanged() {
    this.dirty = true;
    if (!this.article._id)
      this.article.slug = this.article.title
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 240);
  }
  contentChanged() {
    if (this.saving || this.loadFailed) return;
    const content = this.bodyEditor?.nativeElement.innerHTML || '';
    if (content !== this.article.content) {
      this.article.content = content;
      this.dirty = true;
    }
  }
  format(command: string, value?: string) {
    this.bodyEditor?.nativeElement.focus();
    document.execCommand(command, false, value);
    this.contentChanged();
  }
  insertLink() {
    const url = window.prompt('Nhập liên kết https://…');
    if (url && /^https?:\/\//i.test(url)) this.format('createLink', url);
  }
  insertImage() {
    const url = window.prompt('URL ảnh https://… hoặc /images/…');
    if (url && (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url)))
      this.format('insertImage', url);
  }
  save(status: string, form: NgForm) {
    if (this.saving || this.loading || this.loadFailed) return;
    this.error = '';
    this.message = '';
    form.form.markAllAsTouched();
    if (!this.article.title.trim() || this.article.title.length > 240) {
      this.error = 'Nhập tiêu đề từ 1 đến 240 ký tự.';
      return;
    }
    const content = this.sanitizer.sanitize(SecurityContext.HTML, this.article.content) || '';
    if (
      status === 'published' &&
      (!this.article.category || !this.article.cover || !content.replace(/<[^>]*>/g, '').trim())
    ) {
      this.error = 'Đăng bài cần chuyên mục, ảnh bìa và nội dung.';
      return;
    }
    if (
      this.article.cover &&
      this.article.cover !== this.originalCover &&
      !/^https?:\/\/[^\s]+$/i.test(this.article.cover) &&
      !/^\/(?!\/)[^\s]*$/.test(this.article.cover)
    ) {
      this.error = 'URL ảnh bìa không hợp lệ.';
      return;
    }
    if (form.invalid) {
      this.error = 'Vui lòng kiểm tra các trường nhập liệu.';
      return;
    }
    if (status === 'published' && this.coverError) {
      this.error = 'Ảnh bìa chưa tải được. Kiểm tra URL trước khi xuất bản.';
      return;
    }
    let publishedAt = this.article.publishedAt;
    if (status === 'published' && this.schedule) {
      const date = new Date(`${this.scheduleDate}T${this.scheduleTime}:00+07:00`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(this.scheduleDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(this.scheduleTime) || !Number.isFinite(date.getTime()) || new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 16) !== `${this.scheduleDate}T${this.scheduleTime}` || date.getTime() <= Date.now()) {
        this.error = 'Chọn ngày và giờ đăng trong tương lai (giờ Việt Nam).';
        return;
      }
      status = 'scheduled';
      publishedAt = date.toISOString();
    }
    const body = {
      ...this.article,
      content,
      status,
      publishedAt,
      preserveCover: !!this.article._id && this.article.cover === this.originalCover,
      tags: this.tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    if (body.tags.length > 20 || body.tags.some((t) => t.length > 50)) {
      this.error = 'Tối đa 20 tags, mỗi tag không quá 50 ký tự.';
      return;
    }
    if (new TextEncoder().encode(JSON.stringify(newsPayload(body))).length > 100000) {
      this.error =
        'Nội dung vượt giới hạn gửi của server (100 KB). Hãy rút gọn nội dung và dùng URL ảnh.';
      return;
    }
    this.saving = true;
    this.saveRequest = this.service.save(body).subscribe({
        next: (article) => {
          this.assign(article);
          this.saving = false;
          this.dirty = false;
          this.message =
            status === 'scheduled'
              ? 'Đã hẹn giờ đăng bài (giờ Việt Nam).'
              : status === 'published'
                ? 'Đã xuất bản bài viết.'
                : status === 'hidden'
                  ? 'Đã ẩn bài viết.'
                  : 'Đã lưu bản nháp.';
          this.cdr.markForCheck();
          if (!this.route.snapshot.paramMap.get('id'))
            void this.router.navigate(['/news-editor', article._id], { replaceUrl: true });
        },
        error: (e) => {
          this.error = newsError(e);
          this.saving = false;
          this.cdr.markForCheck();
        },
      });
  }
  back() {
    if (this.canDeactivate()) {
      // The route guard, once approved, must not prompt twice for this same click.
      this.confirmedExit = true;
      void this.router.navigate(['/news-list'])
        .catch(() => false)
        .finally(() => { this.confirmedExit = false; });
    }
  }
}
