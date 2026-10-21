import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { AdminLayout } from './Components/admin-layout/admin-layout';
import { Login } from './Pages/login/login';
import { Dashboard } from './Pages/dashboard/dashboard';
import { BookList } from './Pages/books/book-list/book-list';
import { BookForm } from './Pages/books/book-form/book-form';
import { Banners } from './Pages/banners/banners';
import { NewsList } from './Pages/news/news-list/news-list';
import { NewsEditor } from './Pages/news/news-editor/news-editor';
import { Accounts } from './Pages/accounts/accounts';
import { CustomerDetail } from './Pages/accounts/customer-detail/customer-detail';
import { Orders } from './Pages/orders/orders';
import { BuybackRequests } from './Pages/buyback-requests/buyback-requests';
import { Vouchers } from './Pages/vouchers/vouchers';
import { Refunds } from './Pages/refunds/refunds';
import { Settings } from './Pages/settings/settings';
import { PageNotFound } from './Pages/page-not-found/page-not-found';

@NgModule({
  declarations: [
    App,
    AdminLayout,
    Login,
    Dashboard,
    BookList,
    BookForm,
    Banners,
    NewsList,
    NewsEditor,
    Accounts,
    CustomerDetail,
    Orders,
    BuybackRequests,
    Vouchers,
    Refunds,
    Settings,
    PageNotFound,
  ],
  imports: [BrowserModule, AppRoutingModule],
  providers: [provideBrowserGlobalErrorListeners()],
  bootstrap: [App],
})
export class AppModule {}
