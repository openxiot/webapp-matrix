import { ModbusConfig } from '../../../typedef/define/modbus/Modbus';
import {
  HOUR,
  alarmWindow,
  dayStart,
  distributionData,
  hourLabels,
  serviceTypeData,
  sumSince,
} from './dashboard.functions';

/**
 * 看板的窗口算法与折算。
 *
 * 这些函数错了**不会报错，只会悄悄不对**：窗口差一小时就是曲线整体错位一格，
 * 「今日」的口径差一条边界就是卡片上少一条，而同名的两分量表不合并就是饼上多一片 ——
 * 三种都看不出来。故断言盯着三处边界：整点、23 点这一小时（窗口起点正好落在今天 00:00）、
 * 以及桶起点正好等于今日 00:00 的那一桶该不该算今天。
 *
 * 时刻一律用**本地构造**（`new Date(y, m, d, h, min)`）：这些函数按本地时区定义，
 * 拿 UTC 字面量写测试会在别的时区挂掉。
 */
describe('alarmWindow', () => {
  it('非整点时刻：起点是当前整点往前数 23 小时，终点是「现在」', () => {
    // 当前这一小时是部分桶：终点的数只统计到此刻，所以不能取下一个整点
    const now = at(10, 37);
    expect(alarmWindow(now)).toEqual({ from: at(10) - 23 * HOUR, to: now });
  });

  it('整点时刻：终点就是该整点，共 24 个整点桶', () => {
    const now = at(10);
    const w = alarmWindow(now);
    expect(w).toEqual({ from: at(10) - 23 * HOUR, to: now });
    expect((w.to - w.from) / HOUR).toBe(23);
  });

  it('23 点这一小时：窗口起点正好是今天 00:00（「今日」= 整窗求和，等号只在这里出现）', () => {
    // 这条边界是「今日」不用第二次请求的全部依据：from ≤ 今天 00:00 恒成立
    const now = at(23, 5);
    expect(alarmWindow(now).from).toBe(dayStart(now));
  });

  it('其余时刻窗口起点都早于今天 00:00（今日被整窗盖住）', () => {
    for (const h of [0, 5, 12, 22]) {
      const now = at(h, 30);
      expect(alarmWindow(now).from).toBeLessThan(dayStart(now));
    }
  });
});

describe('dayStart', () => {
  it('本地当日 00:00（不是 UTC 的 00:00）', () => {
    const now = at(15, 42);
    expect(dayStart(now)).toBe(at(0));
  });

  it('当天任意时刻得到同一个值', () => {
    expect(dayStart(at(0))).toBe(dayStart(at(23, 59)));
  });
});

describe('sumSince', () => {
  it('只加桶起点不早于 since 的桶', () => {
    const today = dayStart(at(14));
    const hourly = [
      { at: today - HOUR, count: 5 }, // 昨天 23:00 那一桶，不算今天
      { at: today, count: 3 },
      { at: today + HOUR, count: 2 },
    ];
    expect(sumSince(hourly, today)).toBe(5);
  });

  it('桶起点正好等于 since 的算进去（00:00~01:00 这一小时属于今天）', () => {
    const today = dayStart(at(14));
    expect(sumSince([{ at: today, count: 7 }], today)).toBe(7);
  });

  it('空数组给 0', () => {
    expect(sumSince([], dayStart(at(14)))).toBe(0);
  });
});

describe('hourLabels', () => {
  it('按本地小时给 HH:00，个位数补零', () => {
    expect(
      hourLabels([
        { at: at(3), count: 0 },
        { at: at(14), count: 1 },
      ]),
    ).toEqual(['03:00', '14:00']);
  });

  it('24 个连续整点桶：每个「几点」正好出现一次，故标签不必带日期', () => {
    const { from } = alarmWindow(at(10, 20));
    const buckets = Array.from({ length: 24 }, (_, i) => ({ at: from + i * HOUR, count: 0 }));
    const labels = hourLabels(buckets);
    expect(labels).toHaveLength(24);
    expect(new Set(labels).size).toBe(24);
  });
});

describe('distributionData', () => {
  it('键就是片名，原样搬（类型段与告警文本都不翻译）', () => {
    expect(
      distributionData([
        { key: 'dtu', count: 5 },
        { key: '温度过高', count: 2 },
      ]),
    ).toEqual([
      { name: 'dtu', value: 5 },
      { name: '温度过高', value: 2 },
    ]);
  });

  it('空数组给空数组', () => {
    expect(distributionData([])).toEqual([]);
  });
});

describe('serviceTypeData', () => {
  const configs: ModbusConfig[] = [
    { id: 'cfg-1', slave: { manufacturer: '特灵', model: '19XRV' }, commands: [] },
    { id: 'cfg-2', slave: { manufacturer: '特灵', model: '19XRV' }, commands: [] },
    { id: 'cfg-3', slave: { manufacturer: '开利', model: '30XA' }, commands: [] },
  ];

  it('把 configId 解成「厂家 型号」', () => {
    expect(serviceTypeData([{ key: 'cfg-3', count: 4 }], configs, '未定义')).toEqual([
      { name: '开利 30XA', value: 4 },
    ]);
  });

  it('两分量表同名时合并成一片（否则饼上是两片一模一样的片）', () => {
    const rows = [
      { key: 'cfg-1', count: 2 },
      { key: 'cfg-2', count: 3 },
    ];
    expect(serviceTypeData(rows, configs, '未定义')).toEqual([{ name: '特灵 19XRV', value: 5 }]);
  });

  it('空 configId = 没配点表，归到调用方给的文案', () => {
    expect(serviceTypeData([{ key: '', count: 1 }], configs, '未定义')).toEqual([
      { name: '未定义', value: 1 },
    ]);
  });

  it('点表查不到时显示 id 本身（与服务清单页那一列同口径，不并进「未定义」）', () => {
    // 点表被删或不可见是常态：显示 id 至少能让人顺着去查，含糊的「未定义」不能
    expect(serviceTypeData([{ key: 'cfg-gone', count: 1 }], configs, '未定义')).toEqual([
      { name: 'cfg-gone', value: 1 },
    ]);
  });

  it('合并后重新排序：条数降序、同数按名字升序（与后端三份分组同规矩）', () => {
    const rows = [
      { key: 'cfg-1', count: 2 },
      { key: 'cfg-2', count: 3 }, // 与 cfg-1 合并成 5，合计最大
      { key: 'cfg-3', count: 4 },
      { key: '', count: 4 },
    ];
    // 4 并列时按码位升序：「开」U+5F00 < 「未」U+672A
    expect(serviceTypeData(rows, configs, '未定义')).toEqual([
      { name: '特灵 19XRV', value: 5 },
      { name: '开利 30XA', value: 4 },
      { name: '未定义', value: 4 },
    ]);
  });

  it('点表清单为空（拉取失败）时全部退回 id，不炸也不并成一片', () => {
    const rows = [
      { key: 'cfg-1', count: 2 },
      { key: 'cfg-2', count: 3 },
    ];
    expect(serviceTypeData(rows, [], '未定义')).toEqual([
      { name: 'cfg-2', value: 3 },
      { name: 'cfg-1', value: 2 },
    ]);
  });

  it('空输入给空数组', () => {
    expect(serviceTypeData([], configs, '未定义')).toEqual([]);
  });
});

/** 本地时刻：2026-09-14 hh:mm（月份从 0 数） */
function at(hour: number, minute = 0): number {
  return new Date(2026, 8, 14, hour, minute).getTime();
}
