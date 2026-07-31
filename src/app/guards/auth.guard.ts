import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { TokenService } from '../services/token.service';

export const authGuard = () => {
  const token = inject(TokenService);
  const router = inject(Router);
  if (token.isLoggedIn) return true;
  return router.parseUrl('/login');
};
