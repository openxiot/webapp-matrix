import { ModbusConfig } from '../../../typedef/define/modbus/Modbus';
import { StatisticsBucket, StatisticsCount } from '../../../typedef/define/statistics/OverviewStatistics';
import { DistributionData, LineData, StatData } from '../../../typedef/define/dashboard/WebDashboardWidgetData';
import {
  HOUR,
  absoluteWindow,
  dayStart,
  distributionFor,
  distributionPoints,
  hourLabels,
  linePoints,
  metricValue,
  serviceTypePoints,
  sumSince,
  truncatePoints,
  windowLabel,
} from './dashboard.folding';

/**
 * 取数折算。这一层要钉住的是**假数字**：算错了不会报错，页面上就是一个看着挺正常的数。
 *
 * - 「今日」以**服务端的 `to`** 划界，不是浏览器时间（`last: {hours: 24}` 的右端是服务端的
 *   「现在」，客户端的钟可能差几分钟甚至差一个时区）。
 * - `undefined`（算不出来）与 `0`（真的是 0）必须分得开。
 * - 跨天的整点标签带日期，否则一周的曲线上有七个一模一样的「08:00」。
 * - 服务类型的同名要合并、空 `configId` 归口，否则饼上出现两片一样的片。
 *
 * 时间一律用**本地**时刻构造（`new Date(y, m, d, ...)`），这样用例在任何时区下都对。
 */
