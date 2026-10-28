import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { AppRoutingModule } from './app-routing-module';
import { SharedModule } from './shared/shared-module';
import { App } from './app';
import { PageHeader } from './Components/page-header/page-header';
import { PageFooter } from './Components/page-footer/page-footer';
import { Homepage } from './Pages/homepage/homepage';
import { AboutUs } from './Pages/about-us/about-us';
import { BrowseBook } from './Pages/browse-book/browse-book';
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
import { Marquee } from './Components/marquee/marquee';
import { HomeHero } from './Pages/homepage/sections/home-hero/home-hero';
import { HomeSearch } from './Pages/homepage/sections/home-search/home-search';
import { HomeFlashSale } from './Pages/homepage/sections/home-flash-sale/home-flash-sale';
import { HomeNewReleases } from './Pages/homepage/sections/home-new-releases/home-new-releases';
import { HomeAuthors } from './Pages/homepage/sections/home-authors/home-authors';
import { HomeCombos } from './Pages/homepage/sections/home-combos/home-combos';
import { HomeBestsellers } from './Pages/homepage/sections/home-bestsellers/home-bestsellers';
import { HomeRecommendations } from './Pages/homepage/sections/home-recommendations/home-recommendations';
import { HomeBestPanel } from './Pages/homepage/sections/home-best-panel/home-best-panel';
import { HomeDealCard } from './Pages/homepage/sections/home-deal-card/home-deal-card';
import { ToastHost } from './Components/toast/toast';
import { Pagination } from './Components/pagination/pagination';
import { BrowseBanner } from './Pages/browse-book/sections/browse-banner/browse-banner';
import { BrowseFilters } from './Pages/browse-book/sections/browse-filters/browse-filters';
import { BrowseEmpty } from './Pages/browse-book/sections/browse-empty/browse-empty';
import { BrowsePrice } from './Pages/browse-book/sections/browse-price/browse-price';
import { BrowseMenu } from './Components/browse-menu/browse-menu';

@NgModule({
  declarations: [
    App,
    PageHeader,
    PageFooter,
    Homepage,
    AboutUs,
    BrowseBook,
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
    Marquee,
    HomeHero,
    HomeSearch,
    HomeFlashSale,
    HomeNewReleases,
    HomeAuthors,
    HomeCombos,
    HomeBestsellers,
    HomeRecommendations,
    HomeBestPanel,
    HomeDealCard,
    ToastHost,
    Pagination,
    BrowseBanner,
    BrowseFilters,
    BrowseEmpty,
    BrowsePrice,
    BrowseMenu,
  ],
  imports: [BrowserModule, AppRoutingModule, SharedModule],
  providers: [provideBrowserGlobalErrorListeners(), provideHttpClient(withFetch())],
  bootstrap: [App],
})
export class AppModule {}
