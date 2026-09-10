import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { OxResponse } from './response/OxResponse';
import { ModbusDeviceConfig, ModbusMapping } from '../typedef/define/modbus/Modbus';
import { DeviceEntity } from '../typedef/define/device/DeviceEntity';
import { DeviceInstance, DeviceInstanceCodec } from '@openxiot/xiot-core-spec-ts';

/**
 * Modbus 设备点表服务。
 *
 * 目标 service-matrix 后端，端点统一为 /matrix/v1/modbus/config；
 * 组织通过拦截器附加的 X-Org-Id 请求头携带，方法不再传 orgId。
 */
@Injectable({ providedIn: 'root' })
export class ModbusService {
  private server: string = environment.server;

  constructor(private http: HttpClient) {}

  /**
   * 查询当前账号可见的全部设备点表：本组织私有 + 各组织公开（GET /visible）。
   * 组织经拦截器附加的 X-Org-Id 携带。
   */
  listVisible(): Observable<ModbusDeviceConfig[]> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/modbus/config/visible`)
      .pipe(map((r) => r.data as ModbusDeviceConfig[]));
  }

  /**
   * 查询全部公开设备点表（GET /public）。后端仅要求登录，不校验组织，
   * 用于「未选择组织 / 组织不可用」时仍可浏览公开点表。
   */
  listPublic(): Observable<ModbusDeviceConfig[]> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/modbus/config/public`)
      .pipe(map((r) => r.data as ModbusDeviceConfig[]));
  }

  /** 查询单条设备点表 */
  get(id: string): Observable<ModbusDeviceConfig> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/modbus/config/one/${id}`)
      .pipe(map((r) => r.data as ModbusDeviceConfig));
  }

  /** 新建设备点表 */
  create(body: ModbusDeviceConfig): Observable<ModbusDeviceConfig> {
    return this.http
      .post<OxResponse>(`${this.server}/matrix/v1/modbus/config/one`, body)
      .pipe(map((r) => r.data as ModbusDeviceConfig));
  }

  /** 更新设备点表（永不会修改 lifecycle，见 {@link #setLifecycle}） */
  update(id: string, body: ModbusDeviceConfig): Observable<ModbusDeviceConfig> {
    return this.http
      .put<OxResponse>(`${this.server}/matrix/v1/modbus/config/one/${id}`, body)
      .pipe(map((r) => r.data as ModbusDeviceConfig));
  }

  /**
   * 独立流转设备点表 lifecycle（PUT /one/{id}/lifecycle/{lifecycle}）。
   * development→preview（预览）、preview→released（发布）、released/preview→development（下线）。
   * 服务端只允许 development / preview / released 三个目标值，不校验流转，直接覆盖。
   */
  setLifecycle(id: string, lifecycle: string): Observable<ModbusDeviceConfig> {
    return this.http
      .put<OxResponse>(
        `${this.server}/matrix/v1/modbus/config/one/${id}/lifecycle/${encodeURIComponent(lifecycle)}`,
        {},
      )
      .pipe(map((r) => r.data as ModbusDeviceConfig));
  }

  /** 删除设备点表 */
  remove(id: string): Observable<void> {
    return this.http
      .delete<OxResponse>(`${this.server}/matrix/v1/modbus/config/one/${id}`)
      .pipe(map(() => undefined));
  }

  /**
   * 创建 Modbus 虚拟设备（POST /matrix/v1/modbus/virtual/one）：把一条点表配置虚拟成父设备
   * （映射所选 DTU）下的子设备。组织经 X-Org-Id 携带；需为该组织管理员。
   * 成功后返回新建的矩阵子设备（DeviceEntity），父设备下即可看到。
   */
  createVirtual(body: ModbusMapping): Observable<DeviceEntity> {
    return this.http
      .post<OxResponse>(`${this.server}/matrix/v1/modbus/virtual/one`, body)
      .pipe(map((r) => r.data as DeviceEntity));
  }

  /**
   * 删除 Modbus 虚拟设备（DELETE /matrix/v1/modbus/virtual/one?did=..）：反向清理 createVirtual，
   * 删除归属当前组织的虚拟设备定义文档并连同删除同 did 的矩阵 DeviceEntity。组织经 X-Org-Id 携带；
   * 需为该组织管理员。
   */
  removeVirtual(did: string): Observable<void> {
    const params = new HttpParams().set('did', did);
    return this.http
      .delete<OxResponse>(`${this.server}/matrix/v1/modbus/virtual/one`, { params })
      .pipe(map(() => undefined));
  }

  /**
   * 取一个 Modbus 虚拟设备的设备实例定义（GET /matrix/v1/modbus/virtual/instance/{type}）。
   * 服务端按派生的实例 DeviceType 精确匹配 virtual-devices 定义文档并解码回环；
   * 调用方仅持类型（虚拟子设备 protocol=modbus），供设备调试等页面复用其挂载的 Service → Action 结构。
   */
  getInstance(type: string): Observable<DeviceInstance> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/modbus/virtual/instance/${encodeURIComponent(type)}`)
      .pipe(map((r) => DeviceInstanceCodec.decode(r.data)));
  }
}
