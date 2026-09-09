import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { OxResponse } from './response/OxResponse';
import {
  ProductBasic,
  ProductBasicCodec,
  DeviceInstance,
  DeviceInstanceCodec,
  NamespaceDefinition,
  NamespaceDefinitionCodec,
  DeviceDefinition,
  DeviceDefinitionCodec,
} from '@openxiot/xiot-core-spec-ts';

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

  /** 产品规范名字空间目录（两级选择器第一级）。 */
  listSpecNamespaces(): Observable<NamespaceDefinition[]> {
    return this.http
      .get<OxResponse>(`${this.product}/v1/spec/namespace/all`)
      .pipe(map((r) => NamespaceDefinitionCodec.decodeArray(r.data)));
  }

  /** 某个名字空间下的设备类型目录（两级选择器第二级）。 */
  listSpecDevices(namespace: string): Observable<DeviceDefinition[]> {
    return this.http
      .get<OxResponse>(`${this.product}/v1/spec/device/many/${namespace}`)
      .pipe(map((r) => DeviceDefinitionCodec.decodeArray(r.data)));
  }
}
