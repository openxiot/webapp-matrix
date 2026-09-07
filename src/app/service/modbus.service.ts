import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { OxResponse } from './response/OxResponse';
import { ModbusDeviceConfig } from '../typedef/define/modbus/Modbus';

/**
 * Modbus 设备点表服务。
 *
 * 目标 service-matrix 后端，端点统一为 /matrix/v1/modbus；
 * 组织通过拦截器附加的 X-Org-Id 请求头携带，方法不再传 orgId。
 */
@Injectable({ providedIn: 'root' })
export class ModbusService {
  private server: string = environment.server;

  constructor(private http: HttpClient) {}

  /** 查询当前组织下全部设备点表 */
  list(): Observable<ModbusDeviceConfig[]> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/modbus/many`)
      .pipe(map((r) => r.data as ModbusDeviceConfig[]));
  }

  /** 查询单条设备点表 */
  get(id: string): Observable<ModbusDeviceConfig> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/modbus/one/${id}`)
      .pipe(map((r) => r.data as ModbusDeviceConfig));
  }

  /** 新建设备点表 */
  create(body: ModbusDeviceConfig): Observable<ModbusDeviceConfig> {
    return this.http
      .post<OxResponse>(`${this.server}/matrix/v1/modbus/one`, body)
      .pipe(map((r) => r.data as ModbusDeviceConfig));
  }

  /** 更新设备点表 */
  update(id: string, body: ModbusDeviceConfig): Observable<ModbusDeviceConfig> {
    return this.http
      .put<OxResponse>(`${this.server}/matrix/v1/modbus/one/${id}`, body)
      .pipe(map((r) => r.data as ModbusDeviceConfig));
  }

  /** 删除设备点表 */
  remove(id: string): Observable<void> {
    return this.http
      .delete<OxResponse>(`${this.server}/matrix/v1/modbus/one/${id}`)
      .pipe(map(() => undefined));
  }
}
