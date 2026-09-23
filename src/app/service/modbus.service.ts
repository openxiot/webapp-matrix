import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { AccountService } from './account.service';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { OxResponse } from './response/OxResponse';
import { ModbusConfig } from '@app/typedef/define/modbus/Modbus';
// 实体类与下面的本服务类同名（后端都叫 ModbusService），此处按「实体加 Def 后缀」的约定别名引入
import { ModbusService as ModbusServiceDef } from '@app/typedef/define/modbus/ModbusService';
import { ModbusServiceCodec } from '@app/typedef/codec/modbus/ModbusServiceCodec';
import {
  ModbusHistoryCurrent,
  ModbusHistoryFailures,
  ModbusHistoryRange,
} from '@app/typedef/define/modbus/ModbusHistory';
import { ModbusHistoryCodec } from '@app/typedef/codec/modbus/ModbusHistoryCodec';
import {
  ModbusAlarm,
  ModbusAlarmList,
  ModbusAlarmQuery,
} from '@app/typedef/define/modbus/ModbusAlarm';
import { ModbusAlarmCodec } from '@app/typedef/codec/modbus/ModbusAlarmCodec';
import { DeviceEntity } from '@app/typedef/define/device/DeviceEntity';

/**
 * Modbus 设备点表服务。
 *
 * 目标 service-matrix 后端，端点统一为 /matrix/v1/modbus/config；
 * 点表本身按组织存，组织经显式 {@code ?orgId=} query 参数携带（后端已不再读 X-Org-Id 请求头），
 * 取值与旧拦截器行为一致（当前账号所选组织），方法签名不变。
 *
 * 另一半是 Modbus 服务（点表映射成可调用的方法，ModbusServiceResource），
 * 端点 /matrix/v1/modbus/service，方法名统一带 Service 后缀以便与点表那批区分：
 * 点表侧是 create/update/remove，服务侧是 createService/updateService/removeService。
 */
@Injectable({ providedIn: 'root' })
export class ModbusService {
  private server: string = environment.server;

  constructor(
    private http: HttpClient,
    private account: AccountService,
  ) {}

