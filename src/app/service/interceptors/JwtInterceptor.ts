import {HttpHandlerFn, HttpRequest} from "@angular/common/http";
import {inject} from "@angular/core";
import {AccountService} from "../account.service";
import {environment} from "../../../environments/environment";

export function JwtInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn) {
  const account = inject(AccountService);
  if (account.login) {
    // product 主机免鉴权（对齐 Android RetrofitClient），不附加任何头
    if (!req.url.startsWith(environment.product) &&
      (req.url.startsWith(environment.server) ||
        req.url.startsWith(environment.account))
    ) {
      let headers = req.headers.append('Authorization', 'Bearer ' + account.user.token);
      if (account.organization && account.organization.id.length > 0) {
        headers = headers.append('X-Org-Id', account.organization.id);
      }
      const newReq = req.clone({ headers });
      return next(newReq);
    }
  }

  return next(req);
}
