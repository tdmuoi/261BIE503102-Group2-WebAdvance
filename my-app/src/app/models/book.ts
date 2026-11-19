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

  publisher?: string | null;
  publishYear?: number | null;
  pages?: number | null;
  description?: string | null;

  bookType?: BookType;
  ebookReady?: boolean;

  slug?: string;
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

export type BookType = 'new' | 'used' | 'ebook';

export interface BookImage {
  url: string;
  label: string;
}

export interface Author {
  _id: string;
  name: string;
  desc?: string | null;
  img?: string | null;
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
}

export interface BookView extends Book {
  authorName: string;
  categoryName: string;
}

export interface CatalogBook extends BookView {
  categorySlug: string;
  type: BookType;
}

export interface Catalog {
  books: CatalogBook[];
  authors: Author[];
  categories: Category[];
}

export interface Review {
  _id: string;
  userName: string;
  rating: number;
  content: string;
  images?: string[];
  createdAt: string;
  verifiedPurchase: boolean;
  userAvatar?: string | null;
  helpfulCount: number;
  notHelpfulCount?: number;
  myVote?: ReviewVote;
  isMine?: boolean;
}

export type ReviewVote = 1 | -1 | 0;

export interface ReviewVoteResult {
  helpfulCount: number;
  notHelpfulCount: number;
  myVote: ReviewVote;
}
