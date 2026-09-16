import { ModbusAlarm } from '../../../typedef/define/modbus/ModbusAlarm';
import { GenericService } from '../../../typedef/define/service/GenericService';
import { SpaceEntity } from '../../../typedef/define/space/SpaceEntity';
import { type AlarmCard, alarmTone, buildAlarmCards } from './home3d.alarm';

/**
 * 左侧告警框的内容。
 *
 * 这些字段错了也**不会报错，只是显示成另一个样子**，所以用例盯的是三处最容易走偏的：
 *
 * 1. **级别 → 色调**。没见过的枚举名（后端加了新级别）和压根没有 `level` 的老数据
 *    都不能退化成「看起来像正常」，得落到中性的 `unknown`。
 * 2. **空间归属的两级回退**。服务被删掉之后不能整格空白 —— 那会让「在哪儿出事了」
 *    这句话丢掉一半。
 * 3. **没有 id 就不给「处理」按钮**。告警页那颗按钮在这种情况下点了是个静默的空操作。
 */

/** 翻译直通：断言里读到的就是键本身，省得对着译文猜 */
const T = (key: string): string => key;

function alarm(fields: Partial<ModbusAlarm> = {}): ModbusAlarm {
  const a = new ModbusAlarm();
  a.id = 'a1';
  a.serviceId = 's1';
  a.field = 'temperature';
  a.level = 'WARN';
  a.text = '温度过高';
  a.compare = '>';
  a.threshold = 80;
  a.unit = '℃';
  a.at = 1_700_000_000_000;
  return Object.assign(a, fields);
}

function service(id: string, name: string, spaceId: string): GenericService {
  const s = new GenericService();
  s.id = id;
  s.name = name;
  s.spaceId = spaceId;
  return s;
}

function space(id: string, name: string): SpaceEntity {
  const s = new SpaceEntity();
  s.id = id;
  s.name = name;
  return s;
}

function serviceMap(...services: GenericService[]): Map<string, GenericService> {
  return new Map(services.map((s) => [s.id, s]));
}

function spaceMap(...spaces: SpaceEntity[]): Map<string, SpaceEntity> {
  return new Map(spaces.map((s) => [s.id, s]));
}

function build(
  alarms: ModbusAlarm[],
  services: GenericService[] = [service('s1', '温度服务', 'sp1')],
  spaces: SpaceEntity[] = [space('sp1', 'A栋')],
): AlarmCard[] {
  return buildAlarmCards(alarms, serviceMap(...services), spaceMap(...spaces), T);
}

describe('alarmTone', () => {
  it('三个已知级别各给一个色调', () => {
    expect(alarmTone('INFO')).toBe('info');
    expect(alarmTone('WARN')).toBe('warn');
    expect(alarmTone('CRITICAL')).toBe('critical');
  });

  it('没见过的级别名落到 unknown，不冒充正常', () => {
    expect(alarmTone('PANIC')).toBe('unknown');
  });

  it('没有级别（老数据）也落到 unknown', () => {
    expect(alarmTone(undefined)).toBe('unknown');
    expect(alarmTone(null)).toBe('unknown');
    expect(alarmTone('')).toBe('unknown');
  });
});

describe('buildAlarmCards', () => {
  it('级别枚举名原样留在 level 上、文案走翻译', () => {
    const [card] = build([alarm({ level: 'CRITICAL' })]);
    expect(card.level).toBe('CRITICAL');
    expect(card.levelLabel).toBe('严重');
    expect(card.tone).toBe('critical');
  });

  it('空间归属：服务 → 服务所在空间的名字', () => {
    const [card] = build([alarm()]);
    expect(card.where).toBe('A栋 · temperature');
  });

  it('服务已经不在空间图里 → 退回 serviceId，但字段名还在', () => {
    const [card] = build([alarm()], []);
    expect(card.where).toBe('s1 · temperature');
  });

  it('空间也查不到 → 退回服务名，仍然是「在哪儿 · 什么字段」两段', () => {
    const [card] = build([alarm()], [service('s1', '温度服务', 'sp-missing')], []);
    expect(card.where).toBe('温度服务 · temperature');
  });

  it('服务、空间、serviceId 全都取不到时，where 里仍有字段名', () => {
    const [card] = build([alarm({ serviceId: undefined })], [], []);
    expect(card.where).toBe('temperature');
  });

  it('触发条件走 modbusAlarmCondition（比较方式 + 阈值 + 单位）', () => {
    const [card] = build([alarm()]);
    expect(card.condition).toBe('超过 80℃');
  });

  it('text 为空时退回触发条件，不留一条没有标题的框', () => {
    const [card] = build([alarm({ text: undefined })]);
    expect(card.text).toBe('超过 80℃');
  });

  it('text 与触发条件都没有时退回字段名', () => {
    const [card] = build([alarm({ text: undefined, compare: undefined, threshold: undefined })]);
    expect(card.text).toBe('temperature');
  });

  it('没有 id → canHandle 为 false，id 是空串', () => {
    const [card] = build([alarm({ id: undefined })]);
    expect(card.id).toBe('');
    expect(card.canHandle).toBe(false);
  });

  it('有 id → canHandle 为 true', () => {
    const [card] = build([alarm()]);
    expect(card.canHandle).toBe(true);
  });

  it('recoveredAt 有值就是已恢复', () => {
    expect(build([alarm()])[0].recovered).toBe(false);
    expect(build([alarm({ recoveredAt: 1_700_000_100_000 })])[0].recovered).toBe(true);
  });

  it('时刻原样透传（造格式化交给模板的 date 管道）', () => {
    expect(build([alarm()])[0].at).toBe(1_700_000_000_000);
  });

  it('顺序与入参一致，不重排', () => {
    const cards = build([
      alarm({ id: 'a', at: 3 }),
      alarm({ id: 'b', at: 2 }),
      alarm({ id: 'c', at: 1 }),
    ]);
    expect(cards.map((card) => card.id)).toEqual(['a', 'b', 'c']);
  });

  it('空输入 → 空输出', () => {
    expect(build([])).toEqual([]);
  });

  /**
   * 点完「处理」那一张要当场消失。它**不是**展示层记了一笔，而是数据里那一条的
   * `handled` 被换成了 true（`applyHandledAlarm`），这里据此不画 —— 所以切语言、
   * 重算 computed 都不会把它放回来。
   */
  it('已处理的不出框', () => {
    const cards = build([alarm({ id: 'a' }), alarm({ id: 'b', handled: true })]);
    expect(cards.map((card) => card.id)).toEqual(['a']);
  });

  it('handled 缺省 / false 都出框（后端只筛了 handled:false，缺省那半是我们自己兜的）', () => {
    const cards = build([alarm({ id: 'a', handled: undefined }), alarm({ id: 'b', handled: false })]);
    expect(cards.map((card) => card.id)).toEqual(['a', 'b']);
  });
});
