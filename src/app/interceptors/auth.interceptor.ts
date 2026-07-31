import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TokenService } from '../services/token.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);
  const token = tokenService.token;
  const orgId = tokenService.currentOrgId;

  let headers = req.headers;

  // Skip auth header for product.openxiot.cn
  if (!req.url.includes('product.openxiot.cn')) {
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    if (orgId) {
      headers = headers.set('X-Org-Id', orgId);
    }
  }

  const cloned = req.clone({ headers });
  return next(cloned);
};
