import { ModbusAlarmCodec } from './ModbusAlarmCodec';
import { ModbusServiceFieldAlarmCodec } from './ModbusServiceFieldAlarmCodec';
import { ModbusServiceFieldCodec } from './ModbusServiceFieldCodec';

/**
 * 告警两处编解码的往返与兜底。断言的重点不是「字段抄全了」，而是三条**错了不会报错、
 * 只会悄悄不对**的口径：
 *
 * - 「没配」与「配了但值是 0 / false」必须分得开（`enabled: false`、`threshold: 0`）；
 * - 「未恢复」时的 `recoveredAt` 与空间级查询时的顶层 `serviceId` 都是**键不存在**，
 *   不是 null、也不该被补成 0 / 空串；
 * - 服务端/用户数据（`text` / `field` / `state` / `sample`）原样带过去，一个字符都不动。
 */
describe('ModbusAlarmCodec', () => {
  describe('decodeList', () => {
    it('空间级查询不下发顶层 serviceId 时保持 undefined', () => {
      // 补成空串就与「某个服务、id 是空的」分不开了，页面会拿它去认领归属
      const list = ModbusAlarmCodec.decodeList({ from: 1, to: 2, limit: 3, items: [] });

      expect(list.serviceId).toBeUndefined();
      expect(list.truncated).toBe(false);
    });

    it('限定了服务时带着 serviceId', () => {
      const list = ModbusAlarmCodec.decodeList({ serviceId: 'svc-1', items: [] });

      expect(list.serviceId).toBe('svc-1');
    });

    it('truncated 只认 true，别把缺省当截断', () => {
      expect(ModbusAlarmCodec.decodeList({ truncated: true }).truncated).toBe(true);
      expect(ModbusAlarmCodec.decodeList({}).truncated).toBe(false);
    });

    it('整个 data 缺失也能解出一个空清单', () => {
      // 后端异常返回时不该在页面里炸出一个 TypeError，空清单比崩溃好
      const list = ModbusAlarmCodec.decodeList(undefined);

      expect(list.items).toEqual([]);
      expect(list.summary.total).toBe(0);
      expect(list.summary.byLevel).toEqual([]);
    });
  });

  describe('decode', () => {
    it('未恢复时 recoveredAt 保持 undefined（键不存在就是状态本身）', () => {
      const row = ModbusAlarmCodec.decode({ id: 'a', at: 100 });

      expect(row.recoveredAt).toBeUndefined();
      expect(row.handled).toBe(false);
    });

    it('带上触发那一刻的定义快照与样本，且数据一个字符都不动', () => {
      const row = ModbusAlarmCodec.decode({
        id: 'a',
        serviceId: 'svc-1',
        functionIndex: 2,
        field: '进水温度',
        compare: '>',
        threshold: 80,
        level: 'WARN',
        text: '温度过高',
        unit: '℃',
        at: 100,
        sample: '制冷',
      });

      expect(row.field).toBe('进水温度');
      expect(row.text).toBe('温度过高');
      // 取值表命中的样本是字符串（不是数字）：按类型分支展示时用的就是这个区别
      expect(row.sample).toBe('制冷');
    });

    it('已处理的回执：handled 与处理人', () => {
      const row = ModbusAlarmCodec.decode({
        handled: true,
        handledBy: { id: 'u-1', name: '张三', timestamp: 200 },
      });

      expect(row.handled).toBe(true);
      expect(row.handledBy?.name).toBe('张三');
      expect(row.handledBy?.timestamp).toBe(200);
    });

    it('回执缺失时不编一个空对象出来', () => {
      const row = ModbusAlarmCodec.decode({ handled: false });

      expect(row.handledBy).toBeUndefined();
    });
  });

  describe('decodeSummary', () => {
    it('两个分布各自解出，lastAt 缺失时不下发', () => {
      const summary = ModbusAlarmCodec.decodeSummary({
        total: 3,
        open: 2,
        unhandled: 1,
        byLevel: [
          { level: 'WARN', count: 2, lastAt: 100 },
          { level: 'UNKNOWN', count: 1 },
        ],
        byText: [{ text: '温度过高', count: 3, lastAt: 100 }],
      });

      expect(summary.open).toBe(2);
      expect(summary.unhandled).toBe(1);
      expect(summary.byLevel.map((x) => x.level)).toEqual(['WARN', 'UNKNOWN']);
      expect(summary.byLevel[0].lastAt).toBe(100);
      expect(summary.byLevel[1].lastAt).toBeUndefined();
      expect(summary.byText[0].text).toBe('温度过高');
    });

    it('缺失的两个数组当空数组而不是 undefined', () => {
      const summary = ModbusAlarmCodec.decodeSummary({});

      expect(summary.byLevel).toEqual([]);
      expect(summary.byText).toEqual([]);
    });
  });
});

