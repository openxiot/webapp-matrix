import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AccountService } from './account.service';

export const authGuard: CanActivateFn = () => {
  const account = inject(AccountService);
  const router = inject(Router);

  if (account.login) {
    return true;
  }

  return router.createUrlTree(['/passport'], {
    queryParams: { redirect: router.url },
  });
};
