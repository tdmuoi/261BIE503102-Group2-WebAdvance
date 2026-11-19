import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';

import { CatalogBook } from '../models/book';
import { BookService } from './book-service';

export interface AuthorProfile {
  id: string;
  name: string;
  desc: string;
  photo: string | null;
  initials: string;
  letter: string;
  books: CatalogBook[];
  genres: string[];
  updatedAt: string | null;
}

export const VI_LETTERS = 'AĂÂBCDĐEÊGHIKLMNOÔƠPQRSTUƯVXY'.split('');

export function toInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return picked
    .map((word) => word[0])
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'D')
    .toUpperCase();
}

function toLetter(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  if (first === 'Đ') return 'Đ';
  const base = first.normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC');
  return VI_LETTERS.includes(base) ? base : /[A-Z]/.test(base) ? base : '#';
}

@Injectable({ providedIn: 'root' })
export class AuthorDirectoryService {
  private readonly bookService = inject(BookService);

  private profiles$?: Observable<AuthorProfile[]>;

  getProfiles(): Observable<AuthorProfile[]> {
    this.profiles$ ??= this.bookService.getCatalog().pipe(
      map(({ books, authors }) => {
        const byAuthor = new Map<string, CatalogBook[]>();
        for (const book of books) {
          if (!book.authorId) continue;
          const list = byAuthor.get(book.authorId) ?? [];
          list.push(book);
          byAuthor.set(book.authorId, list);
        }

        return authors
          .map((author) => {
            const own = byAuthor.get(author._id) ?? [];
            return {
              id: author._id,
              name: author.name,
              desc: author.desc?.trim() ?? '',
              photo: author.img && /^https?:\/\//.test(author.img) ? author.img : null,
              initials: toInitials(author.name),
              letter: toLetter(author.name),
              books: own,
              genres: rankGenres(own),
              updatedAt: own.reduce<string | null>((latest, b) => (!latest || b.updatedAt > latest ? b.updatedAt : latest), null),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      }),
      shareReplay(1),
    );
    return this.profiles$;
  }

  getProfile(id: string): Observable<AuthorProfile | null> {
    return this.getProfiles().pipe(map((list) => list.find((author) => author.id === id) ?? null));
  }
}

function rankGenres(books: CatalogBook[]): string[] {
  const counts = new Map<string, number>();
  for (const book of books) {
    if (book.categoryId) counts.set(book.categoryName, (counts.get(book.categoryName) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi')).map(([name]) => name);
}
