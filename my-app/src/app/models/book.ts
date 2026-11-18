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

  // Admin nhập được các field này (my-server/routes/admin-books.js), sách cũ có thể chưa có
  publisher?: string | null;
  publishYear?: number | null;
  pages?: number | null;
  description?: string | null;

  /** Loại sách: GET /api/books?format=new,used lọc theo field này */
  bookType?: BookType;
  /** Server đã xác minh PDF liên kết; không liên quan tồn kho vật lý. */
  ebookReady?: boolean;

  // Chưa có trong DB — giao diện tự ẩn phần tương ứng khi thiếu, backend thêm vào là hiện
  slug?: string;
  /** Hạng tình trạng sách cũ: 'like-new' | 'good' | 'fair' (DB hiện chỉ ghi "used") */
  condition?: string | null;
  conditionLabel?: string | null;
  translator?: string | null;
  images?: BookImage[];
  size?: string | null;
  coverType?: string | null;
  language?: string | null;
  rating?: number;
  reviewCount?: number;
  soldCount?: number;
}

/** Loại sách trên trang Browse (?type=): mới / cũ / điện tử */
export type BookType = 'new' | 'used' | 'ebook';

/** Ảnh sách kèm nhãn: Bìa trước, Bìa sau, Trang 12–13, Gáy sách... */
export interface BookImage {
  url: string;
  label: string;
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

/** Sách trong danh mục web khách: thêm slug thể loại và loại sách để lọc */
export interface CatalogBook extends BookView {
  categorySlug: string;
  type: BookType;
}

/** Dữ liệu dùng chung cho header, trang Browse và trang chi tiết sách */
export interface Catalog {
  books: CatalogBook[];
  authors: Author[];
  categories: Category[];
}

/** Đánh giá của độc giả (GET /api/books/:id/reviews — xem BookService.getReviews) */
export interface Review {
  _id: string;
  userName: string;
  rating: number;
  content: string;
  /** Link ảnh đính kèm (Cloudinary), tối đa 3 */
  images?: string[];
  createdAt: string;
  verifiedPurchase: boolean;
  /** Ảnh đại diện hiện tại của người viết (null khi ẩn danh / chưa đặt ảnh) */
  userAvatar?: string | null;
  helpfulCount: number;
  notHelpfulCount?: number;
  /** Vote của người đang đăng nhập: 1 hữu ích, -1 không hữu ích, 0 chưa vote */
  myVote?: ReviewVote;
  /** Đánh giá do chính người đang đăng nhập viết (không tự vote được) */
  isMine?: boolean;
}

export type ReviewVote = 1 | -1 | 0;

/** Kết quả POST /api/reviews/:id/vote */
export interface ReviewVoteResult {
  helpfulCount: number;
  notHelpfulCount: number;
  myVote: ReviewVote;
}
