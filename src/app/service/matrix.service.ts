import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { OxResponse } from './response/OxResponse';
import { SpaceEntity } from '../typedef/define/space/SpaceEntity';
import { SpaceEntityCodec } from '../typedef/codec/space/SpaceEntityCodec';
import { DeviceEntity } from '../typedef/define/device/DeviceEntity';
import { DeviceEntityCodec } from '../typedef/codec/device/DeviceEntityCodec';
import { SpaceGraph } from '../typedef/define/device/SpaceGraph';
import { SpaceGraphCodec } from '../typedef/codec/device/SpaceGraphCodec';
import { DeviceRegistration } from '../typedef/define/device/DeviceRegistration';
import { MoveDeviceRequest } from '../typedef/define/device/MoveDeviceRequest';
import { OrganizationMember } from '../typedef/define/user/UserOrganization';
import { OrganizationMemberCodec } from '../typedef/codec/user/UserOrganizationCodec';
import {
  ActionOperation,
  ActionOperationCodec,
  PropertyOperation,
  PropertyOperationCodec,
} from '@openxiot/xiot-core-spec-ts';

@Injectable({ providedIn: 'root' })
export class MatrixService {
  private server: string = environment.server;

  constructor(private http: HttpClient) {}

  /**------------------------------------------------------------------------------------------------
   * 空间
   *------------------------------------------------------------------------------------------------*/
  getAllSpaces(): Observable<SpaceEntity[]> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/space/all`)
      .pipe(map((r) => SpaceEntityCodec.decodeArray(r.data)));
  }

  getSpace(id: string): Observable<SpaceEntity> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/space/one/${id}`)
      .pipe(map((r) => SpaceEntityCodec.decode(r.data)));
  }

  getSpaceGraph(rootId: string): Observable<SpaceGraph> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/space/graph/${rootId}`)
      .pipe(map((r) => SpaceGraphCodec.decode(r.data)));
  }

  createSpace(space: SpaceEntity): Observable<SpaceEntity> {
    return this.http
      .post<OxResponse>(`${this.server}/matrix/v1/space/one`, SpaceEntityCodec.encode(space))
      .pipe(map((r) => SpaceEntityCodec.decode(r.data)));
  }

  updateSpace(space: SpaceEntity): Observable<SpaceEntity> {
    return this.http
      .put<OxResponse>(`${this.server}/matrix/v1/space/one`, SpaceEntityCodec.encode(space))
      .pipe(map((r) => SpaceEntityCodec.decode(r.data)));
  }

  deleteSpace(spaceId: string): Observable<void> {
    return this.http
      .delete<OxResponse>(`${this.server}/matrix/v1/space/one/${spaceId}`)
      .pipe(map(() => undefined));
  }

  /**------------------------------------------------------------------------------------------------
   * 设备
   *------------------------------------------------------------------------------------------------*/
  getDevices(spaceId: string): Observable<DeviceEntity[]> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/device/many/${spaceId}`)
      .pipe(map((r) => DeviceEntityCodec.decodeArray(r.data)));
  }

  addDevices(spaceId: string, devices: DeviceRegistration[]): Observable<void> {
    return this.http
      .post<OxResponse>(`${this.server}/matrix/v1/device/many/${spaceId}`, devices)
      .pipe(map(() => undefined));
  }

  /** 通过二维码内容添加设备，body 为解析后的 key:value map */
  addDeviceByQr(spaceId: string, body: Record<string, string>): Observable<void> {
    return this.http
      .post<OxResponse>(`${this.server}/matrix/v1/device/one/${spaceId}`, body)
      .pipe(map(() => undefined));
  }

  /** 删除单个设备：注销 manipulation 注册并删除矩阵 DeviceEntity（spaceId 仅用于管理员鉴权，按 did 删除）。 */
  removeDevice(spaceId: string, did: string): Observable<void> {
    return this.http
      .delete<OxResponse>(`${this.server}/matrix/v1/device/one/${spaceId}/${did}`)
      .pipe(map(() => undefined));
  }

  moveDevices(req: MoveDeviceRequest): Observable<void> {
    return this.http
      .put<OxResponse>(`${this.server}/matrix/v1/device/many/space`, req)
      .pipe(map(() => undefined));
  }

  /** 单设备摘要（did/type/online），调试器页头等使用。 */
  getDevice(spaceId: string, did: string): Observable<DeviceEntity> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/device/one/${spaceId}/${did}`)
      .pipe(map((r) => DeviceEntityCodec.decode(r.data)));
  }

  /** 读取多个属性（pid 由操作自带，返回按 manipulation 契约解码的操作结果）。 */
  getDeviceProperties(spaceId: string, properties: PropertyOperation[]): Observable<PropertyOperation[]> {
    const params = new HttpParams({ fromObject: { pid: properties.map((x) => x.pid.toString()) } });
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/device/properties/${spaceId}`, { params })
      .pipe(map((r) => PropertyOperationCodec.Get.RESULT.decodeArray(r.data)));
  }

  getDeviceProperty(spaceId: string, property: PropertyOperation): Observable<PropertyOperation> {
    return this.getDeviceProperties(spaceId, [property]).pipe(map((x) => x[0]));
  }

  /** 设置多个属性。 */
  setDeviceProperties(spaceId: string, properties: PropertyOperation[]): Observable<PropertyOperation[]> {
    const body = PropertyOperationCodec.Set.QUERY.encodeArray(properties);
    return this.http
      .post<OxResponse>(`${this.server}/matrix/v1/device/properties/${spaceId}`, body)
      .pipe(map((r) => PropertyOperationCodec.Set.RESULT.decodeArray(r.data)));
  }

  setDeviceProperty(spaceId: string, property: PropertyOperation): Observable<PropertyOperation> {
    return this.setDeviceProperties(spaceId, [property]).pipe(map((x) => x[0]));
  }

  /** 执行多个方法。 */
  invokeDeviceActions(spaceId: string, actions: ActionOperation[]): Observable<ActionOperation[]> {
    const body = ActionOperationCodec.Query.encodeArray(actions);
    return this.http
      .post<OxResponse>(`${this.server}/matrix/v1/device/actions/${spaceId}`, body)
      .pipe(map((r) => ActionOperationCodec.Result.decodeArray(r.data)));
  }

  invokeDeviceAction(spaceId: string, action: ActionOperation): Observable<ActionOperation> {
    return this.invokeDeviceActions(spaceId, [action]).pipe(map((x) => x[0]));
  }

  /**------------------------------------------------------------------------------------------------
   * 根空间访问条目（accesses 中 type = user 的条目，即成员）
   *------------------------------------------------------------------------------------------------*/
  listAccesses(rootId: string): Observable<OrganizationMember[]> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/space/${rootId}/access`)
      .pipe(map((r) => OrganizationMemberCodec.decodeArray(r.data)));
  }

  addAccess(rootId: string, memberId: string, role?: string): Observable<void> {
    return this.http
      .post<OxResponse>(`${this.server}/matrix/v1/space/${rootId}/access`, { memberId, role })
      .pipe(map(() => undefined));
  }

  updateAccessRole(rootId: string, memberId: string, role: string): Observable<void> {
    return this.http
      .put<OxResponse>(`${this.server}/matrix/v1/space/${rootId}/access`, { memberId, role })
      .pipe(map(() => undefined));
  }

  updateAccessRemark(rootId: string, memberId: string, remark: string): Observable<void> {
    return this.http
      .put<OxResponse>(`${this.server}/matrix/v1/space/${rootId}/access`, { memberId, remark })
      .pipe(map(() => undefined));
  }

  removeAccess(rootId: string, memberId: string): Observable<void> {
    let params = new HttpParams().set('memberId', memberId);
    return this.http
      .delete<OxResponse>(`${this.server}/matrix/v1/space/${rootId}/access`, { params })
      .pipe(map(() => undefined));
  }
}