describe('dashboard.folding', () => {
  describe('时间与求和', () => {
    it('dayStart 取本地 00:00（用户说的「今日」是他自己日历上的今天）', () => {
      const at = new Date(2026, 8, 17, 14, 30, 15).getTime();

      const start = new Date(dayStart(at));

      expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 8, 17]);
      expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
    });

    it('桶起点正好是 00:00 的那一桶算今天（写成 > 会每天少算第一个小时）', () => {
      const start = new Date(2026, 8, 17).getTime();

      expect(sumSince([{ at: start, count: 5 }], start)).toBe(5);
      expect(sumSince([{ at: start - HOUR, count: 5 }], start)).toBe(0);
    });

    it('只加界内的桶', () => {
      const start = new Date(2026, 8, 17).getTime();
      const hourly = [
        { at: start - 2 * HOUR, count: 100 },
        { at: start, count: 1 },
        { at: start + HOUR, count: 2 },
      ];

      expect(sumSince(hourly, start)).toBe(3);
    });

    it('空数组与 undefined 都当 0', () => {
      expect(sumSince([], 0)).toBe(0);
      expect(sumSince(undefined as unknown as StatisticsBucket[], 0)).toBe(0);
    });
  });

  describe('hourLabels', () => {
    it('同一天内是 HH:00', () => {
      const base = new Date(2026, 8, 17, 8).getTime();

      expect(hourLabels([{ at: base, count: 0 }, { at: base + HOUR, count: 0 }])).toEqual(['08:00', '09:00']);
    });

    it('跨天补上日期（否则一周的曲线上有七个一样的 08:00）', () => {
      const first = new Date(2026, 8, 17, 23).getTime();

      expect(hourLabels([{ at: first, count: 0 }, { at: first + HOUR, count: 0 }])).toEqual([
        '09-17 23:00',
        '09-18 00:00',
      ]);
    });

    it('空数据给空数组', () => {
      expect(hourLabels([])).toEqual([]);
      expect(hourLabels(undefined as unknown as StatisticsBucket[])).toEqual([]);
    });

    it('单个桶不算跨天', () => {
      expect(hourLabels([{ at: new Date(2026, 8, 17, 5).getTime(), count: 1 }])).toEqual(['05:00']);
    });
  });

  describe('metricValue', () => {
    it('直接指标取服务端算好的 value', () => {
      const data = stat({ value: 12 });

      expect(metricValue('devices.total', data)).toBe(12);
      expect(metricValue('devices.online', data)).toBe(12);
      expect(metricValue('services.total', data)).toBe(12);
      expect(metricValue('alarms.window', data)).toBe(12);
      expect(metricValue('failures.total', data)).toBe(12);
    });

    it('alarms.today 在 hourly 上按服务端的 to 求和', () => {
      // to 是下午 14:30：今天 00:00 之后的两桶（3 + 4）算今天，昨天的 100 不算
      const to = new Date(2026, 8, 17, 14, 30).getTime();
      const today = new Date(2026, 8, 17, 0).getTime();
      const data = stat({
        hourly: [
          { at: today - HOUR, count: 100 },
          { at: today, count: 3 },
          { at: today + HOUR, count: 4 },
        ],
        to,
      });

      expect(metricValue('alarms.today', data)).toBe(7);
    });

    it('alarms.today 没有 to 时给 undefined，不给 0', () => {
      // to=0 说明后端没给窗口：折出「今日告警：0」是个彻头彻尾的假数字
      expect(metricValue('alarms.today', stat({ hourly: [{ at: 1, count: 9 }], to: 0 }))).toBeUndefined();
    });

    it('直接指标没下发 value 时给 undefined（不是 0）', () => {
      expect(metricValue('devices.total', stat({}))).toBeUndefined();
    });

    it('value: 0 要留住（真的是 0）', () => {
      expect(metricValue('devices.total', stat({ value: 0 }))).toBe(0);
    });

    it('不认识的 metric 给 undefined（库里可能存着将来版本写的指标）', () => {
      expect(metricValue('energy.daily', stat({ value: 5 }))).toBeUndefined();
      expect(metricValue(undefined, stat({ value: 5 }))).toBeUndefined();
    });
  });

  describe('windowLabel', () => {
    it('相对窗口给词条与小时数（由调用方翻译）', () => {
      expect(windowLabel({ kind: 'last', hours: 24 })).toEqual({
        kind: 'last',
        key: '最近 {{hours}} 小时',
        hours: 24,
      });
    });

    it('绝对窗口给两个时间戳（由模板的 date 管道格式化）', () => {
      expect(windowLabel({ kind: 'range', from: 1, to: 2 })).toEqual({ kind: 'range', from: 1, to: 2 });
    });

    it('没配窗口时不给标签（卡片就不显示窗口）', () => {
      expect(windowLabel(undefined)).toBeUndefined();
    });
  });

  describe('absoluteWindow', () => {
    it('相对窗口算成 [now − N 小时, now]', () => {
      const now = new Date(2026, 8, 17, 14).getTime();

      expect(absoluteWindow({ kind: 'last', hours: 6 }, now)).toEqual({ from: now - 6 * HOUR, to: now });
    });

    it('绝对窗口原样返回', () => {
      expect(absoluteWindow({ kind: 'range', from: 1, to: 2 }, 99)).toEqual({ from: 1, to: 2 });
    });

    it('没窗口时给最近 24 小时（编辑器切到「绝对区间」时的初值）', () => {
      expect(absoluteWindow(undefined, 100)).toEqual({ from: 100 - 24 * HOUR, to: 100 });
    });
  });

  describe('分布折算', () => {
    it('设备类型 / 告警文本的键原样当片名', () => {
      const rows: StatisticsCount[] = [
        { key: 'dtu', count: 5 },
        { key: '温度过高', count: 3 },
      ];

      expect(distributionPoints(rows)).toEqual([
        { name: 'dtu', value: 5 },
        { name: '温度过高', value: 3 },
      ]);
    });

    it('服务类型：合并同名（两分量表可能拼出同一个名字）', () => {
      const configs: ModbusConfig[] = [config('c1', '西门子', 'S7-200'), config('c2', '西门子', 'S7-200')];
      const rows: StatisticsCount[] = [
        { key: 'c1', count: 2 },
        { key: 'c2', count: 3 },
      ];

      expect(serviceTypePoints(rows, configs, '未定义')).toEqual([{ name: '西门子 S7-200', value: 5 }]);
    });

    it('服务类型：空 configId 归到「未定义」', () => {
      // 「这个服务没配点表」与「点表叫这个名字」是两回事
      expect(serviceTypePoints([{ key: '', count: 4 }], [], '未定义')).toEqual([{ name: '未定义', value: 4 }]);
    });

    it('服务类型：查不到的点表拼出 id 本身（与服务清单页同口径）', () => {
      expect(serviceTypePoints([{ key: 'gone', count: 1 }], [], '未定义')).toEqual([
        { name: 'gone', value: 1 },
      ]);
    });

    it('服务类型：合并后重排（条数降序、同数按名字码位升序 —— 不能用 localeCompare，它会随语言变序）', () => {
      const configs: ModbusConfig[] = [config('a', 'B厂', 'B1'), config('b', 'A厂', 'A1'), config('c', 'B厂', 'B1')];
      const rows: StatisticsCount[] = [
        { key: 'a', count: 1 },
        { key: 'b', count: 1 },
        { key: 'c', count: 5 },
      ];

      expect(serviceTypePoints(rows, configs, '未定义').map((p) => p.name)).toEqual(['B厂 B1', 'A厂 A1']);
    });

    it('distributionFor 按维度分派，不认识的维度给空（不是把 groups 原样折出去）', () => {
      const data: DistributionData = { groups: [{ key: 'c1', count: 2 }] };
      const configs: ModbusConfig[] = [config('c1', '西门子', 'S7-200')];

      expect(distributionFor('serviceType', data, configs, '未定义')).toEqual([
        { name: '西门子 S7-200', value: 2 },
      ]);
      expect(distributionFor('deviceType', data, configs, '未定义')).toEqual([{ name: 'c1', value: 2 }]);
      expect(distributionFor('alarmType', data, configs, '未定义')).toEqual([{ name: 'c1', value: 2 }]);
      expect(distributionFor('failureType', data, configs, '未定义')).toEqual([{ name: 'c1', value: 2 }]);
      expect(distributionFor('sankey', data, configs, '未定义')).toEqual([]);
      expect(distributionFor(undefined, data, configs, '未定义')).toEqual([]);
    });

    it('truncatePoints：没设 limit 或片数不够时原样返回', () => {
      const points = [{ name: 'a', value: 3 }, { name: 'b', value: 2 }];

      expect(truncatePoints(points, undefined, '其他')).toEqual(points);
      expect(truncatePoints(points, 0, '其他')).toEqual(points);
      expect(truncatePoints(points, 2, '其他')).toEqual(points);
      expect(truncatePoints(points, 5, '其他')).toEqual(points);
    });

    it('truncatePoints：前 N + 其他（其他 = 余下之和）', () => {
      const points = [
        { name: 'a', value: 5 },
        { name: 'b', value: 4 },
        { name: 'c', value: 3 },
        { name: 'd', value: 2 },
      ];

      expect(truncatePoints(points, 2, '其他')).toEqual([
        { name: 'a', value: 5 },
        { name: 'b', value: 4 },
        { name: '其他', value: 5 },
      ]);
    });

    it('truncatePoints：正好等于片数时不补一片空的「其他」', () => {
      const points = [{ name: 'a', value: 1 }, { name: 'b', value: 1 }];

      expect(truncatePoints(points, 2, '其他').length).toBe(2);
    });
  });

  describe('linePoints', () => {
    it('标签与计数各取一份（点数与标签数必须相等，否则连线会错位）', () => {
      const data = lineData({
        points: [
          { at: new Date(2026, 8, 17, 8).getTime(), count: 1 },
          { at: new Date(2026, 8, 17, 9).getTime(), count: 0 },
          { at: new Date(2026, 8, 17, 10).getTime(), count: 2 },
        ],
      });

      const folded = linePoints(data);

      expect(folded.labels).toEqual(['08:00', '09:00', '10:00']);
      expect(folded.counts).toEqual([1, 0, 2]);
    });
  });
});

// ===== 夹具 =====

/** 点表（只用到 id 与 `slave`，够 `modbusConfigLabel` 拼出「厂家 型号」） */
function config(id: string, manufacturer: string, model: string): ModbusConfig {
  return { id, slave: { manufacturer, model }, commands: [] };
}

function stat(partial: Partial<StatData>): StatData {
  const data = new StatData();
  Object.assign(data, partial);
  return data;
}

function lineData(partial: Partial<LineData>): LineData {
  const data = new LineData();
  Object.assign(data, partial);
  return data;
}
