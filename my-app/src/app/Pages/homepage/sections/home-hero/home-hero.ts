import { Component } from '@angular/core';

interface HeroBook {
  src: string;
  alt: string;
  /** Vị trí tâm và bề rộng, tính theo % khung 1440 × 342 của Figma */
  x: number;
  y: number;
  width: number;
  layer: number;
}

@Component({
  selector: 'app-home-hero',
  standalone: false,
  styleUrl: './home-hero.css',
  templateUrl: './home-hero.html',
})
export class HomeHero {
  // Ảnh trang trí xuất từ Figma (Hero header section 772:1454)
  protected readonly books: HeroBook[] = [
    { src: 'images/hero/book-ho-so-mat.png', alt: 'Bìa sách Hồ Sơ Mật', x: 58.61, y: 51.96, width: 22.81, layer: 1 },
    { src: 'images/hero/book-nhung-mien-linh-di.png', alt: 'Bìa sách Những Miền Linh Dị', x: 79.58, y: 49.36, width: 24.44, layer: 2 },
    { src: 'images/hero/book-being-in-love.png', alt: 'Bìa sách Yêu – Being in Love', x: 37.23, y: 51.05, width: 24.17, layer: 3 },
    { src: 'images/hero/book-bo-con-ca-gai.png', alt: 'Bìa sách Bố Con Cá Gai', x: 16.28, y: 52.2, width: 22.88, layer: 4 },
  ];

  protected readonly stripItems = [
    'Reading made simple',
    'Handpicked indie titles',
    'Curated books delivered',
    'Monthly author discussions',
    'Cozy weekend sanctuary',
  ];
}
