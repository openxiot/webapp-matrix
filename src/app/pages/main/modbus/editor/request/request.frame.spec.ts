import { ModbusCommand } from '@app/typedef/define/modbus/Modbus';
import { ModbusFunctionRequest } from '@app/typedef/define/modbus/ModbusService';
import {
  buildRequestFrame,
  describeFunctionRequestFrame,
  previewFunctionRequestFrame,
} from './request.frame';

/**
 * 服务侧请求帧预览（结构化 request → 完整 RTU 帧）。
 *
 * 前端这里算的帧**只作展示**（v2 的帧由后端在 invoke 时现组），所以它唯一的风险是「与后端漂移」——
 * 而漂移的表现是「预览给用户看一串帧，实际发出去的是另一串」，界面上完全看不出来。
 * 因此这个文件的重点全在**对照**上，分三层：
 *
 * 1. **绝对锚点**：MODBUS.md 里记着的既有服务迁移前的帧（`01 03 00 01 00 01 D5 CA`），
 *    逐字节写死在这里 —— 后端就是照它改的结构化定义，漂了这条先红；
 * 2. **点表线对照**：同一个动作分别折成「点表命令」与「服务 request」，两条路出来的帧必须
 *    逐字节相同（含 CRC）—— 这是「不新增第二份算式」这句话的可执行版本；
 * 3. **组不出帧**的各种定义（缺 quantity / 缺字段值 / 05 给两个字段）一律 ok=false，
 *    界面据此提示「命令数据不完整」并把「确定」禁掉，而不是发一串残缺的帧出去。
 */
