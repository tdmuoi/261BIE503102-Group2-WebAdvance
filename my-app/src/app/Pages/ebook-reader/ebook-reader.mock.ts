// TODO: thay bằng API — my-server chưa có nội dung ebook (GET /api/account/ebooks/:id/content), trang đang hiện nội dung minh hoạ.
// Tiến độ / đánh dấu / ghi chú đã lưu trên server (PUT /api/account/ebooks/:bookId/progress), localStorage chỉ là bản nháp.

export interface Chapter {
  index: number;
  title: string;
  startPage: number;
}

export interface ReaderPage {
  number: number;
  chapter: Chapter;
  /** "Nội dung minh hoạ" */
  heading: string;
  paragraphs: string[];
}

/** Nội dung minh hoạ lấy đúng frame Figma "Đọc ebook" — sách thật chưa có API */
export const SAMPLE_HEADING = 'Nội dung minh hoạ';
export const SAMPLE_PARAGRAPHS = [
  'Đây là đoạn văn mẫu để minh hoạ trình đọc ebook của Lightbook. Nội dung thật của từng cuốn sách sẽ hiển thị tại đây, với cỡ chữ, khoảng cách dòng và màu nền do người đọc tự chọn.',
  'Khi đọc, người dùng có thể bôi đen một câu để tô sáng, thêm ghi chú hoặc tra từ. Những đoạn đã tô sáng được lưu lại trong mục “Đánh dấu & ghi chú” và đồng bộ giữa web với app.',
  'Thanh tiến độ ở cuối trang cho biết bạn đang ở trang nào, đã đọc được bao nhiêu phần trăm và còn khoảng bao lâu nữa thì hết chương.',
];

/** Mục lục mẫu theo Figma: 8 chương, trang bắt đầu tính trên cuốn 140 trang */
const BASE_STARTS = [1, 19, 41, 63, 80, 97, 113, 128];
const BASE_TOTAL = 140;

/** Chia 8 chương theo tổng số trang của cuốn sách */
export function buildChapters(totalPages: number): Chapter[] {
  const total = Math.max(totalPages, BASE_STARTS.length);
  let last = 0;
  return BASE_STARTS.map((start, i) => {
    const page = Math.max(last + 1, Math.round(((start - 1) / BASE_TOTAL) * total) + 1);
    last = page;
    return { index: i + 1, title: `Chương ${i + 1}`, startPage: page };
  });
}

export function chapterOf(chapters: Chapter[], page: number): Chapter {
  return [...chapters].reverse().find((c) => c.startPage <= page) ?? chapters[0];
}

export function mockGetPage(chapters: Chapter[], page: number): ReaderPage {
  return { number: page, chapter: chapterOf(chapters, page), heading: SAMPLE_HEADING, paragraphs: SAMPLE_PARAGRAPHS };
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

export type LineSpacing = 'narrow' | 'normal' | 'wide';
export type ReaderFont = 'sans' | 'serif';
export type ReaderTheme = 'white' | 'paper' | 'dark';
export type ReadMode = 'page' | 'scroll';

export interface ReaderSettings {
  fontSize: number;
  lineSpacing: LineSpacing;
  font: ReaderFont;
  theme: ReaderTheme;
  mode: ReadMode;
}

export const DEFAULT_SETTINGS: ReaderSettings = { fontSize: 17, lineSpacing: 'normal', font: 'sans', theme: 'paper', mode: 'page' };
export const FONT_SIZE_MIN = 13;
export const FONT_SIZE_MAX = 24;

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
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<ReaderSettings>) };
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
