import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { Homepage } from './Pages/homepage/homepage';
import { BrowseBook } from './Pages/browse-book/browse-book';
import { Cart } from './Pages/cart/cart';
import { Checkout } from './Pages/checkout/checkout';
import { AboutUs } from './Pages/about-us/about-us';
import { Login } from './Pages/auth/login/login';
import { Register } from './Pages/auth/register/register';
import { ForgotPassword } from './Pages/auth/forgot-password/forgot-password';
import { Account } from './Pages/account/account';
import { ProfileInfo } from './Pages/account/profile-info/profile-info';
import { Address } from './Pages/account/address/address';
import { BookshelfEbooks } from './Pages/account/bookshelf-ebooks/bookshelf-ebooks';
import { BookshelfPurchased } from './Pages/account/bookshelf-purchased/bookshelf-purchased';
import { Wishlist } from './Pages/account/wishlist/wishlist';
import { Orders } from './Pages/account/orders/orders';
import { Notifications } from './Pages/account/notifications/notifications';
import { EbookReader } from './Pages/ebook-reader/ebook-reader';
import { PageNotFound } from './Pages/page-not-found/page-not-found';
import { authGuard } from './guards/auth-guard';


const routes: Routes = [
  { path: '', component: Homepage },
  { path: 'books', component: BrowseBook },
  { path: 'browse-book', redirectTo: 'books' },   // link cũ (trang chủ, header) — giữ nguyên query params
  // Trang chi tiết sách tải riêng (lazy) để bundle ban đầu không vượt budget 500kB
  {
    path: 'books/:slug',
    loadChildren: () => import('./Pages/product-detail/product-detail-module').then((m) => m.ProductDetailModule),
  },
  { path: 'product-detail/:id', redirectTo: 'books/:id' },   // link cũ: book-card, các section trang chủ
  { path: 'cart', component: Cart },
  { path: 'checkout', component: Checkout, canActivate: [authGuard]},
  // Trang Tác giả tải riêng (lazy): /authors, /authors/events, /authors/:id, /authors/:id/works
  {
    path: 'authors',
    loadChildren: () => import('./Pages/author/author-module').then((m) => m.AuthorModule),
  },
  { path: 'author-list', redirectTo: 'authors' },   // link cũ (trang chủ)
  { path: 'author-events', redirectTo: 'authors/events' },
  { path: 'author-detail/:id', redirectTo: 'authors/:id' },
  { path: 'author-works/:id', redirectTo: 'authors/:id/works' },
  // Trang thu mua sách cũng tải riêng (lazy) để không làm bundle ban đầu lớn thêm
  {
    path: 'book-buyback',
    loadChildren: () => import('./Pages/book-buyback/book-buyback-module').then((m) => m.BookBuybackModule),
  },
  // Lightbook News tải riêng (lazy): /news, /news/:id
  {
    path: 'news',
    loadChildren: () => import('./Pages/news/news-module').then((m) => m.NewsModule),
  },
  { path: 'news-list', redirectTo: 'news' },   // link cũ
  { path: 'news-detail/:id', redirectTo: 'news/:id' },
  { path: 'about-us', component: AboutUs },
  { path: 'login', component: Login },
  { path: 'register', component: Register },
  { path: 'forgot-password', component: ForgotPassword },
  {
    path: 'account', component: Account, canActivate: [authGuard], children: [
      { path: '', redirectTo: 'profile-info', pathMatch: 'full' },
      { path: 'profile-info', component: ProfileInfo },
      { path: 'address', component: Address },
      { path: 'bookshelf-ebooks', component: BookshelfEbooks },
      { path: 'bookshelf-purchased', component: BookshelfPurchased },
      { path: 'wishlist', component: Wishlist },
      { path: 'orders', component: Orders },
      { path: 'notifications', component: Notifications },
    ]
  },
  { path: 'ebook-reader/:id', component: EbookReader },
  { path: '**', component: PageNotFound },   // luôn để cuối cùng
];

@NgModule({
  // scrollPositionRestoration: chuyển trang thì tự cuộn lên đầu
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'top' })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
