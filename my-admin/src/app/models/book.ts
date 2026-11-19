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
  bookType?: 'new' | 'used' | 'ebook';
  condition?: string | null;
  ebookFileId?: string;
  stock: number;
  status: 'active' | 'hidden' | string;
  isbn: string | null;
  publisher?: string | null;
  publishYear?: number | null;
  pages?: number | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookQuery {
  q?: string;
  status?: '' | 'active' | 'hidden' | 'low' | 'out';
  categoryId?: string;
  sort?: 'newest' | 'updated' | 'title' | 'price_asc' | 'price_desc' | 'stock_asc';
  page?: number;
  limit?: number;
}

export interface BookListResponse {
  capabilities?: { bookClassification: boolean };
  items: AdminBook[];
  total: number;
  page: number;
  limit: number;
  counts: { all: number; active: number; hidden: number; low: number; out: number };
  lowStockThreshold: number;
}

export interface BookPayload {
  revision?: string | null;
  title: string;
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
  bookType: 'new' | 'used' | 'ebook';
  condition: string | null;
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

export interface StockInRequest { bookId: string; quantity: number; revision: string | null; note: string; }
export interface InventoryReceipt {
  id: string; operationCode: string; bookId: string; bookTitle: string; quantity: number;
  stockBefore: number; stockAfter: number; actorName: string; createdAt: string; note: string; revision: string;
}
export interface PdfUploadResult { fileId: string; size: number; sha256: string; revision: string; }

export type FieldErrors = Partial<Record<keyof BookPayload, string>>;
