import { Component, DestroyRef, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { map, startWith } from 'rxjs';

import { CatalogBook } from '../../../models/book';
import { BookCondition, Branch, BuybackRequest, DeliveryMethod, PayoutMethod } from '../../../models/buyback';
import { AuthService } from '../../../services/auth-service';
import { BuybackService, BuybackUnavailableError } from '../../../services/buyback-service';
import { PROVINCES } from '../../../shared/constants/provinces';
import {
  CONDITION_GROUPS,
  DELIVERY_LABELS,
  EXTRA_NONE,
  EXTRA_OPTIONS,
  GradeResult,
  PACKING_GUIDE,
  PAYOUT_LABELS,
  PriceRange,
  WAREHOUSE,
  estimatePrice,
  gradeOf,
} from '../buyback-rules';

type Step = 1 | 2 | 3;

const MAX_BOOKS = 20;
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const NOTE_MAX = 300;

/** Số di động Việt Nam: 0 hoặc +84, đầu số 3/5/7/8/9, tổng 10 số (bỏ qua dấu cách, chấm) */
const PHONE_PATTERN = /^(0|\+84)(3|5|7|8|9)\d{8}$/;

/** Lỗi hiển thị theo từng field (tiếng Việt) */
const MESSAGES: Record<string, Record<string, string>> = {
  title: { required: 'Nhập tên sách hoặc mã ISBN', maxlength: 'Tên sách tối đa 200 ký tự' },
  author: { required: 'Nhập tên tác giả', maxlength: 'Tên tác giả tối đa 120 ký tự' },
  quantity: { min: 'Số lượng tối thiểu là 1', max: 'Mỗi đầu sách tối đa 20 cuốn' },
  coverPrice: {
    required: 'Nhập giá bìa in trên sách',
    min: 'Giá bìa tối thiểu 1.000đ',
    max: 'Giá bìa tối đa 10.000.000đ',
  },
  cover: { required: 'Chọn tình trạng bìa sách' },
  spine: { required: 'Chọn tình trạng gáy sách' },
  pages: { required: 'Chọn tình trạng ruột sách' },
  extras: { required: 'Chọn ít nhất một mục, hoặc "Không có"' },
  note: { maxlength: `Mô tả tối đa ${NOTE_MAX} ký tự` },
  fullName: { required: 'Nhập họ và tên', minlength: 'Họ và tên quá ngắn', maxlength: 'Họ và tên tối đa 80 ký tự' },
  phone: { required: 'Nhập số điện thoại', phone: 'Số điện thoại không hợp lệ (VD: 0909 123 268)' },
  email: { required: 'Nhập email', email: 'Email không hợp lệ' },
  province: { required: 'Chọn tỉnh / thành phố' },
  returnAddress: {
    required: 'Nhập địa chỉ hoàn sách',
    minlength: 'Ghi rõ số nhà, tên đường, phường / xã',
    maxlength: 'Địa chỉ tối đa 200 ký tự',
  },
  method: { required: 'Chọn cách gửi sách' },
  branchId: { required: 'Chọn chi nhánh bạn sẽ mang sách đến' },
  payout: { required: 'Chọn hình thức nhận tiền' },
  agree: { required: 'Bạn cần đồng ý với điều khoản thu mua' },
};

function phoneValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').replace(/[\s.]/g, '');
  return !value || PHONE_PATTERN.test(value) ? null : { phone: true };
}

/** Sách có lựa chọn Lightbook không nhận (thiếu / rách trang) */
function acceptedValidator(control: AbstractControl): ValidationErrors | null {
  const { cover, spine, pages, extras } = control.value as BookCondition;
  return gradeOf({ cover, spine, pages, extras }).status === 'rejected' ? { notAccepted: true } : null;
}

function createItem() {
  return new FormGroup(
    {
      bookId: new FormControl<string | null>(null),
      title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] }),
      author: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
      quantity: new FormControl(1, { nonNullable: true, validators: [Validators.min(1), Validators.max(MAX_BOOKS)] }),
      coverPrice: new FormControl<number | null>(null, [Validators.required, Validators.min(1000), Validators.max(10_000_000)]),
      cover: new FormControl<string | null>(null, Validators.required),
      spine: new FormControl<string | null>(null, Validators.required),
      pages: new FormControl<string | null>(null, Validators.required),
      extras: new FormControl<string[]>([], { nonNullable: true, validators: Validators.required }),
      note: new FormControl('', { nonNullable: true, validators: Validators.maxLength(NOTE_MAX) }),
    },
    { validators: acceptedValidator },
  );
}

type ItemGroup = ReturnType<typeof createItem>;

interface Photo {
  file: File;
  url: string;
}

