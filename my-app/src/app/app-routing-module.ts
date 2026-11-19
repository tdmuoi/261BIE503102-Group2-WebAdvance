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
import { PageNotFound } from './Pages/page-not-found/page-not-found';
import { authGuard } from './guards/auth-guard';


const routes: Routes = [
  { path: '', component: Homepage },
  { path: 'books', component: BrowseBook },
  { path: 'browse-book', redirectTo: 'books' },
  {
    path: 'books/:slug',
    loadChildren: () => import('./Pages/product-detail/product-detail-module').then((m) => m.ProductDetailModule),
  },
  { path: 'product-detail/:id', redirectTo: 'books/:id' },
  { path: 'cart', component: Cart },
  { path: 'checkout', component: Checkout, canActivate: [authGuard]},
  {
    path: 'authors',
    loadChildren: () => import('./Pages/author/author-module').then((m) => m.AuthorModule),
  },
  { path: 'author-list', redirectTo: 'authors' },
  { path: 'author-events', redirectTo: 'authors/events' },
  { path: 'author-detail/:id', redirectTo: 'authors/:id' },
  { path: 'author-works/:id', redirectTo: 'authors/:id/works' },
  {
    path: 'book-buyback',
    loadChildren: () => import('./Pages/book-buyback/book-buyback-module').then((m) => m.BookBuybackModule),
  },
  {
    path: 'news',
    loadChildren: () => import('./Pages/news/news-module').then((m) => m.NewsModule),
  },
  { path: 'news-list', redirectTo: 'news' },
  { path: 'news-detail/:id', redirectTo: 'news/:id' },
  { path: 'about-us', component: AboutUs },
  { path: 'policies', loadComponent: () => import('./Pages/policies/policies').then((m) => m.Policies) },
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
  { path: 'ebook-reader/:id', loadComponent: () => import('./Pages/ebook-reader/ebook-reader').then(m => m.EbookReader) },
  { path: '**', component: PageNotFound },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'disabled', anchorScrolling: 'enabled' })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
