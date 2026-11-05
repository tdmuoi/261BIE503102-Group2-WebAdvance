import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface LoginBook {
  _id: string;
  title: string;
  image: string;
}

@Injectable({ providedIn: 'root' })
export class LoginBooksService {
  private readonly http = inject(HttpClient);

  getBooks() {
    // Public catalogue: no Admin session, cookie or CSRF dependency.
    // Keep extra candidates so a broken cover can be replaced without another request.
    return this.http.get<unknown>(`${environment.apiUrl}/books`, {
      params: { limit: 200, sort: 'newest' },
      withCredentials: false,
    }).pipe(
      timeout(10000),
      map((response): LoginBook[] => {
        if (!Array.isArray(response)) throw new Error('Invalid public Books response');
        const ids = new Set<string>();
        const images = new Set<string>();
        const books: LoginBook[] = [];
        for (const book of response) {
          if (!book || typeof book._id !== 'string' || !book._id.trim() ||
              typeof book.title !== 'string' || !book.title.trim() ||
              typeof book.image !== 'string') continue;
          const image = book.image.trim();
          const validImage = /^data:image\/(?:png|jpeg|jpg|webp|gif|avif);base64,[a-z\d+/=\s]+$/i.test(image) ||
            /^\/(?!\/)[^\s\\]+$/.test(image) || /^(?:\.\/)?images\/[^\s\\]+$/.test(image) ||
            (() => {
              try {
                const url = new URL(image);
                return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
              } catch { return false; }
            })();
          if (!validImage || ids.has(book._id) || images.has(image)) continue;
          ids.add(book._id);
          images.add(image);
          books.push({ _id: book._id, title: book.title.trim(), image });
        }
        return books;
      }),
    );
  }
}
