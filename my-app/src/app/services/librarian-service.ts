import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { BookView } from '../models/book';

export interface LibrarianPick extends BookView {
  reason: string;
}

export interface LibrarianReply {
  reply: string;
  followUp: string;
  books: LibrarianPick[];
}

export interface ChatTurn {
  role: 'user' | 'bot';
  text: string;
}

@Injectable({ providedIn: 'root' })
export class LibrarianService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/librarian`;

  ask(message: string, history: ChatTurn[]): Observable<LibrarianReply> {
    return this.http.post<LibrarianReply>(this.baseUrl, { message, history });
  }
}
