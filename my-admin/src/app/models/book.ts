/** Sách trong trang admin (GET /api/admin/books) — đã ghép sẵn authorName, categoryName */
export interface AdminBook {
  _id: string;
  title: string;
  image: string | null;
  authorId: string | null;
  authorName: string;
  categoryId: string | null;
  categoryName: string;
  price: number;
  originalPrice: number;
  discountPercent: number;
  stock: number;
  /** active: đang bán | hidden: ẩn khỏi web khách */
  status: 'active' | 'hidden' | string;
  isbn: string | null;
  publisher?: string | null;
  publishYear?: number | null;
  pages?: number | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Bộ lọc danh sách sách */
export interface BookQuery {
  q?: string;
  /** '' = tất cả | active | hidden | low (sắp hết) | out (hết hàng) */
  status?: '' | 'active' | 'hidden' | 'low' | 'out';
  categoryId?: string;
  sort?: 'newest' | 'updated' | 'title' | 'price_asc' | 'price_desc' | 'stock_asc';
  page?: number;
  limit?: number;
}

export interface BookListResponse {
  items: AdminBook[];
  total: number;
  page: number;
  limit: number;
  counts: { all: number; active: number; hidden: number; low: number; out: number };
  lowStockThreshold: number;
}

/** Dữ liệu form Thêm/Sửa gửi lên server */
export interface BookPayload {
  title: string;
  /** Chọn tác giả có sẵn thì gửi authorId; gõ tên mới thì gửi authorName (server tự tạo tác giả) */
  authorId: string | null;
  authorName: string;
  categoryId: string;
  image: string;
  isbn: string;
  publisher: string;
  publishYear: number | null;
  pages: number | null;
  description: string;
  price: number | null;
  originalPrice: number | null;
  stock: number | null;
  status: 'active' | 'hidden';
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
}

export interface Author {
  _id: string;
  name: string;
}

/** Lỗi validate server trả về: { message, errors: { title: '...', price: '...' } } */
export type FieldErrors = Partial<Record<keyof BookPayload, string>>;
