import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { PageHeader } from './Components/page-header/page-header';
import { PageFooter } from './Components/page-footer/page-footer';
import { Homepage } from './Pages/homepage/homepage';
import { AboutUs } from './Pages/about-us/about-us';
import { BookCard } from './Components/book-card/book-card';
import { BrowseBook } from './Pages/browse-book/browse-book';
import { ProductDetail } from './Pages/product-detail/product-detail';
import { Cart } from './Pages/cart/cart';
import { Checkout } from './Pages/checkout/checkout';
import { AuthorList } from './Pages/author/author-list/author-list';
import { AuthorDetail } from './Pages/author/author-detail/author-detail';
import { BookBuyback } from './Pages/book-buyback/book-buyback';
import { NewsList } from './Pages/news/news-list/news-list';
import { NewsDetail } from './Pages/news/news-detail/news-detail';
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
import { DownloadPopup } from './Pages/account/popups/download-popup/download-popup';
import { ReviewPopup } from './Pages/account/popups/review-popup/review-popup';
import { BuyAgainDrawer } from './Pages/account/popups/buy-again-drawer/buy-again-drawer';
import { EbookReader } from './Pages/ebook-reader/ebook-reader';
import { PageNotFound } from './Pages/page-not-found/page-not-found';
import { AuthorWorks } from './Pages/author/author-works/author-works';
import { AuthorEvents } from './Pages/author/author-events/author-events';

@NgModule({
  declarations: [
    App,
    PageHeader,
    PageFooter,
    Homepage,
    AboutUs,
    BookCard,
    BrowseBook,
    ProductDetail,
    Cart,
    Checkout,
    AuthorList,
    AuthorDetail,
    BookBuyback,
    NewsList,
    NewsDetail,
    Login,
    Register,
    ForgotPassword,
    Account,
    ProfileInfo,
    Address,
    BookshelfEbooks,
    BookshelfPurchased,
    Wishlist,
    Orders,
    Notifications,
    DownloadPopup,
    ReviewPopup,
    BuyAgainDrawer,
    EbookReader,
    PageNotFound,
    AuthorWorks,
    AuthorEvents,
  ],
  imports: [BrowserModule, AppRoutingModule],
  providers: [provideBrowserGlobalErrorListeners()],
  bootstrap: [App],
})
export class AppModule {}
