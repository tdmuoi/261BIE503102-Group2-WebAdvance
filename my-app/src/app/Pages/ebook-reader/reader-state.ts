// Trạng thái trình đọc ebook. Nội dung sách là file PDF (pdf-book.ts).
// Tiến độ / đánh dấu / ghi chú lưu trên server (PUT /api/account/ebooks/:bookId/progress), localStorage chỉ là bản nháp.

/** Một mục lục lấy từ bookmark của file PDF */
export interface Chapter {
  index: number;
  title: string;
  startPage: number;
}

export function chapterOf(chapters: Chapter[], page: number): Chapter | null {
  return [...chapters].reverse().find((c) => c.startPage <= page) ?? null;
}

/** Lật trang 2 trang: cặp 1–2, 3–4, … → trang trái của cặp chứa `page` */
export function spreadStart(page: number): number {
  return page - ((page - 1) % 2);
}

/** Các trang đang mở khi lật trang: 2 trang (màn hình rộng) hoặc 1 trang */
export function spreadPages(page: number, total: number, twoUp: boolean): number[] {
  if (!twoUp) return [page];
  const left = spreadStart(page);
  return left + 1 <= total ? [left, left + 1] : [left];
}

// ---------------- Tiến độ, đánh dấu, ghi chú, tô sáng (server + bản nháp localStorage) ----------------

export interface ReaderNote {
  id: string;
  page: number;
  quote: string;
  text: string;
}

export interface ReaderState {
  page: number;
  bookmarks: number[];
  notes: ReaderNote[];
  /** Câu đã tô sáng, theo trang */
  highlights: { page: number; text: string }[];
  lastReadAt: string | null;
}

export type ReaderTheme = 'white' | 'paper' | 'dark';
export type ReadMode = 'page' | 'scroll';

export interface ReaderSettings {
  /** Thu phóng trang PDF, % */
  zoom: number;
  theme: ReaderTheme;
  mode: ReadMode;
}

export const DEFAULT_SETTINGS: ReaderSettings = { zoom: 100, theme: 'paper', mode: 'page' };
export const ZOOM_MIN = 70;
export const ZOOM_MAX = 160;

const stateKey = (bookId: string) => `lightbook.reader.${bookId}`;
const SETTINGS_KEY = 'lightbook.reader.settings';

function emptyState(page: number): ReaderState {
  return { page: Math.max(1, page), bookmarks: [], notes: [], highlights: [], lastReadAt: null };
}

/** Bản nháp trên trình duyệt (xoá khi đăng xuất). startPage: trang đang đọc theo tủ sách */
export function loadState(bookId: string, startPage = 1): ReaderState {
  try {
    const raw = localStorage.getItem(stateKey(bookId));
    if (raw) return { ...emptyState(startPage), ...(JSON.parse(raw) as Partial<ReaderState>) };
  } catch {
    // bỏ qua
  }
  return emptyState(startPage);
}

export function saveState(bookId: string, state: ReaderState): void {
  try {
    localStorage.setItem(stateKey(bookId), JSON.stringify(state));
  } catch {
    // bỏ qua
  }
}

export function loadSettings(): ReaderSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<ReaderSettings>;
    const zoom = Number(saved.zoom);
    return {
      zoom: Number.isFinite(zoom) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)) : DEFAULT_SETTINGS.zoom,
      theme: saved.theme === 'white' || saved.theme === 'dark' || saved.theme === 'paper' ? saved.theme : DEFAULT_SETTINGS.theme,
      mode: saved.mode === 'scroll' ? 'scroll' : 'page',
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: ReaderSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // bỏ qua
  }
}

/** "Còn khoảng 1 giờ 20 phút đọc" — ước tính ~1 phút/trang */
export function remainingLabel(pagesLeft: number): string {
  const minutes = Math.max(0, Math.round(pagesLeft));
  if (minutes === 0) return 'Đã đến trang cuối';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `Còn khoảng ${h ? `${h} giờ ` : ''}${m ? `${m} phút ` : ''}đọc`.replace(/\s+đọc$/, ' đọc');
}

/** Bỏ dấu cách thừa — so khớp chữ trên lớp chữ PDF với câu đã tô sáng */
export function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
