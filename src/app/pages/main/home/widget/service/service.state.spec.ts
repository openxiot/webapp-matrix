import {
  ServiceData,
  WidgetDataItem,
  serviceData,
} from '../../../../../typedef/define/dashboard/DashboardWidgetData';
import { serviceLines, serviceState } from './service.state';

/**
 * 服务卡的两件事：这一刻处于哪一态、以及一行行怎么说话。
 *
 * 钉的都是**容易合并成一句话**的地方：`0` 与「没值」、`尚未采集` 与「采过但没成功」、
 * 位值的开/关与原始 0/1。合错了的表现是卡片看着正常、数字是错的 —— 那比空着一张卡难查得多。
 */
describe('service.state', () => {
  /** 翻译桩：把词条原样返回，并把它记下来（要断言的是「用了哪个词条」而不是译文） */
  const asked: string[] = [];
  const t = (key: string): string => {
    asked.push(key);
    return `[${key}]`;
  };

  beforeEach(() => {
    asked.length = 0;
  });

  function item(data: Record<string, unknown>, success = true): WidgetDataItem {
    const x = new WidgetDataItem();
    x.id = 'w1';
    x.success = success;
    x.data = data;
    return x;
  }

  /** 从线格式直接读一份数据（连读取函数一起过一遍，两者是一体的） */
  function read(data: Record<string, unknown>, success = true): ServiceData {
    return serviceData(item(data, success));
  }

  describe('serviceState', () => {
    it('还没取到（item 是 undefined）→ loading，卡片留白', () => {
      expect(serviceState(undefined, new ServiceData())).toBe('loading');
    });

    it('这张卡的取数失败 → failed（服务端那句话由 note 显示）', () => {
      expect(serviceState(item({}, false), read({}, false))).toBe('failed');
    });

    it('一条影子都没有（只有 functionIndex）→ 尚未采集', () => {
      expect(serviceState(item({ functionIndex: 1 }), read({ functionIndex: 1 }))).toBe(
        'notCollected',
      );
    });

    it('有采集时刻 → 正常态', () => {
      expect(serviceState(item({ recordedAt: 1 }), read({ recordedAt: 1 }))).toBe('ok');
    });

    it('采过但一次都没成功（有字段行、没有时刻）→ 正常态，显示一行行 `-` 与失败标识', () => {
      // 这一态最容易被误判成「尚未采集」：影子在、值一个没有、lastError 在。
      // 说「尚未采集」会把「哪几个字段配上了」一并藏掉，而那几个 `-` 正是要看的东西
      const data = read({
        functionIndex: 1,
        fields: [{ field: '温度' }, { field: '湿度' }],
        error: 'modbus timeout',
      });
      expect(serviceState(item({ functionIndex: 1 }), data)).toBe('ok');
    });
  });

  describe('serviceLines', () => {
    it('行的顺序就是服务端给的顺序（即配置顺序）', () => {
      const data = read({ fields: [{ field: '压力' }, { field: '温度' }] });
      expect(serviceLines(data, {}, t).map((line) => line.field)).toEqual(['压力', '温度']);
    });

    it('没值说 `-`（不是 0，也不是空）', () => {
      const lines = serviceLines(read({ fields: [{ field: '温度', unit: '℃' }] }), {}, t);
      expect(lines[0].text).toBe('-');
    });

    it('值是 0 就说 0（「这一轮没采到」与「采到了，是 0」是两件事）', () => {
      const lines = serviceLines(read({ fields: [{ field: '计数', value: 0 }] }), {}, t);
      expect(lines[0].text).toBe('0');
    });

    it('浮点收一收误差（0.30000000000000004 → 0.3）', () => {
      const lines = serviceLines(read({ fields: [{ field: '电压', value: 0.1 + 0.2 }] }), {}, t);
      expect(lines[0].text).toBe('0.3');
    });

    it('取值表命中的描述串原样显示（那是点表数据，不翻译）', () => {
      const lines = serviceLines(read({ fields: [{ field: '状态', value: '停机' }] }), {}, t);
      expect(lines[0].text).toBe('停机');
    });

    it('位说「开/关」（可翻译的解释归前端），并走词典', () => {
      const data = read({
        fields: [
          { field: '进水阀', value: 1, bit: true, unit: '' },
          { field: '出水阀', value: 0, bit: true, unit: '' },
        ],
      });
      const lines = serviceLines(data, {}, t);
      expect(lines[0].text).toBe('[开]');
      expect(lines[1].text).toBe('[关]');
      expect(asked).toEqual(['开', '关']);
    });

    it('位值不是 0/1 时按原样显示，不硬说成开或关', () => {
      // 后端要是改了位的返回形态，凭空造一个「开」比显示原值更糟：那是个不存在的读数
      const lines = serviceLines(read({ fields: [{ field: '进水阀', value: 2, bit: true }] }), {}, t);
      expect(lines[0].text).toBe('2');
      expect(asked).toEqual([]);
    });

    it('非位字段即使值是 1/0 也照数值说（不按开关量解释）', () => {
      const lines = serviceLines(read({ fields: [{ field: '计数', value: 1 }] }), {}, t);
      expect(lines[0].text).toBe('1');
      expect(asked).toEqual([]);
    });

    it('单位缺省显示（单位是用户填的点表数据，不说出来这个数就没有量纲）', () => {
      const lines = serviceLines(read({ fields: [{ field: '温度', value: 23.5, unit: '℃' }] }), {}, t);
      expect(lines[0].unit).toBe('℃');
    });

    it('showUnit 关掉时单位留空，值照旧', () => {
      const data = read({ fields: [{ field: '温度', value: 23.5, unit: '℃' }] });
      const lines = serviceLines(data, { showUnit: false }, t);
      expect(lines[0].unit).toBe('');
      expect(lines[0].text).toBe('23.5');
    });

    it('showUnit 是脏值（字符串 "false"）时按缺省走 = 显示，而不是当成关掉', () => {
      const data = read({ fields: [{ field: '温度', value: 1, unit: '℃' }] });
      expect(serviceLines(data, { showUnit: 'false' }, t)[0].unit).toBe('℃');
    });

    it('位没有单位（位是 0/1，没有单位的说法）', () => {
      const data = read({ fields: [{ field: '进水阀', value: 1, bit: true, unit: '' }] });
      expect(serviceLines(data, {}, t)[0].unit).toBe('');
    });

    it('没有字段时给空数组（调用方不必判空）', () => {
      expect(serviceLines(new ServiceData(), {}, t)).toEqual([]);
    });
  });
});
