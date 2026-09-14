import {
  ModbusServiceField,
  ModbusServiceFieldAlarm,
  ModbusServiceFunction,
} from '../../../../../typedef/define/modbus/ModbusService';
import {
  alarmItems,
  alarmKey,
  alarmOperatorsOf,
  alarmSignature,
  alarmTargetKind,
  alarmUsesState,
  defaultAlarm,
  describeFieldType,
  describeServiceField,
  pollSignature,
  primaryAlarm,
  serviceChanged,
  type ServiceBaseline,
} from './service.functions';

/**
 * 服务编辑器侧表的纯函数（`polls` 那套的口径早就有了，这里只补告警那一套）。
 *
 * 断言的重点不是「值抄对了」，而是三件**错了不会报错、只会悄悄不对**的事：
 *
 * - **只改告警也要让保存按钮亮**：`ServiceBaseline` 少收一个 `alarms` 快照，
 *   用户配完告警点保存会被静默丢掉；
 * - **快照要认得出改动、又不该被无关的顺序惊动**（先改哪一行、对象里键的先后）——
 *   但**组内规则的顺序要惊动它**：那个顺序参与运行期的同级裁决，重排是真改动；
 * - **摘要与出值清单要说得准**：没启用告警的字段不该出现 `→`，位要单独占一行
 *   （后端逐位把 0/1 写进返回值，位上的告警跟父字段不是一回事），
 *   一个出值配了一组时只缀**级别最高**的那条。
 */
