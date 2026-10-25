import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Author } from '../models/book';

@Injectable({ providedIn: 'root' })
export class AuthorService {
  private readonly http = inject(HttpClient);

  getAuthors(): Observable<Author[]> {
    return this.http.get<Author[]>(`${environment.apiUrl}/authors`);
  }
}
