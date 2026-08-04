import {HttpHandlerFn, HttpRequest} from "@angular/common/http";
import {inject} from "@angular/core";
import {AccountService} from "../account.service";
import {environment} from "../../../environments/environment";

export function JwtInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn) {
  const account = inject(AccountService);
  if (account.login) {
    // https://mgstaging.blob.core.windows.net/materials/3e839d2e-a7cf-4846-ba72-2fee5f8b68f9.jpg?sv=2025-05-05&se=2025-08-14T03%3A15%3A28Z&sr=b&sp=w&sig=dvbjJTxBfW%2BGdKkVTmR3sfF8sY%2FTin46b101fX9IRjo%3D

    if (req.url.startsWith(environment.server) ||
      req.url.startsWith(environment.account)
    ) {
      const newReq = req.clone({
        headers: req.headers.append('Authorization', 'Bearer ' + account.developer.token),
      });
      return next(newReq);
    }
  }

  return next(req);
}
