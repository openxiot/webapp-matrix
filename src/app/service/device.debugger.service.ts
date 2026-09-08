import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import {
  ActionOperation,
  ActionOperationCodec,
  DeviceInstance,
  PropertyOperation,
  PropertyOperationCodec,
} from '@openxiot/xiot-core-spec-ts';
import { environment } from '../../environments/environment';
import { OxResponse } from './response/OxResponse';
import { AccountService } from './account.service';
import { ProductService } from './product.service';
import { DeviceEntity } from '../typedef/define/device/DeviceEntity';
import { DeviceEntityCodec } from '../typedef/codec/device/DeviceEntityCodec';

/**
 * 设备调试器专用服务：把 console 调试器依赖的 MainService 方法平移到 matrix 后端。
 * - 设备摘要：GET  {server}/matrix/v1/device/one/{spaceId}/{did}   -> DeviceEntity(did/type/online)
 * - 产品实例：GET  {product}/v1/product/instance/one/{type}         -> DeviceInstance（服务树，负责 UI 建模）
 * - 读属性：   GET  {server}/matrix/v1/device/properties/{spaceId}?pid=...
 * - 写属性：   POST {server}/matrix/v1/device/properties/{spaceId}
 * - 执行方法： POST {server}/matrix/v1/device/actions/{spaceId}
 *
 * spaceId 取当前选中的项目（根空间）account.space().id，与设备列表一致；
 * X-Org-Id / Authorization 由 JwtInterceptor 按 environment.server 自动附加。
 * property/action 的请求与响应编解码沿用 xiot-core-spec-ts codec（与 manipulation API 契约一致）。
 */
@Injectable({ providedIn: 'root' })
export class DeviceDebuggerService {
  private server: string = environment.server;

  constructor(
    private http: HttpClient,
    private account: AccountService,
    private product: ProductService,
  ) {}

  /** 当前项目（根空间）ID，作为设备接口的空间上下文。 */
  private currentSpaceId(): string {
    return this.account.space().id;
  }

  /** 读取设备摘要（did/type/online），用于页头展示并驱动产品实例加载。 */
  getDevice(did: string): Observable<DeviceEntity> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/device/one/${this.currentSpaceId()}/${did}`)
      .pipe(map((response) => DeviceEntityCodec.decode(response.data)));
  }

  /** 读取产品功能版本（设备类型对应的完整服务树）。 */
  getInstance(type: string): Observable<DeviceInstance> {
    return this.product.getProductInstance(type);
  }

  /** 读取多个设备的多个属性。 */
  getProperties(_did: string, properties: PropertyOperation[]): Observable<PropertyOperation[]> {
    const params = new HttpParams({ fromObject: { pid: properties.map((x) => x.pid.toString()) } });

    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/device/properties/${this.currentSpaceId()}`, { params })
      .pipe(map((response) => PropertyOperationCodec.Get.RESULT.decodeArray(response.data)));
  }

  getProperty(property: PropertyOperation): Observable<PropertyOperation> {
    return this.getProperties(property.did(), [property]).pipe(map((x) => x[0]));
  }

  /** 设置多个属性。 */
  setProperties(_did: string, properties: PropertyOperation[]): Observable<PropertyOperation[]> {
    const body = PropertyOperationCodec.Set.QUERY.encodeArray(properties);

    return this.http
      .post<OxResponse>(`${this.server}/matrix/v1/device/properties/${this.currentSpaceId()}`, body)
      .pipe(map((response) => PropertyOperationCodec.Set.RESULT.decodeArray(response.data)));
  }

  setProperty(property: PropertyOperation): Observable<PropertyOperation> {
    return this.setProperties(property.did(), [property]).pipe(map((x) => x[0]));
  }

  /** 执行多个方法。 */
  invokeActions(_did: string, actions: ActionOperation[]): Observable<ActionOperation[]> {
    const body = ActionOperationCodec.Query.encodeArray(actions);

    return this.http
      .post<OxResponse>(`${this.server}/matrix/v1/device/actions/${this.currentSpaceId()}`, body)
      .pipe(map((response) => ActionOperationCodec.Result.decodeArray(response.data)));
  }

  invokeAction(action: ActionOperation): Observable<ActionOperation> {
    return this.invokeActions(action.aid.did, [action]).pipe(map((x) => x[0]));
  }
}
