import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { OxResponse } from './response/OxResponse';
import { ModbusConfig } from '../typedef/define/modbus/Modbus';
// 实体类与下面的本服务类同名（后端都叫 ModbusService），此处按「实体加 Def 后缀」的约定别名引入
import { ModbusService as ModbusServiceDef } from '../typedef/define/modbus/ModbusService';
import { ModbusServiceCodec } from '../typedef/codec/modbus/ModbusServiceCodec';
import { DeviceEntity } from '../typedef/define/device/DeviceEntity';

/**
 * Modbus 设备点表服务。
 *
 * 目标 service-matrix 后端，端点统一为 /matrix/v1/modbus/config；
 * 组织通过拦截器附加的 X-Org-Id 请求头携带，方法不再传 orgId。
 *
 * 另一半是 Modbus 服务（点表映射成可调用的方法，ModbusServiceResource），
 * 端点 /matrix/v1/modbus/service，方法名统一带 Service 后缀以便与点表那批区分：
 * 点表侧是 create/update/remove，服务侧是 createService/updateService/removeService。
 */
@Injectable({ providedIn: 'root' })
export class ModbusService {
  private server: string = environment.server;

  constructor(private http: HttpClient) {}

  /**
   * 查询当前账号可见的全部设备点表：本组织私有 + 各组织公开（GET /visible）。
   * 组织经拦截器附加的 X-Org-Id 携带。
   */
  listVisible(): Observable<ModbusConfig[]> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/modbus/config/visible`)
      .pipe(map((r) => r.data as ModbusConfig[]));
  }

  /**
   * 查询全部公开设备点表（GET /public）。后端仅要求登录，不校验组织，
   * 用于「未选择组织 / 组织不可用」时仍可浏览公开点表。
   */
  listPublic(): Observable<ModbusConfig[]> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/modbus/config/public`)
      .pipe(map((r) => r.data as ModbusConfig[]));
  }

  /** 查询单条设备点表 */
  get(id: string): Observable<ModbusConfig> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/modbus/config/one/${id}`)
      .pipe(map((r) => r.data as ModbusConfig));
  }

  /** 新建设备点表 */
  create(body: ModbusConfig): Observable<ModbusConfig> {
    return this.http
      .post<OxResponse>(`${this.server}/matrix/v1/modbus/config/one`, body)
      .pipe(map((r) => r.data as ModbusConfig));
  }

  /** 更新设备点表（永不会修改 lifecycle，见 {@link #setLifecycle}） */
  update(id: string, body: ModbusConfig): Observable<ModbusConfig> {
    return this.http
      .put<OxResponse>(`${this.server}/matrix/v1/modbus/config/one/${id}`, body)
      .pipe(map((r) => r.data as ModbusConfig));
  }

  /**
   * 独立流转设备点表 lifecycle（PUT /one/{id}/lifecycle/{lifecycle}）。
   * development→preview（预览）、preview→released（发布）、released/preview→development（下线）。
   * 服务端只允许 development / preview / released 三个目标值，不校验流转，直接覆盖。
   */
  setLifecycle(id: string, lifecycle: string): Observable<ModbusConfig> {
    return this.http
      .put<OxResponse>(
        `${this.server}/matrix/v1/modbus/config/one/${id}/lifecycle/${encodeURIComponent(lifecycle)}`,
        {},
      )
      .pipe(map((r) => r.data as ModbusConfig));
  }

  /** 删除设备点表 */
  remove(id: string): Observable<void> {
    return this.http
      .delete<OxResponse>(`${this.server}/matrix/v1/modbus/config/one/${id}`)
      .pipe(map(() => undefined));
  }

  /**------------------------------------------------------------------------------------------------
   * Modbus 服务（点表映射成一组可调用的方法，ModbusServiceResource）
   * 查询需组织成员、增删改需组织管理员；组织均经 X-Org-Id 携带。
   *------------------------------------------------------------------------------------------------*/

  /** 按组织列出全部服务（GET /service/many） */
  listServices(): Observable<ModbusServiceDef[]> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/modbus/service/many`)
      .pipe(map((r) => ModbusServiceCodec.decodeArray(r.data)));
  }

  /** 按依赖设备 did 列出该设备下挂的全部服务（GET /service/parent/{did}） */
  listServicesByDevice(did: string): Observable<ModbusServiceDef[]> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/modbus/service/parent/${encodeURIComponent(did)}`)
      .pipe(map((r) => ModbusServiceCodec.decodeArray(r.data)));
  }

  /** 查单个服务（GET /service/one/{id}，含完整 functions 定义） */
  getService(id: string): Observable<ModbusServiceDef> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/modbus/service/one/${encodeURIComponent(id)}`)
      .pipe(map((r) => ModbusServiceCodec.decode(r.data)));
  }

  /** 新建服务（POST /service/one，body = 完整定义，org 与人员由后端补） */
  createService(body: ModbusServiceDef): Observable<ModbusServiceDef> {
    return this.http
      .post<OxResponse>(`${this.server}/matrix/v1/modbus/service/one`, ModbusServiceCodec.encode(body))
      .pipe(map((r) => ModbusServiceCodec.decode(r.data)));
  }

  /** 修改服务（PUT /service/one/{id}，请求体里缺省的字段保留既有值） */
  updateService(id: string, body: ModbusServiceDef): Observable<ModbusServiceDef> {
    return this.http
      .put<OxResponse>(
        `${this.server}/matrix/v1/modbus/service/one/${encodeURIComponent(id)}`,
        ModbusServiceCodec.encode(body),
      )
      .pipe(map((r) => ModbusServiceCodec.decode(r.data)));
  }

  /** 删除服务（DELETE /service/one/{id}） */
  removeService(id: string): Observable<void> {
    return this.http
      .delete<OxResponse>(`${this.server}/matrix/v1/modbus/service/one/${encodeURIComponent(id)}`)
      .pipe(map(() => undefined));
  }

  /**
   * 调用服务的一个方法（POST /service/invoke，body {service, function}）：
   * 服务端把请求帧发给依赖设备，再把应答按 response 规则解成「字段 → 值」。
   * 写方法（无 response）的应答是请求回显，返回空对象。
   */
  invokeService(serviceId: string, functionIndex: number): Observable<Record<string, unknown>> {
    const body = { service: serviceId, function: functionIndex };
    return this.http
      .post<OxResponse>(`${this.server}/matrix/v1/modbus/service/invoke`, body)
      .pipe(map((r) => (r.data ?? {}) as Record<string, unknown>));
  }
}
