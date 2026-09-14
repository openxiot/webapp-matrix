import {
  AlarmOverview,
  DeviceOverview,
  FailureOverview,
  OverviewStatistics,
  ServiceOverview,
  StatisticsBucket,
  StatisticsCount,
} from '../../define/statistics/OverviewStatistics';

/**
 * 看板数字与 JSON 的互转。**只解不编**：这份数据是后端算出来的，前端没有任何回写它的请求体。
 *
 * 三个分组数组的键名各不相同（`type` / `configId` / `text`），解出来统一收进
 * {@link StatisticsCount.key} —— 「这组键是什么」由它在哪个数组里决定，前端据此决定怎么显示
 * （类型段与告警文本原样显示、`configId` 要解成点表名）。收成一个类是为了三份分组的
 * 排序、取值、空值处理只有一份实现。
 *
 * 键与计数都是**数据**：不翻译、不改写，后端给什么就存什么。
 */
export class OverviewStatisticsCodec {
  static decode(o: any): OverviewStatistics {
    const x = new OverviewStatistics();
    x.from = o?.from ?? 0;
    x.to = o?.to ?? 0;
    x.devices = OverviewStatisticsCodec.decodeDevices(o?.devices);
    x.services = OverviewStatisticsCodec.decodeServices(o?.services);
    x.alarms = OverviewStatisticsCodec.decodeAlarms(o?.alarms);
    x.failures = OverviewStatisticsCodec.decodeFailures(o?.failures);
    return x;
  }

  static decodeDevices(o: any): DeviceOverview {
    const x = new DeviceOverview();
    x.total = o?.total ?? 0;
    x.online = o?.online ?? 0;
    x.byType = OverviewStatisticsCodec.decodeCounts(o?.byType, 'type');
    return x;
  }

  static decodeServices(o: any): ServiceOverview {
    const x = new ServiceOverview();
    x.total = o?.total ?? 0;
    x.byConfig = OverviewStatisticsCodec.decodeCounts(o?.byConfig, 'configId');
    return x;
  }

  static decodeAlarms(o: any): AlarmOverview {
    const x = new AlarmOverview();
    x.total = o?.total ?? 0;
    x.byText = OverviewStatisticsCodec.decodeCounts(o?.byText, 'text');
    x.hourly = OverviewStatisticsCodec.decodeBuckets(o?.hourly);
    return x;
  }

  static decodeFailures(o: any): FailureOverview {
    const x = new FailureOverview();
    x.total = o?.total ?? 0;
    x.hourly = OverviewStatisticsCodec.decodeBuckets(o?.hourly);
    return x;
  }

  /**
   * 一份分组：`key` 是那个键在线上叫什么（三份分组各不同）。
   *
   * 键缺失时给空串而不是丢掉这一项：计数与总数要仍能对得上（后端本来就不会下发缺键的项，
   * 这里只是不让一个脏键把整份分布吃掉一行）。
   */
  static decodeCounts(rows: any, key: string): StatisticsCount[] {
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows.map((row) => {
      const item = new StatisticsCount();
      item.key = row?.[key] ?? '';
      item.count = row?.count ?? 0;
      return item;
    });
  }

  static decodeBuckets(rows: any): StatisticsBucket[] {
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows.map((row) => {
      const item = new StatisticsBucket();
      item.at = row?.at ?? 0;
      item.count = row?.count ?? 0;
      return item;
    });
  }
}
