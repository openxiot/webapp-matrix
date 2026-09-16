import {HttpHandlerFn, HttpRequest} from "@angular/common/http";
import {inject} from "@angular/core";
import {AccountService} from "../account.service";
import {environment} from "../../../environments/environment";

export function JwtInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn) {
  const account = inject(AccountService);
  if (account.login()) {
    // product 主机免鉴权（对齐 Android RetrofitClient），不附加任何头
    if (
      !req.url.startsWith(environment.product) &&
      (req.url.startsWith(environment.server) || req.url.startsWith(environment.account))
    ) {
      let headers = req.headers.append('Authorization', 'Bearer ' + account.user().token);
      // X-Org-Id 只在两个地方还是必填的：GET /space/all 靠它决定列哪个组织的项目、
      // POST /space/one 靠它决定新建的根空间归组织还是归个人。其余接口的空间判定改读
      // 空间自己的 accesses 之后都不再看这个头（见 service-matrix 的 OrgAccessService），
      // 多发一份没有副作用。
      if (account.organization && account.organization().id.length > 0) {
        headers = headers.append('X-Org-Id', account.organization().id);
      }
      const newReq = req.clone({ headers });
      return next(newReq);
    }
  }

  return next(req);
}
