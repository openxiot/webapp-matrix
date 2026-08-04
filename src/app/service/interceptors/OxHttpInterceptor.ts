import {HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpRequest, HttpResponse} from "@angular/common/http";
import {catchError, map, Observable, throwError} from "rxjs";
import {OxResponse} from "../response/OxResponse";
import {Router} from '@angular/router';
import {inject} from '@angular/core';

export function OxHttpInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
  const router = inject(Router);
  return next(req).pipe(
    map((event: HttpEvent<unknown>) => {
      if (event instanceof HttpResponse) {
        // 检查 ContentType 是否为 JSON
        const contentTypeHeader = event.headers.get('Content-Type');
        if (!contentTypeHeader || !contentTypeHeader.includes('application/json')) {
          console.log('Content-Type: ' + contentTypeHeader);
          return event;
        }

        // 如果是i18n的返回值，则跳过。
        console.log('url: ', event.url);
        if (event.url?.includes('/i18n/')) {
          return event;
        }

        if (event.url?.endsWith('.html')) {
          return event;
        }

        if (event.url?.endsWith('.md')) {
          return event;
        }

        if (event.url?.endsWith('.json')) {
          return event;
        }

        const body = event.body as OxResponse;
        if (body) {
          if (! body.success) {
            throw new Error(body.message);
          }
        }
      }
      return event;
    }),
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        router
          .navigate(['/passport'], {
            queryParams: {
              redirect: router.url,  // 保存当前URL用于登录后重定向
              reason: 'session_expired'
            }
          })
          .then(() => {
            console.log('goLogin ok!')
          })
          .catch(e => {
            console.log('goLogin failed: ', e)
          });
      }

      return throwError(() => error);
    })
  );
}
