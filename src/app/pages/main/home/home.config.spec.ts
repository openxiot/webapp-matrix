import { readBoolean, readNumber, readString, readStringArray, readWindow } from './home.config';

/**
 * 防御性读取。这一层要钉住的是**「读不出来」与「读出来是 0 / 空」分得开**：
 * 库里存着旧版本写的配置（少字段、类型不对）是常态，把 `"12"` 或 `NaN` 收下来，
 * 页面上会是一个看着正常、其实来自脏数据的数。
 *
 * 全部用例都只断言「合法值原样出去、不合法值出 `undefined`」，不看界面。
 */
describe('home.config', () => {
  describe('readString', () => {
    it('字符串原样给出', () => {
      expect(readString({ metric: 'devices.total' }, 'metric')).toBe('devices.total');
    });

    it('空串等于没配（编辑器清空下拉的产物）', () => {
      expect(readString({ metric: '' }, 'metric')).toBeUndefined();
    });

    it('类型不对给 undefined（数字不是字符串）', () => {
      expect(readString({ metric: 12 }, 'metric')).toBeUndefined();
      expect(readString({ metric: null }, 'metric')).toBeUndefined();
      expect(readString({ metric: ['a'] }, 'metric')).toBeUndefined();
    });

    it('字段不存在、或整个 config 都没有，都给 undefined', () => {
      expect(readString({}, 'metric')).toBeUndefined();
      expect(readString(undefined, 'metric')).toBeUndefined();
    });
  });

  describe('readNumber', () => {
    it('数字原样给出（含 0 与负数）', () => {
      expect(readNumber({ limit: 5 }, 'limit')).toBe(5);
      expect(readNumber({ limit: 0 }, 'limit')).toBe(0);
      expect(readNumber({ limit: -1 }, 'limit')).toBe(-1);
    });

    it('字符串数字不收（线格式里数字就是数字）', () => {
      expect(readNumber({ limit: '5' }, 'limit')).toBeUndefined();
    });

    it('NaN / Infinity 不收（它们会画出一张空图或一个空轴）', () => {
      expect(readNumber({ limit: Number.NaN }, 'limit')).toBeUndefined();
      expect(readNumber({ limit: Number.POSITIVE_INFINITY }, 'limit')).toBeUndefined();
    });

    it('字段不存在、或整个 config 都没有，都给 undefined', () => {
      expect(readNumber({}, 'limit')).toBeUndefined();
      expect(readNumber(undefined, 'limit')).toBeUndefined();
    });
  });

  describe('readStringArray', () => {
    it('字符串清单原样给出，顺序不动（字段顺序就是卡片上的行顺序）', () => {
      expect(readStringArray({ fields: ['温度', '压力', '湿度'] }, 'fields')).toEqual([
        '温度',
        '压力',
        '湿度',
      ]);
    });

    it('坏项逐个丢，好项照留（一个 null 不该让另外九个一起消失）', () => {
      expect(readStringArray({ fields: ['温度', null, 12, '', '压力'] }, 'fields')).toEqual([
        '温度',
        '压力',
      ]);
    });

    it('空数组等于没配（用户把字段全取消勾选与没配是同一件事）', () => {
      expect(readStringArray({ fields: [] }, 'fields')).toBeUndefined();
    });

    it('不是数组的一律当没配（旧配置里这个键可能是个字符串）', () => {
      expect(readStringArray({ fields: '温度' }, 'fields')).toBeUndefined();
      expect(readStringArray({ fields: null }, 'fields')).toBeUndefined();
      expect(readStringArray({ fields: {} }, 'fields')).toBeUndefined();
    });

    it('字段不存在、或整个 config 都没有，都给 undefined', () => {
      expect(readStringArray({}, 'fields')).toBeUndefined();
      expect(readStringArray(undefined, 'fields')).toBeUndefined();
    });
  });

  describe('readBoolean', () => {    it('布尔原样给出（两个方向都收）', () => {
      expect(readBoolean({ showUnit: true }, 'showUnit', false)).toBe(true);
      expect(readBoolean({ showUnit: false }, 'showUnit', true)).toBe(false);
    });

    it('没配时按给定的缺省（缺省是可选的，不是恒为 false）', () => {
      expect(readBoolean({}, 'showUnit', true)).toBe(true);
      expect(readBoolean({}, 'showUnit', false)).toBe(false);
      expect(readBoolean(undefined, 'showUnit', true)).toBe(true);
    });

    it('字符串 "false" 不收：线格式里布尔就是布尔', () => {
      expect(readBoolean({ showUnit: 'false' }, 'showUnit', true)).toBe(true);
      expect(readBoolean({ showUnit: 'true' }, 'showUnit', false)).toBe(false);
    });

    it('脏值（数字 / null / 数组）按缺省走，而不是当成关掉', () => {
      // 「读不出来」与「用户关掉了」是两件事，后者不该由一次解析失败代劳
      expect(readBoolean({ showUnit: 0 }, 'showUnit', true)).toBe(true);
      expect(readBoolean({ showUnit: null }, 'showUnit', true)).toBe(true);
      expect(readBoolean({ showUnit: [] }, 'showUnit', true)).toBe(true);
    });
  });

  describe('readWindow', () => {
    it('相对窗口：正的小时数留下', () => {
      expect(readWindow({ window: { kind: 'last', hours: 24 } })).toEqual({ kind: 'last', hours: 24 });
    });

    it('相对窗口：0 与负数当没配（0 小时的窗口取不到任何东西）', () => {
      expect(readWindow({ window: { kind: 'last', hours: 0 } })).toBeUndefined();
      expect(readWindow({ window: { kind: 'last', hours: -6 } })).toBeUndefined();
    });

    it('相对窗口：`hours` 是字符串或没给，当没配', () => {
      expect(readWindow({ window: { kind: 'last', hours: '24' } })).toBeUndefined();
      expect(readWindow({ window: { kind: 'last' } })).toBeUndefined();
    });

    it('绝对窗口：两端都在且 from ≤ to 才留下', () => {
      expect(readWindow({ window: { kind: 'range', from: 1, to: 2 } })).toEqual({
        kind: 'range',
        from: 1,
        to: 2,
      });
      expect(readWindow({ window: { kind: 'range', from: 2, to: 2 } })).toEqual({
        kind: 'range',
        from: 2,
        to: 2,
      });
    });

    it('绝对窗口：反过来的区间当没配（取数只会得到一片空，看不出是配置错了）', () => {
      expect(readWindow({ window: { kind: 'range', from: 3, to: 2 } })).toBeUndefined();
    });

    it('绝对窗口：缺一端当没配', () => {
      expect(readWindow({ window: { kind: 'range', from: 1 } })).toBeUndefined();
      expect(readWindow({ window: { kind: 'range', to: 2 } })).toBeUndefined();
    });

    it('kind 不认识当没配（将来版本写的第三种窗口）', () => {
      expect(readWindow({ window: { kind: 'since', at: 1 } })).toBeUndefined();
    });

    it('不是对象的一律当没配', () => {
      expect(readWindow({ window: 'last24' })).toBeUndefined();
      expect(readWindow({ window: null })).toBeUndefined();
      expect(readWindow({ window: [1, 2] })).toBeUndefined();
      expect(readWindow({ window: 24 })).toBeUndefined();
    });

    it('没配窗口与整个 config 都没有，都给 undefined（卡片就不显示窗口）', () => {
      expect(readWindow({})).toBeUndefined();
      expect(readWindow(undefined)).toBeUndefined();
    });

    it('键名可换（同一个读取器给别的字段用）', () => {
      expect(readWindow({ subWindow: { kind: 'last', hours: 1 } }, 'subWindow')).toEqual({
        kind: 'last',
        hours: 1,
      });
    });
  });
});