  /**
   * 查询当前账号可见的全部设备点表：本组织私有 + 各组织公开（GET /visible）。
   * 组织经 {@code ?orgId=} query 参数携带（当前账号所选组织）；未选组织时不带参数，
   * 后端回「公开 + 本人」——与旧拦截器附加 X-Org-Id 的行为等价。
   */
  listVisible(): Observable<ModbusConfig[]> {
    const orgId = this.account.organization()?.id;
    let params: HttpParams | undefined;
    if (orgId && orgId.length > 0) {
      params = new HttpParams().set('orgId', orgId);
    }
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/modbus/config/visible`, { params })
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
   * 权限按**空间**判（与设备接口同一口径）：查询与 invoke 需空间成员，增删改需空间管理员；
   * 空间 ID 在 Path 上，统一传当前项目根空间（account.space().id）。判定只看空间 accesses 里的
   * 那条组织条目，**不看** X-Org-Id。
   *------------------------------------------------------------------------------------------------*/

  /** 按空间列出服务（GET /service/many/{spaceId}，筛的是服务里记的设备落点） */
  listServices(spaceId: string): Observable<ModbusServiceDef[]> {
    return this.http
      .get<OxResponse>(
        `${this.server}/matrix/v1/modbus/service/many/${encodeURIComponent(spaceId)}`,
      )
      .pipe(map((r) => ModbusServiceCodec.decodeArray(r.data)));
  }

  /** 按依赖设备 did 列出该设备下挂的全部服务（GET /service/parent/{spaceId}/{did}） */
  listServicesByDevice(spaceId: string, did: string): Observable<ModbusServiceDef[]> {
    return this.http
      .get<OxResponse>(
        `${this.server}/matrix/v1/modbus/service/parent/${encodeURIComponent(spaceId)}/${encodeURIComponent(did)}`,
      )
      .pipe(map((r) => ModbusServiceCodec.decodeArray(r.data)));
  }

  /** 查单个服务（GET /service/one/{spaceId}/{id}，含完整 functions 定义） */
  getService(spaceId: string, id: string): Observable<ModbusServiceDef> {
    return this.http
      .get<OxResponse>(
        `${this.server}/matrix/v1/modbus/service/one/${encodeURIComponent(spaceId)}/${encodeURIComponent(id)}`,
      )
      .pipe(map((r) => ModbusServiceCodec.decode(r.data)));
  }

  /** 新建服务（POST /service/one/{spaceId}，body = 完整定义，人员由后端补） */
  createService(spaceId: string, body: ModbusServiceDef): Observable<ModbusServiceDef> {
    return this.http
      .post<OxResponse>(
        `${this.server}/matrix/v1/modbus/service/one/${encodeURIComponent(spaceId)}`,
        ModbusServiceCodec.encode(body),
      )
      .pipe(map((r) => ModbusServiceCodec.decode(r.data)));
  }

  /** 修改服务（PUT /service/one/{spaceId}/{id}，请求体里缺省的字段保留既有值） */
  updateService(spaceId: string, id: string, body: ModbusServiceDef): Observable<ModbusServiceDef> {
    return this.http
      .put<OxResponse>(
        `${this.server}/matrix/v1/modbus/service/one/${encodeURIComponent(spaceId)}/${encodeURIComponent(id)}`,
        ModbusServiceCodec.encode(body),
      )
      .pipe(map((r) => ModbusServiceCodec.decode(r.data)));
  }

  /** 删除服务（DELETE /service/one/{spaceId}/{id}） */
  removeService(spaceId: string, id: string): Observable<void> {
    return this.http
      .delete<OxResponse>(
        `${this.server}/matrix/v1/modbus/service/one/${encodeURIComponent(spaceId)}/${encodeURIComponent(id)}`,
      )
      .pipe(map(() => undefined));
  }

  /**
   * 调用服务的一个方法（POST /service/invoke/{spaceId}，body {service, function}）：
   * 服务端把请求帧发给依赖设备，再把应答按 response 规则解成「字段 → 值」。
   * 写方法（无 response）的应答是请求回显，返回空对象。
   */
  invokeService(
    spaceId: string,
    serviceId: string,
    functionIndex: number,
  ): Observable<Record<string, unknown>> {
    const body = { service: serviceId, function: functionIndex };
    return this.http
      .post<OxResponse>(
        `${this.server}/matrix/v1/modbus/service/invoke/${encodeURIComponent(spaceId)}`,
        body,
      )
      .pipe(map((r) => (r.data ?? {}) as Record<string, unknown>));
  }

  /**------------------------------------------------------------------------------------------------
   * Modbus 采集历史（ModbusHistoryResource，端点 /matrix/v1/modbus/history）
   *
   * 服务端按各方法的 interval 自动调用依赖设备，读到的值落库；下面三个接口分别取
   * 「当前值 / 序列 / 失败清单」。权限与查询服务同口径（空间成员），空间 ID 在 Path 上。
   *------------------------------------------------------------------------------------------------*/

  /** 每个方法最后一次成功采到的字段值（GET /history/current/{spaceId}/{serviceId}） */
  getHistoryCurrent(spaceId: string, serviceId: string): Observable<ModbusHistoryCurrent> {
    return this.http
      .get<OxResponse>(
        `${this.server}/matrix/v1/modbus/history/current/${encodeURIComponent(spaceId)}/${encodeURIComponent(serviceId)}`,
      )
      .pipe(map((r) => ModbusHistoryCodec.decodeCurrent(r.data)));
  }

  /**
   * 一个方法的某一个字段在 [from, to] 内的序列（GET /history/range/{spaceId}）。
   *
   * `from`/`to` 是毫秒时间戳（`to` 缺省 = 现在）；`maxPoints` 缺省 500、后端夹到 [1, 2000]，
   * 原始样本超过它就返回降采样桶。窗口内原始样本超过 2 万条时后端直接报错，
   * 要求收窄 from/to（不会静默截断）。
   */
  getHistoryRange(
    spaceId: string,
    serviceId: string,
    functionIndex: number,
    field: string,
    from: number,
    to: number | null,
    maxPoints?: number,
  ): Observable<ModbusHistoryRange> {
    let params = new HttpParams()
      .set('serviceId', serviceId)
      .set('functionIndex', functionIndex)
      .set('field', field)
      .set('from', from);
    if (to != null) {
      params = params.set('to', to);
    }
    if (maxPoints != null) {
      params = params.set('maxPoints', maxPoints);
    }
    return this.http
      .get<OxResponse>(
        `${this.server}/matrix/v1/modbus/history/range/${encodeURIComponent(spaceId)}`,
        {
          params,
        },
      )
      .pipe(map((r) => ModbusHistoryCodec.decodeRange(r.data)));
  }

  /**
   * 某服务（或其中某个方法）在 [from, to] 内的采集失败清单 + 汇总
   * （GET /history/failures/{spaceId}），items 按时间倒序，`limit` 缺省 200、后端夹到 [1, 1000]。
   *
   * `serviceId` 传 null = **整个空间（含子空间）**：后端把该空间及其子树下所有服务的失败合并成
   * 一条时间倒序的清单（每条 item 自带 serviceId 认领归属），`limit` 与 `truncated` 也按整份清单算。
   * 项目级页面用这一条顶掉「按服务扇出的 N 条」，而不是拿 N 个响应在内存里拼。
   *
   * 「含子空间」与 `getSpaceGraph` 同口径：项目页的服务清单来自那张图（整棵子树），
   * 故障清单必须覆盖同一批服务，否则子空间里的服务会「表里列着、异常栏永远是空的」。
   */
  getHistoryFailures(
    spaceId: string,
    serviceId: string | null,
    from: number,
    to: number | null,
    functionIndex?: number | null,
    limit?: number,
  ): Observable<ModbusHistoryFailures> {
    let params = new HttpParams().set('from', from);
    if (serviceId != null) {
      params = params.set('serviceId', serviceId);
    }
    if (to != null) {
      params = params.set('to', to);
    }
    if (functionIndex != null) {
      params = params.set('functionIndex', functionIndex);
    }
    if (limit != null) {
      params = params.set('limit', limit);
    }
    return this.http
      .get<OxResponse>(
        `${this.server}/matrix/v1/modbus/history/failures/${encodeURIComponent(spaceId)}`,
        {
          params,
        },
      )
      .pipe(map((r) => ModbusHistoryCodec.decodeFailures(r.data)));
  }

  /**
   * 某服务（或整个空间）在 [from, to] 内的**阈值告警**清单 + 汇总
   * （GET /alarm/many/{spaceId}），items 按 `at` 倒序，`limit` 缺省 200、后端夹到 [1, 1000]。
   *
   * `query.serviceId` 不传 = **整个空间（含子空间）**：后端把该空间及其子树下所有服务的告警合并成
   * 一条时间倒序的清单（每条 item 自带 serviceId 认领归属），`limit` 与 `truncated` 也按整份清单算。
   * 告警页要的「这个项目现在哪儿在告警」就是这一条，不必按服务扇出 N 个请求。
   *
   * 筛选条件收在一个对象里（不像 `getHistoryFailures` 那样一路位置参数）：告警多了
   * `level` / `field` / `open` / `handled` 四个，位置参数排到第六七个就没人记得住顺序了。
   * 三个布尔/枚举筛选的「不传」都是**不限**，故 `open` / `handled` 传 null 与传 false 不是一回事。
   *
   * `from` 必填（后端拒无起点的查询：那是全表扫）；`to` 传 null = 到现在。
   */
  getAlarms(
    spaceId: string,
    from: number,
    to: number | null,
    query: ModbusAlarmQuery = {},
  ): Observable<ModbusAlarmList> {
    let params = new HttpParams().set('from', from);
    if (query.serviceId != null && query.serviceId !== '') {
      params = params.set('serviceId', query.serviceId);
    }
    if (to != null) {
      params = params.set('to', to);
    }
    if (query.functionIndex != null) {
      params = params.set('functionIndex', query.functionIndex);
    }
    if (query.field != null && query.field !== '') {
      params = params.set('field', query.field);
    }
    if (query.level != null && query.level !== '') {
      params = params.set('level', query.level);
    }
    // 「不传 = 不限」：null / undefined 都不带这个参数，只有明确的 true / false 才带上
    if (query.open != null) {
      params = params.set('open', query.open);
    }
    if (query.handled != null) {
      params = params.set('handled', query.handled);
    }
    if (query.limit != null) {
      params = params.set('limit', query.limit);
    }
    return this.http
      .get<OxResponse>(
        `${this.server}/matrix/v1/modbus/alarm/many/${encodeURIComponent(spaceId)}`,
        {
          params,
        },
      )
      .pipe(map((r) => ModbusAlarmCodec.decodeList(r.data)));
  }

  /**
   * 处理一条告警（POST /alarm/handle/{spaceId}/{id}，**无 body**）：处理人取当前登录账号，
   * 返回**更新后的那一条**，页面据此就地替换该行、不整页刷新。
   *
   * 重复点击算成功（后端把「已经处理过了」当成功返回）：页面不必自己做「点过了就禁用」，
   * 但仍应就地更新，否则用户会以为没生效。该告警不属于传入空间的子树时后端拒绝（拿别人的 id 点不了）。
   */
  handleAlarm(spaceId: string, id: string): Observable<ModbusAlarm> {
    return this.http
      .post<OxResponse>(
        `${this.server}/matrix/v1/modbus/alarm/handle/${encodeURIComponent(spaceId)}/${encodeURIComponent(id)}`,
        {},
      )
      .pipe(map((r) => ModbusAlarmCodec.decode(r.data)));
  }
}
