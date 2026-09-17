import { ModbusServiceFunction } from '../../../../../typedef/define/modbus/ModbusService';
import { serviceFieldKey, serviceFieldsOf } from './service.fields';

/**
 * 字段展开。要钉住的是**三处调用方共用同一份口径**，重点在两件容易悄悄错的事：
 * 位区要逐位展开（后端把每一位当独立结果键），以及「画不画得出曲线」的判定
 * （取值表命中的字段值是描述串，画不成，但表格照样列）。
 */
describe('service.fields', () => {
  /** 一个读方法：两个数值字段 + 一个带位区的字段 */
  function readFunction(): ModbusServiceFunction {
    return {
      index: 1,
      name: '读进水',
      request: '010300000002',
      response: [
        { index: 1, field: '温度', bytes: 2, format: 'uint16', unit: '℃' },
        { index: 2, field: '状态', bytes: 2, format: 'uint16', valueList: [{ value: 0, description: '停机' }] },
        {
          index: 3,
          field: '阀门',
          bytes: 1,
          format: 'uint8',
          bitList: [
            { offset: 0, field: '进水阀' },
            { offset: 1, field: '出水阀' },
          ],
        },
      ],
    };
  }

  /** 同名但不同方法的一个字段（字段名在方法之间重名是常态） */
  function otherFunction(): ModbusServiceFunction {
    return {
      index: 2,
      name: '读出水',
      request: '010300010002',
      response: [{ index: 1, field: '温度', bytes: 2, format: 'uint16', unit: '℃' }],
    };
  }

  describe('serviceFieldKey', () => {
    it('带上方法序号（字段名在方法之间会重名）', () => {
      expect(serviceFieldKey(1, '温度')).toBe('1#温度');
      expect(serviceFieldKey(2, '温度')).not.toBe(serviceFieldKey(1, '温度'));
    });
  });

  describe('serviceFieldsOf', () => {
    it('应答字段与位各自占一行，位排在它所属字段之后', () => {
      const refs = serviceFieldsOf([readFunction()]);
      expect(refs.map((ref) => ref.field)).toEqual(['温度', '状态', '阀门', '进水阀', '出水阀']);
    });

    it('字段与位的身份各是各的（位不共用父字段的键）', () => {
      const refs = serviceFieldsOf([readFunction()]);
      expect(new Set(refs.map((ref) => ref.key)).size).toBe(refs.length);
    });

    it('位是阶梯量、没有单位（位是 0/1，没有「单位」的说法）', () => {
      const bits = serviceFieldsOf([readFunction()]).filter((ref) => ref.field.endsWith('阀'));
      for (const bit of bits) {
        expect(bit.step).toBe(true);
        expect(bit.unit).toBe('');
      }
    });

    it('普通字段不是阶梯量，单位取自定义', () => {
      const temp = serviceFieldsOf([readFunction()]).find((ref) => ref.field === '温度');
      expect(temp?.step).toBe(false);
      expect(temp?.unit).toBe('℃');
    });

    it('字段没填单位时给空串（不是 undefined，调用方少一处判空）', () => {
      const func = readFunction();
      func.response = [{ index: 1, field: '计数', bytes: 2, format: 'uint16' }];
      expect(serviceFieldsOf([func])[0].unit).toBe('');
    });

    it('取值表命中的字段画不出曲线（值是描述串，不再缩放）', () => {
      const refs = serviceFieldsOf([readFunction()]);
      expect(refs.find((ref) => ref.field === '状态')?.numeric).toBe(false);
    });

    it('string 字段也画不出曲线', () => {
      const func = readFunction();
      func.response = [{ index: 1, field: '序列号', bytes: 8, format: 'string' }];
      expect(serviceFieldsOf([func])[0].numeric).toBe(false);
    });

    it('带位区的父字段本身仍是可以画曲线的数（整段位掩码）', () => {
      const refs = serviceFieldsOf([readFunction()]);
      expect(refs.find((ref) => ref.field === '阀门')?.numeric).toBe(true);
    });

    it('方法序号只留指定的那个方法；序号从 1 起，0 是「全部」', () => {
      const funcs = [readFunction(), otherFunction()];
      expect(serviceFieldsOf(funcs, 2).map((ref) => ref.key)).toEqual(['2#温度']);
      expect(serviceFieldsOf(funcs, 0).length).toBe(6);
      expect(serviceFieldsOf(funcs).length).toBe(6);
    });

    it('方法名原样带出（写进卡片的字段提示要用它区分同名方法）', () => {
      const refs = serviceFieldsOf([readFunction()], 1);
      expect(refs[0].functionName).toBe('读进水');
      expect(refs[0].functionIndex).toBe(1);
    });

    it('写方法（没有 response）一个字段也没有', () => {
      const write: ModbusServiceFunction = { index: 3, name: '写设定', request: '010600000001', response: [] };
      expect(serviceFieldsOf([write])).toEqual([]);
    });

    it('方法列表为空 / 没给，都返回空数组（服务未选时不抛）', () => {
      expect(serviceFieldsOf([])).toEqual([]);
      expect(serviceFieldsOf(undefined)).toEqual([]);
    });

    it('定义里缺 response / bitList（老数据）不抛，按「没有字段」处理', () => {
      const bare = { index: 1, name: '读', request: '0103000000' } as ModbusServiceFunction;
      expect(serviceFieldsOf([bare])).toEqual([]);

      const withBareBit: ModbusServiceFunction = {
        index: 1,
        name: '读',
        request: '0103000000',
        response: [{ index: 1, field: '阀门', bytes: 1, format: 'uint8', bitList: undefined }],
      };
      expect(serviceFieldsOf([withBareBit]).map((ref) => ref.field)).toEqual(['阀门']);
    });
  });
});
