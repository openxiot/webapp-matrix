import { alarmCurveOption, distributionOption } from './dashboard.charts';

/**
 * 两张图的 option。断言的是**取值路径与形状**，不是样式细节 ——
 * 颜色、圆角、间距改了不该让用例红，但下面这几条一破就是真问题：
 *
 * - 横轴标签数与曲线点数**必须相等**：多一个少一个都会让整条线错位一格，
 *   而错位的曲线看上去仍然是一条正常的曲线（这是最难看出来的一种错）。
 * - **不装翻译器**：图上每个字都是服务端/用户数据，`| translate` 只用在卡片标题上（§7.5）。
 *   这里的用例把「片名原样进 option」钉住。
 * - 分布图的**截断发生在折算那一层**（`truncatePoints`），所以这里收到几片就画几片 ——
 *   本文件不重复做一次截断，否则两处口径迟早会不一致。
 */
describe('dashboard.charts', () => {
  describe('alarmCurveOption', () => {
    it('横轴标签与曲线点数相等（不等就会整体错位一格）', () => {
      const buckets = [at(8), at(9), at(10)].map((hour) => ({ at: hour, count: 0 }));

      const option = alarmCurveOption(buckets);

      const xAxis = option['xAxis'] as { data: string[] };
      const series = (option['series'] as { data: number[] }[])[0];
      expect(xAxis.data.length).toBe(series.data.length);
      expect(series.data.length).toBe(3);
    });

    it('整点桶直接连线：0 的桶也在数组里，不跳点', () => {
      // 后端密集零填充，前端不必猜「这段没有告警还是没有数据」
      const option = alarmCurveOption([
        { at: at(8), count: 1 },
        { at: at(9), count: 0 },
        { at: at(10), count: 4 },
      ]);

      expect((option['series'] as { data: number[] }[])[0].data).toEqual([1, 0, 4]);
    });

    it('长窗口的轴标签间隔变疏、短窗口变密（固定间隔会让一周的轴糊成一片）', () => {
      const intervalOf = (count: number) => {
        const buckets = Array.from({ length: count }, (_, i) => ({ at: at(8) + i * 3_600_000, count: 0 }));
        const xAxis = alarmCurveOption(buckets)['xAxis'] as { axisLabel: { interval: number } };
        return xAxis.axisLabel.interval;
      };

      expect(intervalOf(24)).toBe(3);
      expect(intervalOf(168)).toBe(27);
      // 桶很少时不能给出负数（间隔是「每隔几个标一个」，负数不是合法值）
      expect(intervalOf(1)).toBe(0);
      expect(intervalOf(0)).toBe(0);
    });

    it('空数据不炸：空坐标轴、空曲线', () => {
      const option = alarmCurveOption([]);

      expect((option['xAxis'] as { data: string[] }).data).toEqual([]);
      expect((option['series'] as { data: number[] }[])[0].data).toEqual([]);
    });

    it('纵轴取整（告警条数没有小数）', () => {
      const yAxis = alarmCurveOption([{ at: at(8), count: 1 }])['yAxis'] as { minInterval: number };

      expect(yAxis.minInterval).toBe(1);
    });
  });

  describe('distributionOption', () => {
    it('片名与片值原样进 option（服务端/用户数据，不翻译）', () => {
      const option = distributionOption([
        { name: 'dtu', value: 5 },
        { name: '温度过高', value: 3 },
      ]);

      const series = (option['series'] as { type: string; data: unknown[] }[])[0];
      expect(series.type).toBe('pie');
      expect(series.data).toEqual([
        { name: 'dtu', value: 5 },
        { name: '温度过高', value: 3 },
      ]);
    });

    it('几片就画几片：截断在折算那一层做过了，这里不再截一次', () => {
      const points = [{ name: 'a', value: 5 }, { name: 'b', value: 4 }, { name: '其他', value: 5 }];

      const series = (distributionOption(points)['series'] as { data: unknown[] }[])[0];

      expect(series.data.length).toBe(3);
    });

    it('空数据给空 series（页面另用 nz-empty 兜着，option 不替页面决定显示什么）', () => {
      const series = (distributionOption([])['series'] as { data: unknown[] }[])[0];

      expect(series.data).toEqual([]);
    });

    it('legend 在右侧且可滚动（片名多时不该把图挤没）', () => {
      const legend = distributionOption([])['legend'] as { orient: string; type: string };

      expect(legend.orient).toBe('vertical');
      expect(legend.type).toBe('scroll');
    });
  });
});

/** 某天某点的本地时刻 */
function at(hour: number): number {
  return new Date(2026, 8, 17, hour).getTime();
}
