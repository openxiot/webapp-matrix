import { numberText, valueText } from './ValueUtils';

/**
 * 数值文案的边界。
 *
 * 「读数收成几位小数」是一条**产品口径**：历史两张表、告警页的当前值、看板的服务卡与设备卡、
 * 服务详情页的调用应答全都走这里，改这个数就是改所有页面的长相 —— 所以钉在测试里。
 *
 * 钉的都是「说错了看不出来」的那几种：`0` 与「没值」、整数带不带 `.0`、`23.5` 会不会被补成
 * `23.50`、以及「最多 2 位」在边界上到底怎么落。
 */
describe('ValueUtils', () => {
  describe('numberText', () => {
    it('整数不带小数点', () => {
      expect(numberText(0)).toBe('0');
      expect(numberText(23)).toBe('23');
      expect(numberText(-7)).toBe('-7');
    });

    it('浮点最多留 2 位小数', () => {
      expect(numberText(23.456789)).toBe('23.46');
      expect(numberText(2.675)).toBe('2.67');
      expect(numberText(-2.675)).toBe('-2.67');
      expect(numberText(0.005)).toBe('0.01');
    });

    it('不够 2 位就不补零', () => {
      expect(numberText(23.5)).toBe('23.5');
      expect(numberText(0.3)).toBe('0.3');
    });

    it('收掉浮点误差（收到 2 位之后不再有尾巴）', () => {
      expect(numberText(0.30000000000000004)).toBe('0.3');
      expect(numberText(1.0000000000000002)).toBe('1');
      // 收完变成整数的，也不许留个 `.0`
      expect(numberText(1.005)).toBe('1');
    });

    it('小于 0.005 的读数会落成 0 —— 这是「留 2 位」的题中之义，不是算错了', () => {
      expect(numberText(0.004)).toBe('0');
      expect(numberText(-0.001)).toBe('0');
    });
  });

  describe('valueText', () => {
    it('没值说 -，0 说 0（后者是真实读数）', () => {
      expect(valueText(null)).toBe('-');
      expect(valueText(undefined)).toBe('-');
      expect(valueText(0)).toBe('0');
    });

    it('数值走 numberText', () => {
      expect(valueText(23.456789)).toBe('23.46');
      expect(valueText(23.5)).toBe('23.5');
    });

    it('非数值原样：取值表的描述、位区的 0/1 都是数据、不翻译', () => {
      expect(valueText('制冷')).toBe('制冷');
      expect(valueText(true)).toBe('true');
    });

    it('对象与数组退化成 JSON', () => {
      expect(valueText({ a: 1 })).toBe('{"a":1}');
      expect(valueText([1, 2])).toBe('[1,2]');
    });
  });
});
