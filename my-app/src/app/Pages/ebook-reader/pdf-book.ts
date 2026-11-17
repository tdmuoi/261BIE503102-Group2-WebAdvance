import { Injectable, inject } from '@angular/core';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth-service';

/** Một mục trong mục lục PDF (bookmark của file), đã quy ra số trang */
export interface PdfOutlineItem {
  title: string;
  page: number;
}

/** Sách PDF đã mở — component trình đọc chỉ làm việc qua interface này (test dùng bản giả) */
export interface PdfBook {
  readonly numPages: number;
  /** Vẽ trang `page` vào canvas + lớp chữ trong suốt (để bôi đen / sao chép). cssWidth: bề ngang trang trên màn hình */
  renderPage(page: number, canvas: HTMLCanvasElement, textLayer: HTMLElement, cssWidth: number): Promise<void>;
  /** Chữ của trang (dùng cho Tìm trong sách) */
  pageText(page: number): Promise<string>;
  /** Cao / rộng của trang — để giữ chỗ đúng kích thước trước khi vẽ */
  pageRatio(page: number): Promise<number>;
  outline(): Promise<PdfOutlineItem[]>;
  destroy(): void;
}

/** Lỗi mở PDF đã đổi sang câu tiếng Việt cho người đọc */
export class PdfOpenError extends Error {}

/**
 * Mở PDF của ebook bằng pdf.js — GET /api/account/ebooks/:bookId/content (server kiểm tra quyền đọc).
 * pdf.js chỉ được tải khi mở trình đọc (import động), các trang khác không phải tải thư viện này.
 * Server hỗ trợ Range nên pdf.js chỉ tải phần file cần cho trang đang xem.
 */
@Injectable({ providedIn: 'root' })
export class PdfLoader {
  private readonly auth = inject(AuthService);

  async open(bookId: string): Promise<PdfBook> {
    const pdfjs = await import('pdfjs-dist');
    const base = (path: string) => new URL(path, document.baseURI).href;
    pdfjs.GlobalWorkerOptions.workerSrc = base('pdfjs/pdf.worker.min.mjs');
    const task = pdfjs.getDocument({
      url: `${environment.apiUrl}/account/ebooks/${encodeURIComponent(bookId)}/content`,
      httpHeaders: this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined,
      disableAutoFetch: true, // chỉ tải đoạn cần đọc, không tải ngầm cả file
      rangeChunkSize: 256 * 1024,
      cMapUrl: base('pdfjs/cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: base('pdfjs/standard_fonts/'),
      isEvalSupported: false,
    });
    try {
      return new PdfJsBook(await task.promise, pdfjs);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 401 || status === 403 || status === 404) throw new PdfOpenError('Ebook này chưa có trong tủ sách của bạn hoặc chưa có file PDF.');
      throw new PdfOpenError('Không tải được file PDF. Bạn kiểm tra kết nối rồi thử lại nhé.');
    }
  }
}

type PdfJs = typeof import('pdfjs-dist');

class PdfJsBook implements PdfBook {
  private readonly texts = new Map<number, Promise<string>>();
  private readonly tasks = new WeakMap<HTMLCanvasElement, RenderTask>();

  constructor(
    private readonly doc: PDFDocumentProxy,
    private readonly pdfjs: PdfJs,
  ) {}

  get numPages(): number {
    return this.doc.numPages;
  }

  async renderPage(n: number, canvas: HTMLCanvasElement, textLayer: HTMLElement, cssWidth: number): Promise<void> {
    this.tasks.get(canvas)?.cancel();
    const page = await this.doc.getPage(n);
    const scale = cssWidth / page.getViewport({ scale: 1 }).width;
    const viewport = page.getViewport({ scale });
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const task = page.render({ canvasContext: canvas.getContext('2d')!, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
    this.tasks.set(canvas, task);
    try {
      await task.promise;
    } catch (err) {
      if ((err as Error)?.name === 'RenderingCancelledException') return;
      throw err;
    }
    textLayer.replaceChildren();
    textLayer.style.setProperty('--scale-factor', String(scale));
    await new this.pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textLayer, viewport }).render();
  }

  async pageRatio(n: number): Promise<number> {
    const viewport = (await this.doc.getPage(n)).getViewport({ scale: 1 });
    return viewport.height / viewport.width;
  }

  pageText(n: number): Promise<string> {
    let text = this.texts.get(n);
    if (!text) {
      text = this.doc
        .getPage(n)
        .then((p) => p.getTextContent())
        .then((c) => c.items.map((i) => ('str' in i ? i.str : '')).join(' ').replace(/\s+/g, ' ').trim());
      this.texts.set(n, text);
    }
    return text;
  }

  async outline(): Promise<PdfOutlineItem[]> {
    const items = (await this.doc.getOutline()) ?? [];
    const out: PdfOutlineItem[] = [];
    for (const item of items) {
      try {
        const dest = typeof item.dest === 'string' ? await this.doc.getDestination(item.dest) : item.dest;
        const ref = dest?.[0];
        const index = typeof ref === 'number' ? ref : ref ? await this.doc.getPageIndex(ref) : -1;
        if (index >= 0) out.push({ title: item.title.trim() || `Trang ${index + 1}`, page: index + 1 });
      } catch {
        // mục lục trỏ sai trang thì bỏ qua mục đó
      }
    }
    return out.sort((a, b) => a.page - b.page);
  }

  destroy(): void {
    void this.doc.destroy();
  }
}
