export interface Chapter {
  index: number;
  title: string;
  startPage: number;
}

export function chapterOf(chapters: Chapter[], page: number): Chapter | null {
  return [...chapters].reverse().find((c) => c.startPage <= page) ?? null;
}

export function spreadStart(page: number): number {
  return page - ((page - 1) % 2);
}

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
  highlights: { page: number; text: string }[];
  lastReadAt: string | null;
}

export type ReaderTheme = 'white' | 'paper' | 'dark';
export type ReadMode = 'page' | 'scroll';

export interface ReaderSettings {
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

export function loadState(bookId: string, startPage = 1): ReaderState {
  try {
    const raw = localStorage.getItem(stateKey(bookId));
    if (raw) return { ...emptyState(startPage), ...(JSON.parse(raw) as Partial<ReaderState>) };
  } catch {
  }
  return emptyState(startPage);
}

export function saveState(bookId: string, state: ReaderState): void {
  try {
    localStorage.setItem(stateKey(bookId), JSON.stringify(state));
  } catch {
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
  }
}

export function remainingLabel(pagesLeft: number): string {
  const minutes = Math.max(0, Math.round(pagesLeft));
  if (minutes === 0) return 'Đã đến trang cuối';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `Còn khoảng ${h ? `${h} giờ ` : ''}${m ? `${m} phút ` : ''}đọc`.replace(/\s+đọc$/, ' đọc');
}

export function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
