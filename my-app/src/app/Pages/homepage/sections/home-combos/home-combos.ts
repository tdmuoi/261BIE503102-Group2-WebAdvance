import { Component, computed, inject, input } from '@angular/core';

import { BookView } from '../../../../models/book';
import { comboPrice } from '../../../../services/combo-service';
import { ToastService } from '../../../../services/toast-service';
import { CartFacade } from '../../../cart/cart-facade';

interface ComboDefinition {
  name: string;
  size: 2 | 3;
  tint: 'pink' | 'mint' | 'yellow';
  /** Từ khoá tìm trong tên sách để chọn sách đúng chủ đề */
  keywords: string[];
  gift?: string;
}

interface Combo {
  name: string;
  tint: string;
  books: BookView[];
  gift?: string;
  price: number;
  originalPrice: number;
  saving: number;
  discountPercent: number;
}

// Tên combo gõ cứng, sách bên trong lấy từ API
const COMBO_DEFINITIONS: ComboDefinition[] = [
  {
    name: 'Chữa lành cuối tuần',
    size: 3,
    tint: 'pink',
    keywords: ['trầm cảm', 'tâm trí', 'mất lòng', 'thiên đường', 'phẫn nộ'],
  },
  {
    name: 'Bí ẩn & lịch sử',
    size: 3,
    tint: 'mint',
    keywords: ['higashino', 'lưỡi dao', 'thịnh vượng', 'không còn hiểu', 'danh tác'],
  },
  {
    name: 'Đọc cùng con',
    size: 2,
    tint: 'yellow',
    keywords: ['chuyện xóm gà', 'tớ là họa sĩ', 'miu bé nhỏ'],
    gift: 'Tặng kèm bookmark Lightbook',
  },
];

const normalize = (text: string) => text.normalize('NFC').toLocaleLowerCase('vi');

@Component({
  selector: 'app-home-combos',
  standalone: false,
  styleUrls: ['../section-shared.css', './home-combos.css'],
  templateUrl: './home-combos.html',
})
export class HomeCombos {
  private readonly facade = inject(CartFacade);
  private readonly toast = inject(ToastService);

  readonly books = input.required<BookView[]>();

  protected readonly combos = computed<Combo[]>(() => {
    const used = new Set<string>();
    const all = this.books();

    // Lượt 1: mọi combo nhận sách đúng chủ đề trước, mỗi từ khoá 1 cuốn theo thứ tự ưu tiên
    const picked = COMBO_DEFINITIONS.map((definition) => {
      const books: BookView[] = [];
      for (const keyword of definition.keywords.map(normalize)) {
        if (books.length === definition.size) break;
        const match = all.find((book) => !used.has(book._id) && normalize(book.title).includes(keyword));
        if (match) {
          books.push(match);
          used.add(match._id);
        }
      }
      return books;
    });

    // Lượt 2: combo nào chưa đủ thì lấy thêm sách chưa dùng
    COMBO_DEFINITIONS.forEach((definition, index) => {
      const books = picked[index];
      for (const book of all) {
        if (books.length === definition.size) break;
        if (!used.has(book._id)) {
          books.push(book);
          used.add(book._id);
        }
      }
    });

    return COMBO_DEFINITIONS.map((definition, index) => {
      const books = picked[index];
      const salePrice = books.reduce((sum, book) => sum + book.price, 0);
      const originalPrice = books.reduce((sum, book) => sum + book.originalPrice, 0);
      const price = comboPrice(salePrice);

      return {
        name: definition.name,
        tint: definition.tint,
        gift: definition.gift,
        books,
        price,
        originalPrice,
        saving: originalPrice - price,
        discountPercent: originalPrice ? Math.round((1 - price / originalPrice) * 100) : 0,
      };
    }).filter((combo) => combo.books.length > 0);
  });

  /** Thêm đủ các cuốn của combo vào giỏ; giỏ hàng tự trừ thêm 10% khi đủ bộ */
  protected addCombo(combo: Combo): void {
    this.facade.addCombo(combo.name, combo.books);
    this.toast.show(`Đã thêm combo “${combo.name}” vào giỏ.`, { label: 'Xem giỏ hàng', path: '/cart' });
  }
}
