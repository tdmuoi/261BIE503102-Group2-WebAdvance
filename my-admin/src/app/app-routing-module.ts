import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

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
import { Inventory } from './Pages/books/inventory/inventory';
import { OrderDetail } from './Pages/orders/order-detail/order-detail';
import { BuybackDetail } from './Pages/buyback-requests/buyback-detail/buyback-detail';
import { UsersRoles } from './Pages/settings/users-roles/users-roles';
import { PageNotFound } from './Pages/page-not-found/page-not-found';
import { adminAuthGuard, adminAuthChildGuard } from './services/admin-auth-service';

const routes: Routes = [
  { path: 'login', component: Login },              // đăng nhập: không có sidebar
  {
    path: '', component: AdminLayout,
    canActivate: [adminAuthGuard],
    canActivateChild: [adminAuthChildGuard],
    children: [    // các trang có sidebar
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: Dashboard },
      { path: 'book-list', component: BookList },
      { path: 'book-form', component: BookForm },          // thêm sách
      { path: 'book-form/:id', component: BookForm },      // sửa sách
      { path: 'banners', component: Banners },
      { path: 'news-list', component: NewsList },
      { path: 'news-editor', component: NewsEditor },      // viết bài mới
      { path: 'news-editor/:id', component: NewsEditor },  // sửa bài
      { path: 'accounts', component: Accounts },
      { path: 'customer-detail/:id', component: CustomerDetail },
      { path: 'orders', component: Orders },
      { path: 'buyback-requests', component: BuybackRequests },
      { path: 'Pages/buyback-requests', redirectTo: 'buyback-requests' },
      { path: 'vouchers', component: Vouchers },
      { path: 'refunds', component: Refunds },
      { path: 'settings', component: Settings },
      { path: 'inventory', component: Inventory },
      { path: 'order-detail/:id', component: OrderDetail },
      { path: 'buyback-detail', component: BuybackDetail },
      { path: 'buyback-detail/:id', component: BuybackDetail },
      { path: 'users-roles', component: UsersRoles },
      { path: '**', component: PageNotFound },
    ]
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'top' })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
