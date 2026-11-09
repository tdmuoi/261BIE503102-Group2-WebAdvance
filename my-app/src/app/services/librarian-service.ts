import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { BookView } from '../models/book';

/** Sách thủ thư gợi ý: đủ thông tin sách + lý do vì sao hợp với khách */
export interface LibrarianPick extends BookView {
  reason: string;
}

export interface LibrarianReply {
  reply: string;
  /** Câu hỏi lại khi nhu cầu còn mơ hồ, có thể rỗng */
  followUp: string;
  books: LibrarianPick[];
}

/** Một lượt trong lịch sử trò chuyện gửi kèm để thủ thư hiểu câu hỏi tiếp theo */
export interface ChatTurn {
  role: 'user' | 'bot';
  text: string;
}

/** Chatbot Thủ thư Lightbook — POST /api/librarian (Gemini chạy ở my-server) */
@Injectable({ providedIn: 'root' })
export class LibrarianService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/librarian`;

  ask(message: string, history: ChatTurn[]): Observable<LibrarianReply> {
    return this.http.post<LibrarianReply>(this.baseUrl, { message, history });
  }
}
