import { Component, computed, input } from '@angular/core';

import { Author, BookView } from '../../../../models/book';

interface AuthorCard {
  id: string;
  name: string;
  initials: string;
  photo: string | null;
  desc: string;
  bookCount: number;
  tint: string;
}

const TINTS = ['pink', 'mint', 'yellow', 'pink-strong'];

/** Chữ cái đầu, bỏ dấu để font serif hiển thị đúng */
function toInitials(name: string): string {
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

@Component({
  selector: 'app-home-authors',
  standalone: false,
  styleUrls: ['../section-shared.css', './home-authors.css'],
  templateUrl: './home-authors.html',
})
export class HomeAuthors {
  readonly books = input.required<BookView[]>();
  readonly authors = input.required<Author[]>();

  /** 4 tác giả có nhiều đầu sách nhất tại Lightbook */
  protected readonly cards = computed<AuthorCard[]>(() => {
    const counts = new Map<string, number>();
    for (const book of this.books()) {
      if (book.authorId) counts.set(book.authorId, (counts.get(book.authorId) ?? 0) + 1);
    }

    return this.authors()
      .filter((author) => counts.has(author._id))
      .sort((a, b) => counts.get(b._id)! - counts.get(a._id)! || a.name.localeCompare(b.name, 'vi'))
      .slice(0, 4)
      .map((author, index) => ({
        id: author._id,
        name: author.name,
        initials: toInitials(author.name),
        // Chỉ dùng ảnh có địa chỉ đầy đủ; đường dẫn tương đối trong DB không tồn tại ở my-app
        photo: author.img && /^https?:\/\//.test(author.img) ? author.img : null,
        desc: author.desc?.trim() ?? '',
        bookCount: counts.get(author._id)!,
        tint: TINTS[index % TINTS.length],
      }));
  });
}
