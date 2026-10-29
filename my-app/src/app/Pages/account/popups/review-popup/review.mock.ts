import { Observable, delay, of } from 'rxjs';

// TODO: thay bằng API — my-server chưa có POST /api/reviews và GET /api/account/reviews.
// Khi backend xong: đổi USE_MOCK_REVIEWS = false.
export const USE_MOCK_REVIEWS = true;

/** Body POST /api/reviews (ảnh gửi kèm dạng multipart khi có API) */
export interface ReviewRequest {
  bookId: string;
  rating: number;
  tags: string[];
  content: string;
  anonymous: boolean;
  photoCount: number;
}

const STORE_KEY = 'lightbook.mock.reviews';

/** bookId → số sao đã chấm. Mẫu: "The Roman" đã đánh giá 5 sao (Figma "Sách đã mua") */
function read(): Record<string, number> {
  try {
    return { 'mock-roman-used': 5, ...(JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, number>) };
  } catch {
    return { 'mock-roman-used': 5 };
  }
}

export function mockGetMyRatings(): Observable<Record<string, number>> {
  return of(read()).pipe(delay(200));
}

export function mockSubmitReview(body: ReviewRequest): Observable<{ bookId: string; rating: number }> {
  const next = { ...read(), [body.bookId]: body.rating };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    // bỏ qua
  }
  return of({ bookId: body.bookId, rating: body.rating }).pipe(delay(600));
}