/** Tóm tắt hiện ở màn xác nhận sau khi gửi */
interface Receipt {
  code: string | null;
  books: number;
  estimate: PriceRange | null;
  delivery: DeliveryMethod;
  branch: Branch | null;
  payout: PayoutMethod;
  email: string;
}

/** Phiếu thanh lý sách 3 bước — Figma 849:3939 */
@Component({
  selector: 'app-buyback-form',
  standalone: false,
  styleUrls: [
    './buyback-form.css',
    './buyback-form-book.css',
    './buyback-form-condition.css',
    './buyback-form-upload.css',
    './buyback-form-send.css',
    './buyback-form-done.css',
  ],
  templateUrl: './buyback-form.html',
})
export class BuybackForm {
  /** Sách trong DB để gợi ý tên / ISBN */
  readonly books = input<CatalogBook[]>([]);

  private readonly auth = inject(AuthService);
  private readonly buyback = inject(BuybackService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly card = viewChild.required<ElementRef<HTMLElement>>('card');

  protected readonly conditionGroups = CONDITION_GROUPS;
  protected readonly extraOptions = EXTRA_OPTIONS;
  protected readonly provinces = PROVINCES;
  protected readonly deliveryLabels = DELIVERY_LABELS;
  protected readonly payoutLabels = PAYOUT_LABELS;
  protected readonly payoutOptions: readonly PayoutMethod[] = ['bank', 'voucher'];
  protected readonly warehouse = WAREHOUSE;
  protected readonly packingGuide = PACKING_GUIDE;
  protected readonly noteMax = NOTE_MAX;
  protected readonly maxBooks = MAX_BOOKS;
  protected readonly maxPhotos = MAX_PHOTOS;
  protected readonly steps = [
    { no: 1 as Step, label: 'Sách' },
    { no: 2 as Step, label: 'Thông tin' },
    { no: 3 as Step, label: 'Gửi & nhận tiền' },
  ];

  protected readonly form = new FormGroup({
    items: new FormArray<ItemGroup>([createItem()]),
    customer: new FormGroup({
      fullName: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
      }),
      phone: new FormControl('', { nonNullable: true, validators: [Validators.required, phoneValidator] }),
      email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
      province: new FormControl('', { nonNullable: true, validators: Validators.required }),
      returnAddress: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(10), Validators.maxLength(200)],
      }),
    }),
    send: new FormGroup({
      method: new FormControl<DeliveryMethod | null>(null, Validators.required),
      branchId: new FormControl('', { nonNullable: true }),
      payout: new FormControl<PayoutMethod | null>(null, Validators.required),
      agree: new FormControl(false, { nonNullable: true, validators: Validators.requiredTrue }),
    }),
  });

  protected readonly items = this.form.controls.items;
  protected readonly customer = this.form.controls.customer;
  protected readonly send = this.form.controls.send;

  private readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue()), startWith(this.form.getRawValue())), {
    requireSync: true,
  });

  protected readonly step = signal<Step>(1);
  /** Hướng trượt của panel khi đổi bước */
  protected readonly direction = signal<'next' | 'prev'>('next');
  protected readonly photos = signal<Photo[]>([]);
  protected readonly photoError = signal('');
  protected readonly dragging = signal(false);
  protected readonly sending = signal(false);
  protected readonly submitError = signal('');
  protected readonly receipt = signal<Receipt | null>(null);
  protected readonly branches = toSignal(this.buyback.getBranches(), { initialValue: [] as Branch[] });

  protected readonly user = this.auth.user;
  /** Đã đăng nhập: các field điền sẵn khoá lại cho tới khi bấm "Chỉnh sửa" */
  protected readonly editingProfile = signal(false);
  private readonly prefilled = signal<ReadonlySet<string>>(new Set());

  protected readonly grades = computed<GradeResult[]>(() => this.value().items.map((item) => gradeOf(item)));
  protected readonly estimate = computed(() =>
    estimatePrice(
      this.value().items.map((item) => ({ quantity: item.quantity, coverPrice: item.coverPrice ?? 0, condition: item })),
    ),
  );
  protected readonly bookCount = computed(() => this.value().items.reduce((sum, item) => sum + (item.quantity || 0), 0));

  protected readonly summary = computed(() => {
    const { method, payout } = this.value().send;
    return [
      `${this.bookCount()} cuốn`,
      method ? DELIVERY_LABELS[method] : 'Chưa chọn cách gửi',
      payout ? PAYOUT_LABELS[payout] : 'Chưa chọn cách nhận tiền',
    ].join(' · ');
  });

  /** Tên ngắn (2 chữ cuối) và chữ viết tắt cho băng "Đã đăng nhập" */
  protected readonly shortName = computed(() => (this.user()?.fullName ?? '').trim().split(/\s+/).slice(-2).join(' '));
  protected readonly initials = computed(() =>
    this.shortName()
      .split(' ')
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase(),
  );

  protected readonly suggestions = computed(() => this.books().filter((book) => book.title));

  constructor() {
    this.prefillFromAccount();

    // Chi nhánh chỉ bắt buộc khi mang sách đến chi nhánh
    const branch = this.send.controls.branchId;
    this.send.controls.method.valueChanges.pipe(takeUntilDestroyed()).subscribe((method) => {
      branch.setValidators(method === 'store' ? Validators.required : null);
      branch.updateValueAndValidity();
    });

    inject(DestroyRef).onDestroy(() => this.photos().forEach((photo) => URL.revokeObjectURL(photo.url)));
  }

  // ---------- Điều hướng giữa các bước ----------

  protected next(): void {
    const group = this.step() === 1 ? this.items : this.customer;
    if (group.invalid) {
      group.markAllAsTouched();
      this.focusFirstError();
      return;
    }
    this.goTo((this.step() + 1) as Step);
  }

  protected back(): void {
    this.goTo((this.step() - 1) as Step);
  }

  /** Bấm bước đã xong trên stepper để quay lại */
  protected goTo(step: Step): void {
    if (step === this.step() || step < 1 || step > 3) return;
    if (step > this.step() && step - this.step() > 1) return;
    this.direction.set(step > this.step() ? 'next' : 'prev');
    this.step.set(step);
    this.submitError.set('');
    this.scrollToTop();
  }

  // ---------- Bước 1: sách ----------

  protected addItem(): void {
    if (this.items.length >= MAX_BOOKS) return;
    this.items.push(createItem());
  }

  protected removeItem(index: number): void {
    if (this.items.length > 1) this.items.removeAt(index);
  }

  /** Khớp tên hoặc ISBN với sách trong DB thì điền sẵn tác giả và giá bìa (nếu còn trống) */
  protected onTitleChange(item: ItemGroup): void {
    const raw = item.controls.title.value.trim();
    const key = raw.toLowerCase();
    const book = key ? this.books().find((b) => b.title.toLowerCase() === key || (b.isbn && b.isbn === raw)) : undefined;
    item.controls.bookId.setValue(book?._id ?? null);
    if (!book) return;
    item.controls.title.setValue(book.title);
    if (!item.controls.author.value.trim() && book.authorId) item.controls.author.setValue(book.authorName);
    if (item.controls.coverPrice.value == null && book.originalPrice > 0) item.controls.coverPrice.setValue(book.originalPrice);
  }

  protected setQuantity(item: ItemGroup, value: number): void {
    item.controls.quantity.setValue(value);
  }

  protected formatPrice(value: number | null): string {
    return value ? new Intl.NumberFormat('vi-VN').format(value) : '';
  }

  /** Ô giá bìa: chỉ nhận số, tự chấm hàng nghìn */
  protected onPriceInput(item: ItemGroup, event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 9);
    const price = digits ? Number(digits) : null;
    item.controls.coverPrice.setValue(price);
    input.value = this.formatPrice(price);
  }

  protected selectCondition(item: ItemGroup, key: 'cover' | 'spine' | 'pages', id: string): void {
    const control = item.controls[key];
    control.setValue(id);
    control.markAsTouched();
  }

  /** "Không có" loại trừ các lựa chọn khác và ngược lại */
  protected toggleExtra(item: ItemGroup, id: string): void {
    const control = item.controls.extras;
    const current = control.value;
    let next: string[];
    if (current.includes(id)) next = current.filter((value) => value !== id);
    else if (id === EXTRA_NONE) next = [EXTRA_NONE];
    else next = [...current.filter((value) => value !== EXTRA_NONE), id];
    control.setValue(next);
    control.markAsTouched();
  }

  // ---------- Bước 1: ảnh ----------

  protected onPhotoPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addPhotos(Array.from(input.files ?? []));
    input.value = '';
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.addPhotos(Array.from(event.dataTransfer?.files ?? []));
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected removePhoto(photo: Photo): void {
    URL.revokeObjectURL(photo.url);
    this.photos.update((list) => list.filter((item) => item !== photo));
    this.photoError.set('');
  }

  private addPhotos(files: File[]): void {
    const errors: string[] = [];
    const accepted: Photo[] = [];
    for (const file of files) {
      if (!PHOTO_TYPES.includes(file.type)) {
        errors.push(`"${file.name}" không phải ảnh JPG, PNG hoặc WEBP`);
      } else if (file.size > MAX_PHOTO_BYTES) {
        errors.push(`"${file.name}" lớn hơn 5MB`);
      } else if (this.photos().length + accepted.length >= MAX_PHOTOS) {
        errors.push(`Chỉ tải tối đa ${MAX_PHOTOS} ảnh`);
        break;
      } else {
        accepted.push({ file, url: URL.createObjectURL(file) });
      }
    }
    this.photos.update((list) => [...list, ...accepted]);
    this.photoError.set(errors.join('. '));
  }

  // ---------- Bước 2: thông tin ----------

  protected isLocked(field: string): boolean {
    return !this.editingProfile() && this.prefilled().has(field);
  }

  private prefillFromAccount(): void {
    const user = this.user();
    if (!user) return;
    const values = { fullName: user.fullName ?? '', email: user.email ?? '', phone: user.phone ?? '' };
    this.customer.patchValue(values);
    this.prefilled.set(new Set(Object.entries(values).filter(([, value]) => value).map(([key]) => key)));
  }

  // ---------- Bước 3: gửi ----------

  protected setMethod(method: DeliveryMethod): void {
    this.send.controls.method.setValue(method);
  }

  protected setPayout(payout: PayoutMethod): void {
    this.send.controls.payout.setValue(payout);
  }

  protected submit(): void {
    if (this.sending()) return;
    // Phòng trường hợp dữ liệu bước trước bị đổi: quay về bước đầu tiên còn lỗi
    if (this.items.invalid) return this.reopen(1, this.items);
    if (this.customer.invalid) return this.reopen(2, this.customer);
    if (this.send.invalid) {
      this.send.markAllAsTouched();
      this.focusFirstError();
      return;
    }

    const value = this.form.getRawValue();
    const estimate = this.estimate();
    const method = value.send.method!;
    const request: BuybackRequest = {
      items: value.items.map((item) => ({
        bookId: item.bookId,
        title: item.title.trim(),
        author: item.author.trim(),
        quantity: item.quantity,
        coverPrice: item.coverPrice ?? 0,
        condition: { cover: item.cover, spine: item.spine, pages: item.pages, extras: item.extras },
        note: item.note.trim(),
      })),
      customer: {
        ...value.customer,
        fullName: value.customer.fullName.trim(),
        phone: value.customer.phone.replace(/[\s.]/g, ''),
        email: value.customer.email.trim(),
        returnAddress: value.customer.returnAddress.trim(),
      },
      delivery: method,
      branchId: method === 'store' ? value.send.branchId : null,
      payout: value.send.payout!,
      estimate: estimate ?? { min: 0, max: 0 },
    };

    this.sending.set(true);
    this.submitError.set('');
    this.buyback.submitRequest(request, this.photos().map((photo) => photo.file)).subscribe({
      next: (result) => {
        this.sending.set(false);
        this.receipt.set({
          code: result?.requestCode ?? null,
          books: this.bookCount(),
          estimate,
          delivery: method,
          branch: this.branches().find((item) => item._id === request.branchId) ?? null,
          payout: request.payout,
          email: request.customer.email,
        });
        this.scrollToTop();
      },
      error: (error: unknown) => {
        this.sending.set(false);
        this.submitError.set(
          error instanceof BuybackUnavailableError
            ? 'Hệ thống thu mua đang được hoàn thiện nên chưa nhận phiếu online. Bạn vui lòng thử lại sau nhé.'
            : 'Không gửi được yêu cầu. Kiểm tra kết nối mạng rồi thử lại.',
        );
      },
    });
  }

  /** Sau khi gửi xong: làm phiếu mới */
  protected restart(): void {
    this.photos().forEach((photo) => URL.revokeObjectURL(photo.url));
    this.photos.set([]);
    this.items.clear();
    this.items.push(createItem());
    this.send.reset();
    this.receipt.set(null);
    this.direction.set('prev');
    this.step.set(1);
    this.scrollToTop();
  }

  // ---------- Hiển thị lỗi ----------

  /** Lỗi tiếng Việt của một field, chỉ hiện sau khi người dùng đã chạm vào field */
  protected error(control: AbstractControl, field: string): string | null {
    if (!control.touched || !control.errors) return null;
    const messages = MESSAGES[field] ?? {};
    const key = Object.keys(control.errors).find((name) => messages[name]);
    return key ? messages[key] : null;
  }

  private reopen(step: Step, group: AbstractControl): void {
    group.markAllAsTouched();
    this.direction.set('prev');
    this.step.set(step);
    this.focusFirstError();
  }

  /** Chờ template vẽ lỗi xong rồi đưa con trỏ tới field lỗi đầu tiên */
  private focusFirstError(): void {
    setTimeout(() => {
      const target = this.host.querySelector<HTMLElement>('[aria-invalid="true"]');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    });
  }

  /** Đổi bước khi đầu phiếu đã cuộn khuất thì đưa đầu phiếu về trong màn hình */
  private scrollToTop(): void {
    const card = this.card().nativeElement;
    if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
