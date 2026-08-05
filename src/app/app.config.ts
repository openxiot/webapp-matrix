import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { icons } from './icons-provider';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { zh_CN, provideNzI18n } from 'ng-zorro-antd/i18n';
import { registerLocaleData } from '@angular/common';
import zh from '@angular/common/locales/zh';
import { provideNzDateFnsAdapter } from 'ng-zorro-antd/core/time';
import { OxHttpInterceptor } from './service/interceptors/OxHttpInterceptor';
import { JwtInterceptor } from './service/interceptors/JwtInterceptor';

registerLocaleData(zh);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()),
    provideNzIcons(icons),
    provideNzI18n(zh_CN),
    provideNzDateFnsAdapter(),
    provideHttpClient(
      withFetch(),
      withInterceptors([OxHttpInterceptor, JwtInterceptor]),
    ),
  ],
};
