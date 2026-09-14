import { ModbusAlarm, ModbusAlarmList, applyHandledAlarm } from './ModbusAlarm';

/**
 * 「处理」之后就地替换那一行的纯函数。
 *
 * 断言的重点是两件**错了不会报错、只会悄悄不对**的事：
 *
 * - **未处理计数只能减一次**：后端把「已经处理过了」也当成功返回（两个窗口同时开着时后点的那个），
 *   照着「一次处理减一」写，重复点几下与点一条本来就处理过的行都会让数字越减越小；
 * - **只动会变的那一格**：处理不翻级别、也不改告警文本，两份分布若跟着重算或清空，
 *   汇总卡上的分布就会与表格里的行对不上（而那正是它存在的意义）。
 */
describe('applyHandledAlarm', () => {
  it('替掉那一行，其余行与顺序都不动', () => {
    const list = alarmList([alarm('a'), alarm('b'), alarm('c')]);
    const updated = { ...alarm('b'), handled: true, handledBy: { id: 'u1', name: '张三' } };

    const next = applyHandledAlarm(list, updated);

    expect(next.items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(next.items[1]).toEqual(updated);
    // 原来那个对象不该被就地改掉（信号里存的还是它，改了会绕过变更检测）
    expect(list.items[1].handled).toBeUndefined();
  });

  it('未处理计数减一，级别与文本分布原样留着', () => {
    const list = alarmList([alarm('a'), alarm('b')]);
    list.summary.unhandled = 2;
    list.summary.byLevel = [{ level: 'WARN', count: 2 }];
    list.summary.byText = [{ text: '温度过高', count: 2 }];

    const next = applyHandledAlarm(list, { ...alarm('a'), handled: true });

    expect(next.summary.unhandled).toBe(1);
    expect(next.summary.byLevel).toEqual([{ level: 'WARN', count: 2 }]);
    expect(next.summary.byText).toEqual([{ text: '温度过高', count: 2 }]);
  });

  it('本来就已经处理过的，再点一次不再减', () => {
    const list = alarmList([{ ...alarm('a'), handled: true }]);
    list.summary.unhandled = 0;

    const next = applyHandledAlarm(list, { ...alarm('a'), handled: true });

    expect(next.summary.unhandled).toBe(0);
  });

  it('减不到负数：计数与行对不上时不越界', () => {
    // 汇总与行理论上同源，但脏数据（或将来后端改了汇总口径）不该让页面显示 -1
    const list = alarmList([alarm('a')]);
    list.summary.unhandled = 0;

    expect(applyHandledAlarm(list, { ...alarm('a'), handled: true }).summary.unhandled).toBe(0);
  });

  it('清单里没有这一条（刚被别的筛选换掉）时原样返回', () => {
    const list = alarmList([alarm('a')]);
    list.summary.unhandled = 1;

    const next = applyHandledAlarm(list, { ...alarm('z'), handled: true });

    expect(next.items).toEqual(list.items);
    expect(next.summary.unhandled).toBe(1);
  });
});

function alarm(id: string): ModbusAlarm {
  return Object.assign(new ModbusAlarm(), { id, field: `${id} 号`, at: 1 });
}

function alarmList(items: ModbusAlarm[]): ModbusAlarmList {
  return Object.assign(new ModbusAlarmList(), { items, summary: { total: items.length } });
}