describe('ModbusServiceFieldAlarmCodec', () => {
  it('往返稳定：解出来再编回去是同一份', () => {
    const raw = {
      id: 'r1',
      enabled: true,
      compare: '>=',
      threshold: 80,
      level: 'CRITICAL',
      text: '温度过高',
    };

    const decoded = ModbusServiceFieldAlarmCodec.decode(raw);

    expect(ModbusServiceFieldAlarmCodec.encode(decoded)).toEqual(raw);
  });

  it('没配就不出键，空对象读作没配', () => {
    // 编辑页取回定义后原样回存：过一趟前端不该把「没配」补成一个空对象写回库里
    expect(ModbusServiceFieldAlarmCodec.decode({})).toBeUndefined();
    expect(ModbusServiceFieldAlarmCodec.decode(null)).toBeUndefined();
    expect(ModbusServiceFieldAlarmCodec.encode(undefined)).toBeUndefined();
  });

  it('enabled: false 与 threshold: 0 都要留住', () => {
    // 二者都是**有值**：写成 `if (x.enabled)` / `if (x.threshold)` 会把它们悄悄丢掉，
    // 而「关掉告警」和「阈值就是 0」都是用户真实会配的东西
    const decoded = ModbusServiceFieldAlarmCodec.decode({
      enabled: false,
      compare: '=',
      threshold: 0,
    });

    expect(decoded?.enabled).toBe(false);
    expect(decoded?.threshold).toBe(0);
    expect(ModbusServiceFieldAlarmCodec.encode(decoded)).toEqual({
      enabled: false,
      compare: '=',
      threshold: 0,
    });
  });

  it('全空的配置编不出一个空对象', () => {
    expect(ModbusServiceFieldAlarmCodec.encode({})).toBeUndefined();
  });

  it('一组的往返：顺序原样保留、id 保真', () => {
    // 声明顺序参与运行期同级并列的裁决（后端取靠后的那条），所以重排是一次真改动 ——
    // codec 只做搬运，不能顺手排序
    const raw = [
      { id: 'a', enabled: true, compare: '<', threshold: 20, level: 'WARN', text: '温度过低' },
      { id: 'b', enabled: true, compare: '>', threshold: 30, level: 'CRITICAL', text: '温度过高' },
    ];

    const decoded = ModbusServiceFieldAlarmCodec.decodeList(raw);

    expect(decoded?.map((rule) => rule.id)).toEqual(['a', 'b']);
    expect(ModbusServiceFieldAlarmCodec.encodeList(decoded)).toEqual(raw);
  });

  it('空数组与「元素全是空壳」都读作没配', () => {
    // 空数组留在库里就是 `alarms: []` 这种噪音，而后端与这里都把它读作「没配」——
    // 两边同一口径，才不会因为过了一趟前端就把服务定义改了形
    expect(ModbusServiceFieldAlarmCodec.decodeList([])).toBeUndefined();
    expect(ModbusServiceFieldAlarmCodec.decodeList([{}, null])).toBeUndefined();
    expect(ModbusServiceFieldAlarmCodec.decodeList(null)).toBeUndefined();
    expect(ModbusServiceFieldAlarmCodec.encodeList([])).toBeUndefined();
    expect(ModbusServiceFieldAlarmCodec.encodeList([{}])).toBeUndefined();
    expect(ModbusServiceFieldAlarmCodec.encodeList(undefined)).toBeUndefined();
  });

  it('组里的空壳丢掉、真配置留下', () => {
    const decoded = ModbusServiceFieldAlarmCodec.decodeList([
      {},
      { id: 'a', enabled: true, level: 'WARN' },
      null,
    ]);

    expect(decoded?.length).toBe(1);
    expect(decoded?.[0].id).toBe('a');
  });
});

describe('字段与位上的告警进出', () => {
  it('没配告警的字段不写出 alarms 键', () => {
    // 服务定义里绝大多数字段都没配告警：不该因为过了一趟前端就在每个字段上多一个空数组
    const o = ModbusServiceFieldCodec.encode(ModbusServiceFieldCodec.decode(fieldJson()));

    expect('alarms' in o).toBe(false);
  });

  it('字段上的一组规则进来又出去', () => {
    // 分级配置就靠这个数组表达：同一个出值上「低于 20 告警 / 超过 30 严重」
    const group = [
      { id: 'a', enabled: true, compare: '<', threshold: 20, level: 'WARN', text: '温度过低' },
      { id: 'b', enabled: true, compare: '>', threshold: 30, level: 'CRITICAL', text: '温度过高' },
    ];

    const o = ModbusServiceFieldCodec.encode(ModbusServiceFieldCodec.decode(fieldJson(group)));

    expect(o.alarms).toEqual(group);
  });

  it('空数组不出 alarms 键', () => {
    const o = ModbusServiceFieldCodec.encode(ModbusServiceFieldCodec.decode(fieldJson([])));

    expect('alarms' in o).toBe(false);
  });

  it('位上的规则组与父字段那组互不干扰', () => {
    // 位是**独立的结果键**（parser 逐位把值写进返回值）：只挂父字段的话「位 = 1 就告警」够不着
    const bitGroup = [
      { id: 'b1', enabled: true, compare: '=', threshold: 1, level: 'INFO', text: '机组运行' },
    ];

    const o = ModbusServiceFieldCodec.encode(
      ModbusServiceFieldCodec.decode(fieldJson(undefined, [{ offset: 0, field: '运行', alarms: bitGroup }])),
    );

    expect('alarms' in o).toBe(false);
    expect(o['bit-list'][0].alarms).toEqual(bitGroup);
  });
});

/** 一个最小可用字段的线上形状（alarms / bit-list 按需加）。 */
function fieldJson(alarms?: any[], bitList?: any[]): any {
  const o: any = { index: 1, field: '进水温度', bytes: 2, format: 'int16', byteOrder: 'ABCD' };
  if (alarms != null) {
    o.alarms = alarms;
  }
  if (bitList != null) {
    o['bit-list'] = bitList;
  }
  return o;
}
