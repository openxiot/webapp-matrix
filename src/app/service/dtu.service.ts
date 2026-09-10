import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { OxResponse } from './response/OxResponse';

/** DTU 设备登记组织：IMEI→DID 查询始终在该组织下进行（同 android-matrix Constants.DTU_ORG_ID）。 */
const DTU_ORG_ID = 'yinerda';

/**
 * DTU 网关服务（webapp 直连，非 matrix 主机）。按 IMEI 查设备 DID。
 *
 * 说明：`JwtInterceptor` 只给 environment.server/account 前缀的请求加 Authorization / X-Org-Id，
 * 因此此处对 DTU 网关的请求天然不带鉴权头，仅需网关放行 CORS。
 */
@Injectable({ providedIn: 'root' })
export class DtuService {
  private server: string = environment.dtu;

  constructor(private http: HttpClient) {}

  /** 按 15 位 IMEI 查询 DID；查不到/失败时抛出可读错误（OxResponse 非 success 由拦截器抛出）。 */
  getDidByImei(imei: string): Observable<string> {
    const params = new HttpParams().set('orgId', DTU_ORG_ID).set('imei', imei);
    return this.http
      .get<OxResponse>(`${this.server}/v1/did/by/imei`, { params })
      .pipe(
        map((r) => {
          const did = r.data as string | undefined;
          if (!did) {
            throw new Error(`未查询到该 IMEI（${imei}）对应的设备`);
          }
          return did;
        }),
      );
  }
}
