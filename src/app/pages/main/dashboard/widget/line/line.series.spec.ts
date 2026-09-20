import { WebDashboardWidgetDataItem } from '@app/typedef/define/dashboard/WebDashboardWidgetData';
import {
  hasDrawablePoints,
  hasNoPoints,
  serviceFieldContext,
  serviceFieldData,
  serviceFieldSeries,
} from './line.series';

/**
 * 字段曲线卡的适配层：一张卡的 data 怎么变成历史页那套画法要的输入。
 *
 * 钉的是**四个字段各自的来源**（`unit` / `step` / `failures` / `carryIn`）与两个空态判定。
 * 这些地方错了都不会报错：单位错了只是轴名不对，`step` 错了是图上多出一段根本不存在的中间值，
 * `failures` 错了是「这段时间没失败过」这句**说反了的话**。
 */
describe('line.series', () => {
  function item(data: Record<string, unknown>): WebDashboardWidgetDataItem {
    const x = new WebDashboardWidgetDataItem();
    x.id = 'w1';
    x.success = true;
    x.data = data;
    return x;
  }

  /** 一份最简的区间响应：两个原始样本 */
  function range(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      serviceId: 'svc-1',
      functionIndex: 1,
      field: '温度',
      from: 1_700_000_000_000,
      to: 1_700_000_600_000,
      maxPoints: 500,
      downsampled: false,
      total: 2,
      points: [
        { at: 1_700_000_000_000, value: 1 },
        { at: 1_700_000_300_000, value: 2 },
      ],
      ...extra,
    };
  }

  describe('serviceFieldData', () => {
    it('range 走历史页同一份 codec（点集按 downsampled 分流）', () => {
      const data = serviceFieldData(item(range()));

      expect(data.range.from).toBe(1_700_000_000_000);
      expect(data.range.to).toBe(1_700_000_600_000);
      expect(data.range.points.length).toBe(2);
      // 原始样本：值是 value，不是桶
      expect((data.range.points[0] as { value: unknown }).value).toBe(1);
    });

    it('降采样时点是桶（`until` 在即桶）', () => {
      const data = serviceFieldData(
        item(range({ downsampled: true, points: [{ at: 1, until: 2, count: 3, avg: 1.5 }] })),
      );

      expect(data.range.downsampled).toBe(true);
      expect((data.range.points[0] as { until: number }).until).toBe(2);
    });

    it('unit / step / failures 从 data 的顶部取（服务端随数据下发的那三样）', () => {
      const data = serviceFieldData(
        item(range({ unit: '℃', step: true, failures: [1, 2, 3] })),
      );

      expect(data.unit).toBe('℃');
      expect(data.step).toBe(true);
      expect(data.failures).toEqual([1, 2, 3]);
    });

    it('缺 unit / step / failures 时给空串、false、空数组（不抛）', () => {
      const data = serviceFieldData(item(range()));

      expect(data.unit).toBe('');
      expect(data.step).toBe(false);
      expect(data.failures).toEqual([]);
    });

    it('step 只认真正的 true：位上错了只是难看，数值字段错画成阶梯是**错的**', () => {
      expect(serviceFieldData(item(range({ step: 'true' }))).step).toBe(false);
    });

    it('failures 里的坏项逐个丢（一条脏数据不该让整排竖线消失）', () => {
      const data = serviceFieldData(item(range({ failures: [1, null, 'x', NaN, 2] })));

      expect(data.failures).toEqual([1, 2]);
    });
  });

  describe('serviceFieldContext', () => {
    it('用 data 里的真实区间，不是 config 里那个语义窗口', () => {
      const data = serviceFieldData(item(range()));

      expect(serviceFieldContext(data)).toEqual({
        from: 1_700_000_000_000,
        to: 1_700_000_600_000,
        showTimeAxis: true,
      });
    });
  });

  describe('serviceFieldSeries', () => {
    const data = serviceFieldData(item(range({ unit: '℃', step: true, failures: [7] })));

    it('四个字段各就各位，range 原样传（画法全在历史页那边）', () => {
      const series = serviceFieldSeries(data, '温度', true);

      expect(series).toEqual({
        field: '温度',
        unit: '℃',
        step: true,
        range: data.range,
        failures: [7],
      });
    });

    it('关掉竖线 = failures 传空清单（服务端照样取回来了，只是不画）', () => {
      expect(serviceFieldSeries(data, '温度', false).failures).toEqual([]);
      // 关掉的是「画不画」，不是取数：拿回来的那份不能被改写
      expect(data.failures).toEqual([7]);
    });
  });

  describe('hasDrawablePoints', () => {
    it('数值样本画得出来', () => {
      expect(hasDrawablePoints(serviceFieldData(item(range())).range)).toBe(true);
    });

    it('全是字符串（取值表命中的字段）画不出来 —— 那种图是一个空坐标系', () => {
      const data = serviceFieldData(
        item(range({ points: [{ at: 1, value: '运行' }, { at: 2, value: '停止' }] })),
      );

      expect(hasDrawablePoints(data.range)).toBe(false);
    });

    it('0 是数值、是真实读数，画得出来', () => {
      const data = serviceFieldData(item(range({ points: [{ at: 1, value: 0 }] })));

      expect(hasDrawablePoints(data.range)).toBe(true);
    });

    it('非数值字段的桶画不出来（avg/min/max 全 null，first/last 不该拿来连线）', () => {
      const data = serviceFieldData(
        item(
          range({
            downsampled: true,
            points: [{ at: 1, until: 2, count: 3, first: '运行', last: '停止', min: null, max: null, avg: null }],
          }),
        ),
      );

      expect(hasDrawablePoints(data.range)).toBe(false);
    });

    it('carryIn 是数值就算一个点（窗口内没变过时，画面上就是这一个点）', () => {
      const data = serviceFieldData(
        item(range({ points: [], carryIn: { at: 1_699_999_000_000, value: 42 } })),
      );

      expect(hasDrawablePoints(data.range)).toBe(true);
    });
  });

  describe('hasNoPoints', () => {
    it('一条样本都没有 → true（卡片说「尚未采集」）', () => {
      expect(hasNoPoints(serviceFieldData(item(range({ points: [], total: 0 }))).range)).toBe(true);
    });

    it('有 carryIn 就不算「一个点都没有」：窗口之前那条是真实读数，只是窗口内没变过', () => {
      const data = serviceFieldData(
        item(range({ points: [], total: 0, carryIn: { at: 1_699_999_000_000, value: 42 } })),
      );

      expect(hasNoPoints(data.range)).toBe(false);
    });

    it('有样本但画不出来（字符串字段）→ false：样本就在眼前，说「暂无数据」而不是「尚未采集」', () => {
      const data = serviceFieldData(item(range({ points: [{ at: 1, value: '运行' }] })));

      expect(hasNoPoints(data.range)).toBe(false);
      expect(hasDrawablePoints(data.range)).toBe(false);
    });
  });
});
