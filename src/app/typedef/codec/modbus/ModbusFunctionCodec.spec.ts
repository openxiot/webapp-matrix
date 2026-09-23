import { ModbusFunction, ModbusFunctionRequest } from '../../define/modbus/ModbusService';
import { ModbusFunctionCodec } from './ModbusFunctionCodec';

/**
 * 方法的编解码往返。断言的重点不是「键抄全了」，而是三条**错了不会报错、只会悄悄不对**的口径：
 *
 * - **写方法不出 `response` 键**：出一个空 `{fields: []}` 后端会把它当读方法校验
 *   （读方法必须有非空字段表），得不偿失；
 * - **`value: false` / `value: 0` 要留住**：位 = 关、寄存器 = 0 都是正经的缺省值，
 *   写成 `||` 判空会让它们在下一次保存时静默消失，方法随即变成「每次必填」；
 * - **读写给 quantity、写给 fields，两者互斥**：缺的那半边不该被补成 `null` / `[]` 写回库。
 */
describe('ModbusFunctionCodec', () => {
  /** 一个读方法：请求只有 quantity，应答有字段 */
  function readFunction(): ModbusFunction {
    const func = new ModbusFunction();
    func.index = 1;
    func.name = '读进水温度';
    func.request = Object.assign(new ModbusFunctionRequest(), {
      slaveId: 4,
      fc: '03',
      start: 1,
      quantity: 1,
    });
    func.response = {
      fields: [{ index: 1, field: '进水温度', bytes: 2, format: 'int16', byteOrder: 'ABCD', unit: '℃' }],
    };
    return func;
  }

  describe('request', () => {
    it('读方法只出 quantity，不出 fields', () => {
      const o = ModbusFunctionCodec.encode(readFunction());

      expect(o.request).toEqual({ slaveId: 4, fc: '03', start: 1, quantity: 1 });
      expect('fields' in o.request).toBe(false);
    });

    it('写方法只出 fields，不出 quantity', () => {
      const func = new ModbusFunction();
      func.index = 2;
      func.name = '写设定';
      func.request = Object.assign(new ModbusFunctionRequest(), {
        slaveId: 4,
        fc: '10',
        start: 10,
        fields: [
          { index: 1, field: '写入值 1', offset: 0, format: 'uint16', value: 0 },
          { index: 2, field: '写入值 2', offset: 1, format: 'int32', byteOrder: 'CDAB' },
        ],
      });

      const o = ModbusFunctionCodec.encode(func);

      expect(o.request).toEqual({
        slaveId: 4,
        fc: '10',
        start: 10,
        fields: [
          { index: 1, field: '写入值 1', offset: 0, format: 'uint16', value: 0 },
          { index: 2, field: '写入值 2', offset: 1, format: 'int32', byteOrder: 'CDAB' },
        ],
      });
      expect('quantity' in o.request).toBe(false);
    });

    it('05/06 的单值字段不带 offset（帧里没有「第几个」）', () => {
      const func = new ModbusFunction();
      func.index = 1;
      func.name = '开关机';
      func.request = Object.assign(new ModbusFunctionRequest(), {
        slaveId: 1,
        fc: '05',
        start: 0,
        fields: [{ index: 1, field: '开关机', format: 'bit', value: false }],
      });

      const o = ModbusFunctionCodec.encode(func);

      expect('offset' in o.request.fields[0]).toBe(false);
      // 位 = 关：false 是有效缺省值，不能因为「假值」被丢掉
      expect(o.request.fields[0].value).toBe(false);
    });

    it('decode 后再 encode 得到同一份 JSON（编辑页原样回存不改动）', () => {
      const json = {
        index: 2,
        name: '写多寄存器',
        request: {
          slaveId: 1,
          fc: '10',
          start: 3,
          fields: [
            { index: 1, field: '写入值 1', offset: 0, format: 'uint16', value: 0 },
            { index: 2, field: '写入值 2', offset: 1, format: 'uint16', value: 65535 },
          ],
        },
      };

      expect(ModbusFunctionCodec.encode(ModbusFunctionCodec.decode(json))).toEqual(json);
    });

    it('request 缺失时解出空定义（老数据不抛），编回去仍是一个对象', () => {
      const func = ModbusFunctionCodec.decode({ index: 1, name: '读' });

      expect(func.request.slaveId).toBe(0);
      expect(func.request.fc).toBe('');
      expect(ModbusFunctionCodec.encode(func).request).toEqual({ slaveId: 0, fc: '', start: 0 });
    });
  });

  describe('response', () => {
    it('有字段就读得出、编得回', () => {
      const o = ModbusFunctionCodec.encode(readFunction());

      expect(o.response.fields[0].field).toBe('进水温度');
      expect(ModbusFunctionCodec.decode(o).response?.fields[0].unit).toBe('℃');
    });

    it('写方法（没有 response）整个键都不出', () => {
      const func = new ModbusFunction();
      func.index = 1;
      func.name = '写';
      func.request = Object.assign(new ModbusFunctionRequest(), {
        slaveId: 1,
        fc: '06',
        start: 0,
        fields: [{ index: 1, field: '设定值', format: 'uint16', value: 1 }],
      });

      expect('response' in ModbusFunctionCodec.encode(func)).toBe(false);
    });

    it('response 在、但字段是空的：同样不出键（空对象会被当成读方法）', () => {
      const func = readFunction();
      func.response = { fields: [] };

      expect('response' in ModbusFunctionCodec.encode(func)).toBe(false);
    });

    it('后端没下发 response 时解出 undefined，不是空对象', () => {
      const func = ModbusFunctionCodec.decode({
        index: 1,
        name: '写',
        request: { slaveId: 1, fc: '06', start: 0, fields: [{ index: 1, field: '值', format: 'uint16' }] },
      });

      expect(func.response).toBeUndefined();
    });
  });

  describe('interval / polling', () => {
    it('都没配就不出这两个键（后端用 null 表达同一件事，不带即缺省）', () => {
      const o = ModbusFunctionCodec.encode(readFunction());

      expect('interval' in o).toBe(false);
      expect('polling' in o).toBe(false);
    });

    it('配了就原样带上，含 polling=false（暂停但保留周期）', () => {
      const func = readFunction();
      func.interval = 30;
      func.polling = false;

      expect(ModbusFunctionCodec.encode(func)).toMatchObject({ interval: 30, polling: false });
    });

    it('interval 缺失时 polling 也解不出 undefined（不把缺省说成暂停）', () => {
      expect(ModbusFunctionCodec.decode({ index: 1, name: '读' }).polling).toBeUndefined();
    });
  });

  describe('decodeArray', () => {
    it('不是数组就给空列表（服务未选 / 后端缺省时不抛）', () => {
      expect(ModbusFunctionCodec.decodeArray({})).toEqual([]);
      expect(ModbusFunctionCodec.decodeArray('funcs')).toEqual([]);
      // 形参类型写的是 Object，真实调用点却是 any（上游 `o.functions` 缺失时就是 undefined）——
      // 这里绕过类型把那个运行时情形测掉，否则「后端少发一个键」会在页面里炸成 TypeError
      const missing = undefined as unknown as Object;
      expect(ModbusFunctionCodec.decodeArray(missing)).toEqual([]);
    });
  });
});