describe('request.frame（服务侧预览）', () => {
  describe('绝对锚点：与后端逐字节对齐', () => {
    // [名字, 结构化 request, 期望的帧]——期望值是照 MODBUS.md / 后端 ModbusFrameCodec 手算的
    const cases: [string, ModbusFunctionRequest, string][] = [
      [
        '读保持寄存器（迁移前那条服务的帧）',
        { slaveId: 1, fc: '03', start: 1, quantity: 1 },
        '01 03 00 01 00 01 D5 CA',
      ],
      [
        '读多个寄存器：quantity 就是帧里的字面值（不再乘跨度）',
        { slaveId: 4, fc: '03', start: 0, quantity: 4 },
        '04 03 00 00 00 04 44 5C',
      ],
      [
        '读线圈：quantity 是位数',
        { slaveId: 2, fc: '01', start: 0, quantity: 8 },
        '02 01 00 00 00 08 3D FF',
      ],
      [
        '写单线圈：ON 是 0xFF00',
        {
          slaveId: 1,
          fc: '05',
          start: 2,
          fields: [{ index: 1, field: '开关机', format: 'bit', value: true }],
        },
        '01 05 00 02 FF 00 2D FA',
      ],
      [
        '写单寄存器',
        {
          slaveId: 1,
          fc: '06',
          start: 0,
          fields: [{ index: 1, field: '设定值', format: 'uint16', value: 100 }],
        },
        '01 06 00 00 00 64 88 21',
      ],
      [
        '写单寄存器：值为 0 也是给了值（缺省值判定用 `!= null`）',
        {
          slaveId: 1,
          fc: '06',
          start: 0,
          fields: [{ index: 1, field: '设定值', format: 'uint16', value: 0 }],
        },
        '01 06 00 00 00 00 89 CA',
      ],
      [
        '写多线圈：按 offset 打包成位，bit0 = 起始地址',
        {
          slaveId: 1,
          fc: '0F',
          start: 0,
          fields: [
            { index: 1, field: '写入值 1', offset: 0, format: 'bit', value: true },
            { index: 2, field: '写入值 2', offset: 1, format: 'bit', value: false },
            { index: 3, field: '写入值 3', offset: 2, format: 'bit', value: true },
          ],
        },
        '01 0F 00 00 00 03 01 05 4F 54',
      ],
      [
        '写多寄存器：数量 = 各字段跨度之和',
        {
          slaveId: 1,
          fc: '10',
          start: 0,
          fields: [
            { index: 1, field: '写入值 1', offset: 0, format: 'uint16', value: 1 },
            { index: 2, field: '写入值 2', offset: 1, format: 'uint16', value: 2 },
          ],
        },
        '01 10 00 00 00 02 04 00 01 00 02 23 AE',
      ],
    ];

    for (const [name, request, expected] of cases) {
      it(name, () => {
        const result = previewFunctionRequestFrame(request);

        expect(result.ok).toBe(true);
        expect(result.ok && result.frame.hex).toBe(expected);
      });
    }
  });

  describe('点表线对照：两条路算出来的帧逐字节相同', () => {
    // 同一个动作的两份定义：左边是点表命令（命令预览那条线），右边是服务 request（本文件这条线）
    const pairs: [string, ModbusCommand, ModbusFunctionRequest, number][] = [
      [
        '读寄存器（点表 quantity 是值的个数，要乘跨度）',
        { name: '读温度', fc: '03', index: 1, start: 1, quantity: 2, dataType: 'int16' },
        { slaveId: 3, fc: '03', start: 1, quantity: 2 },
        3,
      ],
      [
        '读 string（点表 quantity 本身就是长度，不乘）',
        { name: '读序列号', fc: '03', index: 1, start: 0, quantity: 8, dataType: 'string' },
        { slaveId: 3, fc: '03', start: 0, quantity: 8 },
        3,
      ],
      [
        '写单线圈（关）',
        { name: '开关机', fc: '05', index: 1, start: 5, coilState: 'off' },
        {
          slaveId: 3,
          fc: '05',
          start: 5,
          fields: [{ index: 1, field: '开关机', format: 'bit', value: false }],
        },
        3,
      ],
      [
        '写单寄存器（负数走 int16，位模式不变）',
        { name: '设温度', fc: '06', index: 1, start: 1, registerValue: -10 },
        {
          slaveId: 3,
          fc: '06',
          start: 1,
          fields: [{ index: 1, field: '设温度', format: 'int16', value: -10 }],
        },
        3,
      ],
      [
        '写多线圈（9 位 → 2 个数据字节）',
        {
          name: '写阀组',
          fc: '0F',
          index: 1,
          start: 0,
          coils: [
            { offset: 0, on: true },
            { offset: 1, on: false },
            { offset: 8, on: true },
          ],
        },
        {
          slaveId: 3,
          fc: '0F',
          start: 0,
          fields: [
            { index: 1, field: '写入值 1', offset: 0, format: 'bit', value: true },
            { index: 2, field: '写入值 2', offset: 1, format: 'bit', value: false },
            { index: 3, field: '写入值 3', offset: 8, format: 'bit', value: true },
          ],
        },
        3,
      ],
      [
        '写多寄存器（含 4 字节格式与字交换字节序）',
        {
          name: '写设定',
          fc: '10',
          index: 1,
          start: 2,
          registers: [
            { dataType: 'uint16', value: 7 },
            { dataType: 'int32', byteOrder: 'CDAB', value: -2 },
          ],
        },
        {
          slaveId: 3,
          fc: '10',
          start: 2,
          fields: [
            { index: 1, field: '写入值 1', offset: 0, format: 'uint16', value: 7 },
            { index: 2, field: '写入值 2', offset: 1, format: 'int32', byteOrder: 'CDAB', value: -2 },
          ],
        },
        3,
      ],
    ];

    for (const [name, command, request, slaveId] of pairs) {
      it(name, () => {
        const byCommand = buildRequestFrame(command, slaveId);
        const byRequest = previewFunctionRequestFrame(request);

        expect(byCommand.ok).toBe(true);
        expect(byRequest.ok).toBe(true);
        // 逐字节相同（hex 已是空格分隔的大写十六进制，逐字相等即逐字节相等）
        expect(byRequest.ok && byRequest.frame.hex).toBe(byCommand.ok && byCommand.frame.hex);
        expect(byRequest.ok && byRequest.frame.bytes).toEqual(
          byCommand.ok && byCommand.frame.bytes,
        );
      });
    }
  });

  describe('invoke 时用户填的值', () => {
    const write: ModbusFunctionRequest = {
      slaveId: 1,
      fc: '06',
      start: 0,
      fields: [{ index: 1, field: '设定值', format: 'uint16', value: 100 }],
    };

    it('给了值就按值出帧（缺省值只是缺省）', () => {
      const result = previewFunctionRequestFrame(write, { 设定值: 200 });

      expect(result.ok && result.frame.hex).toBe('01 06 00 00 00 C8 88 5C');
    });

    it('值给 0 / false 都算给了（不能用 `||` 判空）', () => {
      expect(previewFunctionRequestFrame(write, { 设定值: 0 }).ok).toBe(true);
      expect(
        previewFunctionRequestFrame(
          {
            slaveId: 1,
            fc: '05',
            start: 0,
            fields: [{ index: 1, field: '开关机', format: 'bit', value: true }],
          },
          { 开关机: false },
        ).ok,
      ).toBe(true);
    });

    it('没给值的字段回落定义里的缺省值', () => {
      // 字段带缺省值 ⇒ 不给也能出帧（后端 resolveValue 同口径：values[name] 否则 field.value）
      expect(previewFunctionRequestFrame(write, { 别的字段: 1 }).ok).toBe(true);
    });

    it('字段名不匹配 = 没给（键就是字段名，不做模糊匹配）', () => {
      const noDefault: ModbusFunctionRequest = {
        slaveId: 1,
        fc: '06',
        start: 0,
        fields: [{ index: 1, field: '设定值', format: 'uint16' }],
      };

      expect(previewFunctionRequestFrame(noDefault).ok).toBe(false);
      expect(previewFunctionRequestFrame(noDefault, { 设定值: 1 }).ok).toBe(true);
    });
  });

  describe('组不出帧的定义一律 ok=false', () => {
    const incomplete: [string, ModbusFunctionRequest | undefined][] = [
      ['request 整个没有', undefined],
      ['读方法没给 quantity', { slaveId: 1, fc: '03', start: 0 }],
      ['功能码不认识', { slaveId: 1, fc: '99', start: 0, quantity: 1 }],
      ['从站地址越界', { slaveId: 300, fc: '03', start: 0, quantity: 1 }],
      ['05 没给字段', { slaveId: 1, fc: '05', start: 0 }],
      [
        '05 给了两个字段（05 的帧里只有单值）',
        {
          slaveId: 1,
          fc: '05',
          start: 0,
          fields: [
            { index: 1, field: '甲', format: 'bit', value: true },
            { index: 2, field: '乙', format: 'bit', value: false },
          ],
        },
      ],
      [
        '06 的缺省值缺失（用户没填就不能出帧）',
        { slaveId: 1, fc: '06', start: 0, fields: [{ index: 1, field: '值', format: 'uint16' }] },
      ],
      ['0F 没给字段', { slaveId: 1, fc: '0F', start: 0, fields: [] }],
      [
        '10 的字段值是位（格式与值对不上）',
        {
          slaveId: 1,
          fc: '10',
          start: 0,
          fields: [{ index: 1, field: '值', format: 'uint16', value: false }],
        },
      ],
    ];

    for (const [name, request] of incomplete) {
      it(name, () => {
        const result = previewFunctionRequestFrame(request);

        expect(result.ok).toBe(false);
        // 复用既有的那一条文案，界面直接拿它去翻（不新增 key）
        expect(!result.ok && result.messageKey).toBe('命令数据不完整，无法生成请求帧');
      });
    }
  });

  describe('describeFunctionRequestFrame', () => {
    it('读方法：从站 / 功能码 / 起始地址 / 数量 / CRC16', () => {
      const request: ModbusFunctionRequest = { slaveId: 1, fc: '03', start: 1, quantity: 1 };
      const frame = previewFunctionRequestFrame(request);

      const parts = describeFunctionRequestFrame(request, frame.ok ? frame.frame : { bytes: [], hex: '', count: 0 });

      expect(parts.map((p) => p.labelKey)).toEqual([
        '从站地址',
        '功能码',
        '起始地址',
        '数量',
        'CRC16',
      ]);
      expect(parts[3].text).toBe('1');
      // CRC 高字节在后：线上是 D5 CA，值本身是 0xCAD5
      expect(parts[4].hex).toBe('D5 CA');
      expect(parts[4].text).toBe('0xCAD5');
    });

    it('写多线圈：多出「字节数」与逐位解读的一行行', () => {
      const request: ModbusFunctionRequest = {
        slaveId: 1,
        fc: '0F',
        start: 0,
        fields: [
          { index: 1, field: '甲', offset: 0, format: 'bit', value: true },
          { index: 2, field: '乙', offset: 1, format: 'bit', value: false },
        ],
      };
      const frame = previewFunctionRequestFrame(request);
      const parts = describeFunctionRequestFrame(request, frame.ok ? frame.frame : { bytes: [], hex: '', count: 0 });

      expect(parts.map((p) => p.labelKey)).toEqual([
        '从站地址',
        '功能码',
        '起始地址',
        '数量',
        '字节数',
        '线圈数据',
        'CRC16',
      ]);
      expect(parts[5].lines).toEqual(['0=ON', '1=OFF']);
    });

    it('request 缺失 / 定义不成立时给空列表（不给半截解读）', () => {
      expect(describeFunctionRequestFrame(undefined, { bytes: [], hex: '', count: 0 })).toEqual([]);
      expect(
        describeFunctionRequestFrame({ slaveId: 1, fc: '03', start: 0 }, {
          bytes: [],
          hex: '',
          count: 0,
        }),
      ).toEqual([]);
    });
  });
});
