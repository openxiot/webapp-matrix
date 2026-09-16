import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { FullscreenOverlayContainer, OverlayContainer } from '@angular/cdk/overlay';

import { routes } from './app.routes';
import { icons } from './icons-provider';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { zh_CN, provideNzI18n } from 'ng-zorro-antd/i18n';
import { registerLocaleData } from '@angular/common';
import zh from '@angular/common/locales/zh';
import { provideNzDateFnsAdapter } from 'ng-zorro-antd/core/time';
import { OxHttpInterceptor } from './service/interceptors/OxHttpInterceptor';
import { JwtInterceptor } from './service/interceptors/JwtInterceptor';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { provideTranslateService } from '@ngx-translate/core';

registerLocaleData(zh);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()),
    provideNzIcons(icons),
    provideNzI18n(zh_CN),
    /*
     * 弹窗/下拉/提示的 overlay 容器默认挂在 document.body 上，而浏览器只绘制
     * 全屏元素及其子树 —— 于是 3D 区域一进全屏，标注空间、绑定设备的弹窗就
     * 整个不可见，点了像没反应。换 CDK 这个全屏感知的容器，让它在
     * fullscreenchange 时把容器挪进全屏元素、退出时挪回 body。
     */
    { provide: OverlayContainer, useClass: FullscreenOverlayContainer },
    provideNzDateFnsAdapter(),
    provideHttpClient(withInterceptors([OxHttpInterceptor, JwtInterceptor])),
    provideTranslateService({
      lang: 'en',
      fallbackLang: 'en',
      loader: provideTranslateHttpLoader({
        prefix: 'i18n/',
        suffix: '.json',
      }),
    }),
  ],
};
