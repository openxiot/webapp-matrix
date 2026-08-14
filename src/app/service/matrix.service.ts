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

  getSpaceTree(rootId: string): Observable<SpaceEntity> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/space/tree/${rootId}`)
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

  moveDevices(req: MoveDeviceRequest): Observable<void> {
    return this.http
      .put<OxResponse>(`${this.server}/matrix/v1/device/many/space`, req)
      .pipe(map(() => undefined));
  }

  getDeviceProperties(spaceId: string, pids: string[]): Observable<Array<Record<string, unknown>>> {
    let params = new HttpParams();
    for (const pid of pids) {
      params = params.append('pid', pid);
    }
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/device/properties/${spaceId}`, { params })
      .pipe(map((r) => (r.data as Array<Record<string, unknown>>) || []));
  }

  setDeviceProperties(spaceId: string, body: Record<string, unknown>): Observable<Array<Record<string, unknown>>> {
    return this.http
      .post<OxResponse>(`${this.server}/matrix/v1/device/properties/${spaceId}`, body)
      .pipe(map((r) => (r.data as Array<Record<string, unknown>>) || []));
  }

  invokeDeviceAction(spaceId: string, body: Record<string, unknown>): Observable<Array<Record<string, unknown>>> {
    return this.http
      .post<OxResponse>(`${this.server}/matrix/v1/device/actions/${spaceId}`, body)
      .pipe(map((r) => (r.data as Array<Record<string, unknown>>) || []));
  }
}
