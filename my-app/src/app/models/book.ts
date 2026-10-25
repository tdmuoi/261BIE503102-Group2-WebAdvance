/** Sách như my-server trả về từ GET /api/books */
export interface Book {
  _id: string;
  title: string;
  image: string;
  authorId: string | null;
  categoryId: string | null;
  price: number;
  originalPrice: number;
  discountPercent: number;
  stock: number;
  status: string;
  isbn: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Tác giả từ GET /api/authors */
export interface Author {
  _id: string;
  name: string;
  desc?: string | null;
  img?: string | null;
}

/** Thể loại từ GET /api/categories */
export interface Category {
  _id: string;
  name: string;
  slug: string;
}

/** Sách đã ghép sẵn tên tác giả và tên thể loại để hiển thị */
export interface BookView extends Book {
  authorName: string;
  categoryName: string;
}