describe('service.functions', () => {
  describe('alarmTargetKind / alarmOperatorsOf', () => {
    it('数值字段五种比较都能选', () => {
      expect(alarmTargetKind(field())).toBe('numeric');
      expect(alarmOperatorsOf('numeric')).toEqual(['>', '>=', '<', '<=', '=']);
    });

    it('带取值表的字段只能比状态', () => {
      const f = field({ valueList: [{ value: 1, description: '制冷' }] });

      expect(alarmTargetKind(f)).toBe('state');
      expect(alarmOperatorsOf('state')).toEqual(['=']);
    });

    it('位只能比 0/1', () => {
      const f = field({ bitList: [{ offset: 0, field: '运行' }] });

      expect(alarmTargetKind(f, f.bitList![0])).toBe('bit');
      expect(alarmOperatorsOf('bit')).toEqual(['=']);
    });

    it('string 字段一个比较方式都不给', () => {
      // 后端直接拒：文本值与 > < 无从谈起，放过去就是每次采集都静默失效
      expect(alarmTargetKind(field({ format: 'string' }))).toBe('none');
      expect(alarmOperatorsOf('none')).toEqual([]);
    });

    it('取值表 + = 才比状态，其余一律比数值', () => {
      expect(alarmUsesState('state', '=')).toBe(true);
      expect(alarmUsesState('state', '>')).toBe(false);
      expect(alarmUsesState('numeric', '=')).toBe(false);
      expect(alarmUsesState('bit', '=')).toBe(false);
    });
  });

  describe('alarmItems', () => {
    it('位跟在父字段后面各占一行，且是独立的结果键', () => {
      const func = functionWith([
        field({
          field: '机组状态',
          bitList: [
            { offset: 0, field: '运行' },
            { offset: 1, field: '故障' },
          ],
        }),
      ]);

      expect(alarmItems(func).map((x) => [x.key, x.kind])).toEqual([
        ['机组状态', 'numeric'],
        ['运行', 'bit'],
        ['故障', 'bit'],
      ]);
    });

    it('写方法（没有应答字段）一个出值都没有', () => {
      expect(alarmItems({ index: 1, name: '写', request: '', response: [] })).toEqual([]);
    });
  });

  describe('defaultAlarm', () => {
    it('数值给 > 起步、不给阈值；位给 = 1', () => {
      // 数值阈值没有合理缺省：猜一个 0 会立刻置起一条告警，不如让后端明确拒掉空值
      const numeric = defaultAlarm('numeric', '进水温度');
      expect(numeric).toEqual({
        id: expect.any(String),
        enabled: true,
        compare: '>',
        level: 'WARN',
        text: '进水温度',
      });
      expect(defaultAlarm('bit', '运行')).toEqual({
        id: expect.any(String),
        enabled: true,
        compare: '=',
        threshold: 1,
        level: 'WARN',
        text: '运行',
      });
    });

    it('一出生就带自己的 id，且各不相同', () => {
      // 身份不能等事后补：没有 id 的规则既没法与「哪条规则正开着」比对，界面上也无从定位
      const a = defaultAlarm('numeric', '进水温度');
      const b = defaultAlarm('numeric', '进水温度');

      expect(a.id).toBeTruthy();
      expect(a.id).not.toBe(b.id);
      // 后端上限 64：生成式是「时间戳 + 6 位随机」的 36 进制，长度约 15
      expect(a.id?.length).toBeLessThanOrEqual(64);
    });
  });

  describe('primaryAlarm', () => {
    it('一组里取级别最高的那条（摘要口径）', () => {
      const group: ModbusServiceFieldAlarm[] = [
        { enabled: true, level: 'WARN', text: '偏热' },
        { enabled: true, level: 'CRITICAL', text: '过热' },
        { enabled: true, level: 'INFO', text: '略高' },
      ];

      expect(primaryAlarm(group)?.text).toBe('过热');
    });

    it('停用的不参与、全停用就没有', () => {
      expect(
        primaryAlarm([
          { enabled: false, level: 'CRITICAL', text: '过热' },
          { enabled: true, level: 'INFO', text: '略高' },
        ])?.text,
      ).toBe('略高');
      expect(primaryAlarm([{ enabled: false, level: 'CRITICAL' }])).toBeUndefined();
      expect(primaryAlarm([])).toBeUndefined();
      expect(primaryAlarm(undefined)).toBeUndefined();
    });

    it('同级并列取声明顺序靠后的那条（与后端一致）', () => {
      const group: ModbusServiceFieldAlarm[] = [
        { enabled: true, level: 'WARN', text: '先声明的' },
        { enabled: true, level: 'WARN', text: '后声明的' },
      ];

      expect(primaryAlarm(group)?.text).toBe('后声明的');
    });

    it('级别不认识（含缺省）的按最低算', () => {
      const group: ModbusServiceFieldAlarm[] = [
        { enabled: true, text: '没填级别' },
        { enabled: true, level: 'BOGUS', text: '级别不认识' },
        { enabled: true, level: 'INFO', text: '提示' },
      ];

      expect(primaryAlarm(group)?.text).toBe('提示');
    });
  });

  describe('alarmSignature', () => {
    const config: ModbusServiceFieldAlarm = {
      id: 'r1',
      enabled: true,
      compare: '>',
      threshold: 80,
      level: 'WARN',
      text: '温度过高',
    };
    const higher: ModbusServiceFieldAlarm = {
      id: 'r2',
      enabled: true,
      compare: '>',
      threshold: 100,
      level: 'CRITICAL',
      text: '严重过高',
    };

    it('插入顺序不影响快照', () => {
      const a = new Map([
        ['c#1#甲', [config]],
        ['c#1#乙', [config]],
      ]);
      const b = new Map([
        ['c#1#乙', [config]],
        ['c#1#甲', [config]],
      ]);

      expect(alarmSignature(a)).toBe(alarmSignature(b));
    });

    it('改动任何一项都能比出来', () => {
      const base = new Map([['c#1#甲', [config]]]);

      for (const patch of [
        { enabled: false },
        { compare: '>=' },
        { threshold: 60 },
        { state: '制冷' },
        { level: 'CRITICAL' },
        { text: '太热了' },
      ]) {
        const changed = new Map([['c#1#甲', [{ ...config, ...patch }]]]);
        expect(alarmSignature(changed)).not.toBe(alarmSignature(base));
      }
    });

    it('阈值 0 与「没填」分得开', () => {
      // 写成 `alarm.threshold ?? null` 是对的；写成 `|| null` 会把 0 说成没填
      const zero = new Map([['c#1#甲', [{ enabled: true, threshold: 0 }]]]);
      const missing = new Map([['c#1#甲', [{ enabled: true }]]]);

      expect(alarmSignature(zero)).not.toBe(alarmSignature(missing));
    });

    it('加一条、删一条都算改过', () => {
      const base = new Map([['c#1#甲', [config]]]);

      expect(alarmSignature(new Map([['c#1#甲', [config, higher]]]))).not.toBe(
        alarmSignature(base),
      );
      expect(alarmSignature(new Map([['c#1#甲', []]]))).not.toBe(alarmSignature(base));
    });

    it('组内顺序变了就是改过', () => {
      // 声明顺序参与同级并列的裁决（后端取靠后的那条），所以重排是一次**真**改动：
      // 快照要是把它当成「没变」，用户重排完保存按钮不亮，配好的顺序就白改了
      const a = new Map([['c#1#甲', [config, higher]]]);
      const b = new Map([['c#1#甲', [higher, config]]]);

      expect(alarmSignature(a)).not.toBe(alarmSignature(b));
    });
  });

  describe('alarmKey', () => {
    it('带上点表 ID：换点表不会把告警套到同名同序号的出值上', () => {
      expect(alarmKey('cfg-a', 2, '进水温度')).toBe('cfg-a#2#进水温度');
      expect(alarmKey(null, 2, '进水温度')).not.toBe(alarmKey('cfg-b', 2, '进水温度'));
    });
  });

  describe('describeServiceField', () => {
    it('没启用告警就不多说一个字', () => {
      const text = describeServiceField(field({ alarms: [{ compare: '>', threshold: 80 }] }));

      expect(text).toBe('进水温度 uint16/2B ABCD ℃');
    });

    it('启用后缀上文本与条件（符号，不进词典）', () => {
      const text = describeServiceField(
        field({ alarms: [{ enabled: true, compare: '>', threshold: 80, text: '温度过高' }] }),
      );

      expect(text).toBe('进水温度 uint16/2B ABCD ℃ → 温度过高(>80)');
    });

    it('一组规则只缀级别最高的那条', () => {
      // 与运行期「同时只留最严重的一条」同口径：摘要该说的是**此刻最要紧**的那句，
      // 完整的一组展开就见（故也不缀条数）
      const text = describeServiceField(
        field({
          alarms: [
            { enabled: true, compare: '<', threshold: 20, level: 'INFO', text: '温度偏低' },
            { enabled: true, compare: '>', threshold: 30, level: 'CRITICAL', text: '温度过高' },
            { enabled: true, compare: '>', threshold: 26, level: 'WARN', text: '温度偏高' },
          ],
        }),
      );

      expect(text).toBe('进水温度 uint16/2B ABCD ℃ → 温度过高(>30)');
      expect(text).not.toContain('温度偏低');
    });

    it('位上的告警也进摘要（各取各自那组的头一条）', () => {
      const text = describeServiceField(
        field({
          alarms: [{ enabled: true, compare: '>', threshold: 80, text: '温度过高' }],
          bitList: [
            {
              offset: 0,
              field: '运行',
              alarms: [{ enabled: true, compare: '=', threshold: 1, text: '机组运行' }],
            },
            { offset: 1, field: '故障' },
          ],
        }),
      );

      expect(text).toContain('位: 运行@0 故障@1');
      expect(text).toContain('→ 温度过高(>80)');
      expect(text).toContain('→ 机组运行(=1)');
    });

    it('比状态时不缀单位', () => {
      const text = describeServiceField(
        field({ alarms: [{ enabled: true, compare: '=', state: '制冷', text: '转制冷了' }] }),
      );

      expect(text).toContain('→ 转制冷了(=制冷)');
    });
  });

  describe('describeFieldType', () => {
    it('只讲类型，不提告警', () => {
      // 展开行的「类型」列用它：右边紧挨着就是告警控件，缀一遍「→ 温度过高(>80)」
      // 是同一句话说两遍，而且会随用户敲字实时变
      const f = field({
        alarms: [{ enabled: true, compare: '>', threshold: 80, text: '温度过高' }],
        bitList: [{ offset: 0, field: '运行', alarms: [{ enabled: true, text: '机组运行' }] }],
      });

      const text = describeFieldType(f);

      expect(text).toBe('进水温度 uint16/2B ABCD ℃ 位: 运行@0');
      expect(text).not.toContain('→');
    });

    it('与 describeServiceField 只差告警那一段', () => {
      const f = field({ alarms: [{ enabled: true, compare: '>', threshold: 80, text: '温度过高' }] });

      expect(describeServiceField(f)).toBe(`${describeFieldType(f)} → 温度过高(>80)`);
    });
  });

  describe('serviceChanged', () => {
    const base = baseline();

    it('只改了告警也要算改过（否则保存按钮不亮，配好的东西被静默丢掉）', () => {
      const alarms = new Map([['c#1#进水温度', [{ enabled: true, compare: '>', threshold: 80 }]]]);
      const current = { ...base, alarms: alarmSignature(alarms) };

      expect(serviceChanged(base, current)).toBe(true);
    });

    it('只改了轮询也要算改过', () => {
      const polls = new Map([['c#1', { interval: 30, polling: true }]]);
      expect(serviceChanged(base, { ...base, polls: pollSignature(polls) })).toBe(true);
    });

    it('什么都没改就是没改', () => {
      expect(serviceChanged(base, { ...base })).toBe(false);
    });
  });
});

/** 一个最小可用的应答字段（默认是可配数值告警的那种） */
function field(patch: Partial<ModbusServiceField> = {}): ModbusServiceField {
  return Object.assign(
    new ModbusServiceField(),
    {
      index: 1,
      field: '进水温度',
      bytes: 2,
      format: 'uint16',
      byteOrder: 'ABCD',
      unit: '℃',
    },
    patch,
  );
}

function functionWith(response: ModbusServiceField[]): ModbusServiceFunction {
  return Object.assign(new ModbusServiceFunction(), {
    index: 1,
    name: '读',
    request: '',
    response,
  });
}

function baseline(): ServiceBaseline {
  return {
    name: '1 号机组',
    siid: 1,
    aiid: 1,
    configId: 'c',
    polls: '[]',
    alarms: '[]',
  };
}
