import { ModbusCommand, ModbusConfig } from '@app/typedef/define/modbus/Modbus';
import {
  ModbusFunctionRequest,
  ModbusFunctionResponseField,
  ModbusFunctionResponseFieldAlarm,
  ModbusFunction,
} from '@app/typedef/define/modbus/ModbusService';
import {
  MAX_ALARM_RULES,
  alarmCompareOptions,
  alarmCount,
  alarmItems,
  alarmKey,
  alarmLevelOptions,
  alarmOperatorsOf,
  alarmSignature,
  alarmStateOptions,
  alarmTargetKind,
  alarmUsesState,
  buildServiceFunctions,
  defaultAlarm,
  definedAlarmCount,
  describeFieldShape,
  describeFieldType,
  describeFunctionRequest,
  describeServiceField,
  functionFcOf,
  isReadFunction,
  pollSignature,
  primaryAlarm,
  serviceChanged,
  withAlarmAdded,
  withAlarmMoved,
  withAlarmPatched,
  withAlarmRemoved,
  withAlarmsOf,
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
      expect(alarmItems(writeFunction())).toEqual([]);
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
      const group: ModbusFunctionResponseFieldAlarm[] = [
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
      const group: ModbusFunctionResponseFieldAlarm[] = [
        { enabled: true, level: 'WARN', text: '先声明的' },
        { enabled: true, level: 'WARN', text: '后声明的' },
      ];

      expect(primaryAlarm(group)?.text).toBe('后声明的');
    });

    it('级别不认识（含缺省）的按最低算', () => {
      const group: ModbusFunctionResponseFieldAlarm[] = [
        { enabled: true, text: '没填级别' },
        { enabled: true, level: 'BOGUS', text: '级别不认识' },
        { enabled: true, level: 'INFO', text: '提示' },
      ];

      expect(primaryAlarm(group)?.text).toBe('提示');
    });
  });

  describe('alarmSignature', () => {
    const config: ModbusFunctionResponseFieldAlarm = {
      id: 'r1',
      enabled: true,
      compare: '>',
      threshold: 80,
      level: 'WARN',
      text: '温度过高',
    };
    const higher: ModbusFunctionResponseFieldAlarm = {
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
      // 展开行里那一组的组头用它：下面紧挨着就是告警控件，缀一遍「→ 温度过高(>80)」
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

  describe('describeFieldShape', () => {
    it('不带字段名：组头左边已经写着出值名了，不必让名字再当描述的第一个词', () => {
      const f = field({ bitList: [{ offset: 0, field: '运行' }] });

      expect(describeFieldShape(f)).toBe('uint16/2B ABCD ℃ 位: 运行@0');
      expect(describeFieldShape(f)).not.toContain('进水温度');
      // describeFieldType 就是「名字 + 这个」
      expect(describeFieldType(f)).toBe(`进水温度 ${describeFieldShape(f)}`);
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

  describe('withAlarmAdded / withAlarmPatched / withAlarmRemoved', () => {
    const key = 'c#1#进水温度';

    it('加一条返回新表：原表一个字节没动（调用方是信号更新）', () => {
      const base = new Map<string, ModbusFunctionResponseFieldAlarm[]>();
      const added = withAlarmAdded(base, key, 'numeric', '进水温度');

      expect(base.size).toBe(0);
      // id 是新生成的，只比形态：起步配置就是 defaultAlarm 那一份
      expect(added.get(key)).toEqual([
        { ...defaultAlarm('numeric', '进水温度'), id: expect.any(String) },
      ]);
    });

    it('到上限就原样返回 —— 按钮禁了是给人看的，数据自己也不该越界', () => {
      let map = new Map<string, ModbusFunctionResponseFieldAlarm[]>();
      for (let i = 0; i < MAX_ALARM_RULES + 3; i++) {
        map = withAlarmAdded(map, key, 'bit', '运行');
      }

      expect(map.get(key)).toHaveLength(MAX_ALARM_RULES);
      expect(withAlarmAdded(map, key, 'bit', '运行').get(key)).toHaveLength(MAX_ALARM_RULES);
    });

    it('改一条按对象身份定位，不拿下标：前一条原样留着，改的是点名的那条', () => {
      const first = defaultAlarm('numeric', '甲');
      const second = defaultAlarm('numeric', '乙');
      const map = new Map([[key, [first, second]]]);

      const patched = withAlarmPatched(map, key, second, { threshold: 30 });

      expect(patched.get(key)![0]).toBe(first);
      expect(patched.get(key)![1]).toMatchObject({ id: second.id, threshold: 30 });
      // 表里没有这条规则时什么都不做：既不该抛，更不该顺手改到别人头上
      expect(withAlarmPatched(map, key, defaultAlarm('numeric', '丙'), { threshold: 1 })).toEqual(
        map,
      );
    });

    it('删一条：组里还有别人就留着，且不动别的组', () => {
      const other = 'c#1#机组状态';
      const a = defaultAlarm('numeric', '甲');
      const b = defaultAlarm('bit', '运行');
      const map = new Map([
        [key, [a, b]],
        [other, [defaultAlarm('state', '制冷')]],
      ]);

      const removed = withAlarmRemoved(map, key, a);

      expect(removed.get(key)).toEqual([b]);
      expect(removed.get(other)).toHaveLength(1);
    });

    it('删到一条不剩时把 key 也去掉（留个空数组会被写进服务定义当噪音）', () => {
      const only = defaultAlarm('numeric', '甲');

      expect(withAlarmRemoved(new Map([[key, [only]]]), key, only).has(key)).toBe(false);
      expect(withAlarmRemoved(new Map(), key, only).has(key)).toBe(false);
    });

    it('拖动换位：顺序真的变了（同级并列时后端取靠后的那条，顺序不是排给人看的）', () => {
      const a = defaultAlarm('numeric', '甲');
      const b = defaultAlarm('numeric', '乙');
      const c = defaultAlarm('numeric', '丙');
      const map = new Map([
        [key, [a, b, c]],
        ['c#1#机组状态', [defaultAlarm('state', '制冷')]],
      ]);

      // 把第 0 条拖到末尾，与 cdk 的 previousIndex / currentIndex 同一口径
      const moved = withAlarmMoved(map, key, 0, 2);

      expect(moved.get(key)).toEqual([b, c, a]);
      expect(map.get(key)).toEqual([a, b, c]); // 原表没动
      expect(moved.get('c#1#机组状态')).toEqual(map.get('c#1#机组状态')); // 别的组不受影响
      // 换个位置就是一次真改动
      expect(alarmSignature(moved)).not.toBe(alarmSignature(map));
    });

    it('拖回原位 / 越界的下标都原样返回（宁可不动，也不能把整组规则弄丢）', () => {
      const a = defaultAlarm('numeric', '甲');
      const b = defaultAlarm('numeric', '乙');
      const map = new Map([[key, [a, b]]]);

      for (const [from, to] of [
        [1, 1],
        [-1, 0],
        [0, -1],
        [2, 0],
        [0, 2],
      ]) {
        expect(withAlarmMoved(map, key, from, to)).toEqual(map);
      }
    });
  });

  describe('alarmCount', () => {
    it('一个方法的全部出值加起来：位单独算一份，停用的也算', () => {
      const func = functionWith([
        field({
          bitList: [
            { offset: 0, field: '运行' },
            { offset: 1, field: '故障' },
          ],
        }),
      ]);
      const alarms = new Map([
        // 父字段两条（一条停用）
        [alarmKey('c', 1, '进水温度'), [{ enabled: true }, { enabled: false }]],
        // 位是独立的结果键，自己那份另算
        [alarmKey('c', 1, '运行'), [{ enabled: true }]],
      ]);

      expect(alarmCount(func, 'c', alarms)).toBe(3);
      // 换点表 ID 就一个都不认（key 带着点表 ID）
      expect(alarmCount(func, 'other', alarms)).toBe(0);
    });

    it('写方法没有出值，恒为 0', () => {
      const alarms = new Map([[alarmKey('c', 1, '写方法（应答为请求回显，无返回字段）'), [{}]]]);

      expect(alarmCount(writeFunction(), 'c', alarms)).toBe(0);
    });
  });

  describe('definedAlarmCount', () => {
    it('数的是定义本身：位单独算一份，停用的也算', () => {
      const func = functionWith([
        field({
          alarms: [{ enabled: true }, { enabled: false }],
          bitList: [
            { offset: 0, field: '运行', alarms: [{ enabled: true }] },
            { offset: 1, field: '故障' },
          ],
        }),
      ]);

      expect(definedAlarmCount(func)).toBe(3);
    });

    it('没配过 / 写方法：一个都没有，恒为 0', () => {
      expect(definedAlarmCount(functionWith([field()]))).toBe(0);
      expect(definedAlarmCount(writeFunction())).toBe(0);
    });
  });

  describe('withAlarmsOf', () => {
    it('按出值名并进字段与位，组内顺序原样带出去，原方法不动', () => {
      const func = functionWith([field({ bitList: [{ offset: 0, field: '运行' }] })]);
      const hot = { enabled: true, threshold: 30 };
      const warm = { enabled: true, threshold: 26 };
      const saved = withAlarmsOf(
        func,
        new Map([
          ['进水温度', [hot]],
          ['运行', [warm, hot]],
        ]),
      );

      expect(saved.response!.fields[0].alarms).toEqual([hot]);
      expect(saved.response!.fields[0].bitList![0].alarms).toEqual([warm, hot]);
      // 交出的是新对象：页面上的原定义一个字没动
      expect(func.response!.fields[0].alarms).toBeUndefined();
      expect(saved.response!.fields[0]).not.toBe(func.response!.fields[0]);
    });

    it('没配的出值不出 alarms 键，别的属性一个不少', () => {
      const func = functionWith([field({ bitList: [{ offset: 0, field: '运行' }] })]);
      const saved = withAlarmsOf(func, new Map([['运行', []]]));

      expect(saved.response!.fields[0].alarms).toBeUndefined();
      expect(saved.response!.fields[0].bitList![0].alarms).toBeUndefined();
      expect(saved.response!.fields[0].field).toBe('进水温度');
      expect(saved.response!.fields[0].bitList![0].field).toBe('运行');
    });

    it('写方法没有应答定义：照跑不误，且**不凭空造出 response 键**', () => {
      // 给写方法生出 response 会被后端当成「读方法」校验（写方法的应答是请求回显，没有读值）
      expect(withAlarmsOf(writeFunction(), new Map([['进水温度', [{}]]])).response).toBeUndefined();
    });
  });

  describe('告警那几个下拉的选项', () => {
    const t = (key: string) => `[[${key}]]`;

    it('比较方式：文案 + 符号，符号与定义里存的值逐字对齐', () => {
      const options = alarmCompareOptions({ key: '进水温度', field: field(), kind: 'numeric' }, t);

      expect(options.map((o) => o.value)).toEqual(['>', '>=', '<', '<=', '=']);
      expect(options[0].label.endsWith(' >')).toBe(true);
    });

    it('带取值表的字段只给 =（后端把状态与阈值做成互斥的）', () => {
      const item = {
        key: '机组状态',
        field: field({ valueList: [{ value: 1, description: '制冷' }] }),
        kind: 'state' as const,
      };

      expect(alarmCompareOptions(item, t).map((o) => o.value)).toEqual(['=']);
    });

    it('级别：顺序即由轻到重（与运行期「只留最严重的一条」同一个次序）', () => {
      expect(alarmLevelOptions(t).map((o) => o.value)).toEqual(['INFO', 'WARN', 'CRITICAL']);
    });

    it('取值表描述原样给出、一个字不翻（后端逐字比对这个串）', () => {
      const f = field({
        valueList: [
          { value: 1, description: '制冷' },
          { value: 2, description: '制热' },
        ],
      });

      expect(alarmStateOptions(f)).toEqual([
        { value: '制冷', label: '制冷' },
        { value: '制热', label: '制热' },
      ]);
      expect(alarmStateOptions(f)[0].label).not.toContain('[[');
    });
  });

  describe('buildServiceFunctions：点表动作 → 结构化 request', () => {
    /** 一条点表（从站地址 4）：commands 由各用例给 */
    function config(commands: ModbusCommand[]): ModbusConfig {
      return { slave: { manufacturer: '特灵', model: '19XRV', slaveId: 4 }, commands };
    }

    it('读寄存器：quantity 是**帧里的字面值**（值的个数 × 类型跨度）', () => {
      // 点表说「读 2 个 int32」= 帧里读 4 个寄存器；服务里直接写 4 —— 应答字段各带自己的 format，
      // 请求侧无从按一个 dataType 换算，后端对账认的是这个口径
      const { functions, skipped } = buildServiceFunctions(
        config([{ name: '读温度', fc: '03', index: 1, start: 1, quantity: 2, dataType: 'int32' }]),
      );

      expect(skipped).toEqual([]);
      expect(functions[0].request).toEqual({ slaveId: 4, fc: '03', start: 1, quantity: 4 });
    });

    it('读 string：点表的 quantity 本身就是长度，不再乘', () => {
      const { functions } = buildServiceFunctions(
        config([{ name: '读序列号', fc: '03', index: 1, start: 0, quantity: 8, dataType: 'string' }]),
      );

      expect(functions[0].request.quantity).toBe(8);
    });

    it('读方法只有 quantity，没有 fields（读请求里没有写入字段）', () => {
      const { functions } = buildServiceFunctions(
        config([{ name: '读温度', fc: '03', index: 1, start: 0, quantity: 1, dataType: 'int16' }]),
      );

      expect(functions[0].request).not.toHaveProperty('fields');
    });

    it('05：一个 bit 字段，不填 offset（帧里没有「第几个」）', () => {
      const { functions } = buildServiceFunctions(
        config([{ name: '写开关机', fc: '05', index: 1, start: 2, coilState: 'on' }]),
      );

      expect(functions[0].request.fields).toEqual([
        { index: 1, field: '开关机', format: 'bit', value: true },
      ]);
    });

    it('06：负值走 int16、非负走 uint16（写出的位模式相同，但只有 int16 过得了后端的范围校验）', () => {
      const negative = buildServiceFunctions(
        config([{ name: '写设定', fc: '06', index: 1, start: 0, registerValue: -10 }]),
      );
      const positive = buildServiceFunctions(
        config([{ name: '写设定', fc: '06', index: 1, start: 0, registerValue: 10 }]),
      );

      expect(negative.functions[0].request.fields).toEqual([
        { index: 1, field: '设定', format: 'int16', value: -10 },
      ]);
      expect(positive.functions[0].request.fields).toEqual([
        { index: 1, field: '设定', format: 'uint16', value: 10 },
      ]);
    });

    it('06 的缺省值缺失时字段照出，但**没有 value 键**（后端据此判「每次必给」）', () => {
      const { functions } = buildServiceFunctions(
        config([{ name: '写设定', fc: '06', index: 1, start: 0 }]),
      );

      expect(functions[0].request.fields).toEqual([{ index: 1, field: '设定', format: 'uint16' }]);
    });

    it('0F：一个线圈一个 bit 字段，offset 即行序（帧是紧凑位区、不留空洞）', () => {
      const { functions } = buildServiceFunctions(
        config([
          {
            name: '写阀组',
            fc: '0F',
            index: 1,
            start: 0,
            coils: [{ offset: 0, on: true }, { offset: 1, on: false }, { offset: 2, on: true }],
          },
        ]),
      );

      expect(functions[0].request.fields).toEqual([
        { index: 1, field: '阀组 1', offset: 0, format: 'bit', value: true },
        { index: 2, field: '阀组 2', offset: 1, format: 'bit', value: false },
        { index: 3, field: '阀组 3', offset: 2, format: 'bit', value: true },
      ]);
    });

    it('10：offset 按类型跨度累加（寄存器位次，不是字节位次）', () => {
      const { functions } = buildServiceFunctions(
        config([
          {
            name: '写设定',
            fc: '10',
            index: 1,
            start: 0,
            registers: [
              { dataType: 'uint16', value: 7 },
              { dataType: 'int32', value: -2 },
              { dataType: 'uint16', value: 9 },
            ],
          },
        ]),
      );

      const fields = functions[0].request.fields!;
      expect(fields.map((f) => [f.index, f.offset, f.format])).toEqual([
        [1, 0, 'uint16'],
        [2, 1, 'int32'],
        [3, 3, 'uint16'],
      ]);
      // 4 字节格式跨两个寄存器，字节序必须写明（后端要求，不给就拒）
      expect(fields[1].byteOrder).toBe('ABCD');
      expect(fields[0].byteOrder).toBeUndefined();
    });

    it('10：点表里不认识的数据格式兜回 uint16（后端只收那几种写格式）', () => {
      const { functions } = buildServiceFunctions(
        config([
          {
            name: '写设定',
            fc: '10',
            index: 1,
            start: 0,
            registers: [{ dataType: 'string', value: 0 }],
          },
        ]),
      );

      expect(functions[0].request.fields![0].format).toBe('uint16');
    });

    it('写方法没有 response 键（整个键不出现，不是空对象）', () => {
      const { functions } = buildServiceFunctions(
        config([{ name: '写开关机', fc: '05', index: 1, start: 0, coilState: 'off' }]),
      );

      expect(functions[0].response).toBeUndefined();
    });

    it('数据不完整的动作整条跳过，不进方法列表', () => {
      const { functions, skipped } = buildServiceFunctions(
        config([
          { name: '读温度', fc: '03', index: 1, start: 0, quantity: 1, dataType: 'int16' },
          { name: '写开关机', fc: '05', index: 2, start: 0 },
          { name: '写设定', fc: '06', index: 3, start: 0, registerValue: 1 },
        ]),
      );

      expect(functions.map((f) => f.index)).toEqual([1, 3]);
      expect(skipped).toEqual(['#2 写开关机']);
    });

    it('没有从站地址时整条点表都生不出方法（帧首字节都没有）', () => {
      const { functions, skipped } = buildServiceFunctions({
        slave: { manufacturer: '特灵', model: '19XRV' },
        commands: [{ name: '读温度', fc: '03', index: 1, start: 0, quantity: 1, dataType: 'int16' }],
      });

      expect(functions).toEqual([]);
      expect(skipped).toEqual(['#1 读温度']);
    });
  });

  describe('functionFcOf / isReadFunction：只看 request.fc', () => {
    it('认得出读与写', () => {
      expect(isReadFunction(functionWith([field()]))).toBe(true);
      expect(isReadFunction(writeFunction())).toBe(false);
    });

    it('fc 缺失 / 不是两位 16 进制时按「不是读方法」处理', () => {
      // v1 老数据（request 是 hex 串）走到这里：解不出 fc，当写方法 —— 页面另有迁移横幅拦着
      expect(functionFcOf(undefined)).toBeUndefined();
      expect(functionFcOf({ slaveId: 1, fc: '', start: 0 })).toBeUndefined();
      expect(functionFcOf({ slaveId: 1, fc: '3', start: 0 })).toBeUndefined();
      expect(isReadFunction({ index: 1, name: '读', request: { slaveId: 1, fc: '', start: 0 } })).toBe(
        false,
      );
    });

    it('小写 / 带空白的 fc 归一化后再判', () => {
      expect(functionFcOf({ slaveId: 1, fc: ' 0f ', start: 0 })).toBe('0F');
    });
  });

  describe('describeFunctionRequest', () => {
    const t = (key: string) => `[[${key}]]`;

    it('读方法给数量、写方法给「写入几个字段」（用户真正要填的是后者的项数）', () => {
      expect(describeFunctionRequest(functionWith([field()]), t)).toBe(
        '[[从站地址]] 1 · fc 03 [[读保持寄存器]] · [[起始地址]] 0 · [[数量]] 1',
      );

      const write = writeFunction();
      expect(describeFunctionRequest(write, t)).toContain('[[写入]] 1');
    });

    it('定义不成立（没有 request / 认不出 fc）时给空串，列里显示占位符', () => {
      const bare = Object.assign(new ModbusFunction(), { index: 1, name: '读' });

      expect(describeFunctionRequest(bare, t)).toBe('');
    });
  });
});

/**
 * 一个最小可用的应答字段（默认是可配数值告警的那种） */
function field(patch: Partial<ModbusFunctionResponseField> = {}): ModbusFunctionResponseField {
  return Object.assign(
    new ModbusFunctionResponseField(),
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

/** 读方法的请求定义（v2 起 request 是结构化的；本文件只关心应答字段，请求给个形状即可） */
function readRequest(): ModbusFunctionRequest {
  return { slaveId: 1, fc: '03', start: 0, quantity: 1 };
}

function functionWith(response: ModbusFunctionResponseField[]): ModbusFunction {
  return Object.assign(new ModbusFunction(), {
    index: 1,
    name: '读',
    request: readRequest(),
    response: { fields: response },
  });
}

/** 写方法：**整段没有 response 键**（后端不下发该键，`undefined` 就是「写方法」） */
function writeFunction(): ModbusFunction {
  return Object.assign(new ModbusFunction(), {
    index: 1,
    name: '写',
    request: {
      slaveId: 1,
      fc: '06',
      start: 0,
      fields: [{ index: 1, field: '设定值', format: 'uint16', value: 1 }],
    },
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
