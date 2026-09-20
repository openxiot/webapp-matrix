import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { OxResponse } from './response/OxResponse';
import { OverviewStatistics } from '@app/typedef/define/statistics/OverviewStatistics';
import { OverviewStatisticsCodec } from '@app/typedef/codec/statistics/OverviewStatisticsCodec';

/**
 * 统计服务（后端 StatisticsResource，端点 /matrix/v1/statistics）。
 *
 * 权限与查询服务同口径（空间成员），空间 ID 在 Path 上，统一传当前项目根空间
 * （`account.space().id`）。**范围含子空间**：设备、服务、告警、故障都取该空间整棵子树。
 */
@Injectable({ providedIn: 'root' })
export class StatisticsService {
  private server: string = environment.server;

  constructor(private http: HttpClient) {}

  /**
   * 数据看板一屏的聚合数字（GET /overview/{spaceId}）。
   *
   * `from` 必填（后端拒无起点的查询：那是全表扫）；`to` 传 null = 到现在，
   * 响应里的 `to` 是**实际生效**的那个值，前端的曲线右端以它为准。
   *
   * 窗口上限 31 天，超了后端报错（不会静默截断）。返回的 `hourly` 是窗口内**密集零填充**
   * 的整点桶，前端不必猜「这段是没数据还是没请求」。
   */
  overview(spaceId: string, from: number, to: number | null): Observable<OverviewStatistics> {
    let params = new HttpParams().set('from', from);
    if (to != null) {
      params = params.set('to', to);
    }
    return this.http
      .get<OxResponse>(
        `${this.server}/matrix/v1/statistics/overview/${encodeURIComponent(spaceId)}`,
        { params },
      )
      .pipe(map((r) => OverviewStatisticsCodec.decode(r.data)));
  }
}
