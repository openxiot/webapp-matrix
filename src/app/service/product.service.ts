import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { OxResponse } from './response/OxResponse';
import { ProductBasic, ProductBasicCodec, DeviceInstance, DeviceInstanceCodec } from '@openxiot/xiot-core-spec-ts';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private product: string = environment.product;

  constructor(private http: HttpClient) {}

  getPublicProducts(): Observable<ProductBasic[]> {
    return this.http
      .get<OxResponse>(`${this.product}/v1/product/basic/public`)
      .pipe(map((r) => ProductBasicCodec.decodeArray(r.data)));
  }

  getVisibleProducts(orgId: string): Observable<ProductBasic[]> {
    return this.http
      .get<OxResponse>(`${this.product}/v1/product/basic/visible/${orgId}`)
      .pipe(map((r) => ProductBasicCodec.decodeArray(r.data)));
  }

  getProductDetail(productId: string): Observable<ProductBasic> {
    return this.http
      .get<OxResponse>(`${this.product}/v1/product/basic/one`, { params: { productId } })
      .pipe(map((r) => ProductBasicCodec.decode(r.data)));
  }

  getProductByOrgModel(orgId: string, model: string): Observable<ProductBasic> {
    return this.http
      .get<OxResponse>(`${this.product}/v1/product/basic/one/org-model`, {
        params: { organizationId: orgId, model },
      })
      .pipe(map((r) => ProductBasicCodec.decode(r.data)));
  }

  getProductInstance(type: string): Observable<DeviceInstance> {
    return this.http
      .get<OxResponse>(`${this.product}/v1/product/instance/one/${type}`)
      .pipe(map((r) => DeviceInstanceCodec.decode(r.data)));
  }
}
