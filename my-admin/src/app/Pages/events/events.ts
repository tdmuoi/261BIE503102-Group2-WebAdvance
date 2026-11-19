import { Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { AdminAuthService } from '../../services/admin-auth-service';
import { adminApiError } from '../../services/admin-api-error';
import { BookService } from '../../services/book-service';
import { Author } from '../../models/book';
import { AdminEvent, EventInput, EventPage, EventService } from './event-service';

const vnInput = (iso: string | null) => iso ? new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 16) : '';
function emptyForm() {
  const start = new Date(Date.now() + 7 * 3600000);
  start.setUTCDate(start.getUTCDate() + 7);
  start.setUTCHours(12, 0, 0, 0);
  return { title: '', description: '', status: 'draft' as EventInput['status'],
    startAt: vnInput(start.toISOString()), endAt: vnInput(new Date(+start + 2 * 3600000).toISOString()),
    authorId: '', guests: '', location: '', format: 'offline' as EventInput['format'], type: 'Author Talk', image: '', capacity: null as number | null };
}

@Component({ selector: 'app-events', standalone: false, templateUrl: './events.html', styleUrl: './events.css' })
export class Events {
  private readonly service = inject(EventService);
  private readonly auth = inject(AdminAuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readRequest?: Subscription;
  readonly data = signal<EventPage | null>(null);
  readonly authors = signal<Author[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly formError = signal('');
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly formOpen = signal(false);
  readonly editing = signal<AdminEvent | null>(null);
  readonly readOnly = signal(false);
  readonly labels = { draft: 'Bản nháp', published: 'Đã xuất bản', hidden: 'Đã ẩn' };
  page = 1;
  status = '';
  search = '';
  form = emptyForm();
  private original = '';

  constructor() {
    inject(BookService).getAuthors().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: rows => this.authors.set(rows), error: () => this.error.set('Chưa tải được tác giả. Bạn có thể tải lại hoặc nhập tên khách mời.'),
    });
    this.destroyRef.onDestroy(() => this.readRequest?.unsubscribe());
    this.load();
  }
  can(action: string): boolean {
    return this.auth.user?.role === 'superadmin' || !!this.auth.user?.permissions?.some(p => p.module === 'content' && p.actions.includes(action));
  }
  load(reset = false): void {
    if (this.saving()) return;
    if (reset) this.page = 1;
    this.readRequest?.unsubscribe();
    this.loading.set(true); this.error.set('');
    this.readRequest = this.service.list(this.page, this.status, this.search.trim()).subscribe({
      next: data => { this.data.set(data); this.loading.set(false); },
      error: error => { this.error.set(adminApiError(error, 'Không tải được sự kiện.')); this.loading.set(false); this.data.set(null); },
    });
  }
  changePage(step: number): void { this.page += step; this.load(); }
  open(row: AdminEvent | null = null): void {
    if (this.saving() || (!row && !this.can('create'))) return;
    this.editing.set(row);
    this.readOnly.set(!!row && (row.isDemo || !this.can('update') || (row.status === 'published' && !this.can('publish'))));
    this.form = row ? { title: row.title, description: row.description, status: row.status,
      startAt: vnInput(row.startAt), endAt: vnInput(row.endAt), authorId: row.authorId || '', guests: row.guests.join('\n'),
      location: row.location, format: row.format, type: row.type, image: row.image, capacity: row.capacity } : emptyForm();
    this.original = JSON.stringify(this.form);
    this.formError.set(''); this.fieldErrors.set({}); this.formOpen.set(true);
  }
  close(): void {
    if (this.saving()) return;
    if (!this.canDeactivate()) return;
    this.formOpen.set(false);
  }
  canDeactivate(): boolean {
    if (this.saving()) return false;
    return !this.formOpen() || this.readOnly() || JSON.stringify(this.form) === this.original || confirm('Bỏ các thay đổi sự kiện chưa lưu?');
  }
  @HostListener('document:keydown.escape') onEscape(): void { if (this.formOpen()) this.close(); }
  save(): void {
    if (this.saving() || this.readOnly()) return;
    const existing = this.editing();
    if (!this.can(existing ? 'update' : 'create') || (this.form.status === 'published' && !this.can('publish'))) return;
    const date = (key: 'startAt' | 'endAt') => {
      if (!this.form[key]) return null;
      if (existing?.[key] && vnInput(existing[key]) === this.form[key]) return existing[key];
      const value = new Date(`${this.form[key]}:00+07:00`);
      if (!Number.isFinite(+value)) throw new Error('Ngày giờ không hợp lệ.');
      return value.toISOString();
    };
    let body: EventInput;
    try {
      body = { title: this.form.title.trim(), description: this.form.description.trim(), status: this.form.status,
        startAt: date('startAt'), endAt: date('endAt'), authorId: this.form.authorId || null,
        guests: this.form.guests.split('\n').map(value => value.trim()).filter(Boolean), location: this.form.location.trim(),
        format: this.form.format, type: this.form.type.trim(), image: this.form.image.trim(), capacity: this.form.capacity };
      if (!body.title) throw new Error('Vui lòng nhập tên sự kiện.');
      if (body.endAt && (!body.startAt || body.endAt <= body.startAt)) throw new Error('Giờ kết thúc phải sau giờ bắt đầu.');
      if (body.status === 'published' && (!body.startAt || !body.description || !body.location || (!body.authorId && !body.guests.length)))
        throw new Error('Để xuất bản, cần tên, mô tả, lịch, địa điểm và tác giả hoặc khách mời.');
    } catch (error) { this.formError.set((error as Error).message); return; }
    this.saving.set(true); this.formError.set(''); this.fieldErrors.set({});
    this.service.save(body, existing).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: saved => {
        this.saving.set(false); this.formOpen.set(false);
        this.message.set(saved.status === 'published' ? 'Đã xuất bản sự kiện. Tải lại trang sự kiện phía khách để xem.' : 'Đã lưu sự kiện. Bản nháp và sự kiện ẩn chưa hiển thị với khách.');
        this.load();
      },
      error: error => { this.saving.set(false); this.formError.set(adminApiError(error, 'Chưa lưu được sự kiện.'));
        this.fieldErrors.set(error.error?.errors || {}); },
    });
  }
}
