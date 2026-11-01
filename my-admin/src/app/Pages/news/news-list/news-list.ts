import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { ChangeDetectorRef } from '@angular/core';
import { NewsPage, NewsService, newsError } from '../news-service';
@Component({
  selector: 'app-news-list',
  standalone: false,
  styleUrl: './news-list.css',
  templateUrl: './news-list.html',
})
export class NewsList implements OnInit, OnDestroy {
  private service = inject(NewsService);
  private cdr = inject(ChangeDetectorRef);
  private request?: Subscription;
  data?: NewsPage;
  search = '';
  category = '';
  status = '';
  page = 1;
  pageSize = 10;
  loading = false;
  error = '';
  ngOnInit() {
    this.load();
  }
  ngOnDestroy() {
    this.request?.unsubscribe();
  }
  load(page = 1) {
    this.request?.unsubscribe();
    this.page = page;
    this.loading = true;
    this.error = '';
    this.request = this.service
      .list({
        search: this.search.trim(),
        category: this.category,
        status: this.status,
        limit: this.pageSize,
        skip: (page - 1) * this.pageSize,
      })
      .subscribe({
        next: (data) => {
          this.data = data;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.error = newsError(error);
          this.loading = false;
          this.data = undefined;
          this.cdr.markForCheck();
        },
      });
  }
}
