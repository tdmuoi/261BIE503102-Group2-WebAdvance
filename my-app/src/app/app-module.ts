import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { PageHeader } from './Components/page-header/page-header';
import { PageFooter } from './Components/page-footer/page-footer';

@NgModule({
  declarations: [App, PageHeader, PageFooter],
  imports: [BrowserModule, AppRoutingModule],
  providers: [provideBrowserGlobalErrorListeners()],
  bootstrap: [App],
})
export class AppModule {}
