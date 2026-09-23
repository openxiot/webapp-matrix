import { ModbusFunctionResponseFieldAlarm } from '../../define/modbus/ModbusService';

/**
 * 出值的一组告警规则与 JSON 的互转（对应后端 `ModbusFunctionResponseFieldAlarmCodec`）。
 *
 * 守全仓的「null 不出键」：没配的项不写出去，免得往库里写一堆空值；空对象解码成 `undefined`
 * （而不是一个字段全空的实例），**空数组与「元素全是空对象」的数组也解码成 `undefined`**
 * —— 这样父 Codec 才能靠「没有就不出键」把「没配」原样带回去：
 * 编辑页取回定义后原样回存，不该因为过了一趟前端就把服务定义改形，也不该在库里留下
 * 一个 `alarms: []` 或一串空壳规则。
 *
 * 七个字段都是可选的（`compare` 与 `threshold`/`state` 按比较方式互斥），故一律用 `!= null` 判，
 * 不做 `||` 兜底：`enabled: false` 与 `threshold: 0` 都是**有值**。
 */
export class ModbusFunctionResponseFieldAlarmCodec {
  static decode(o: any): ModbusFunctionResponseFieldAlarm | undefined {
    if (o == null) {
      return undefined;
    }
    const x = new ModbusFunctionResponseFieldAlarm();
    let seen = false;

    if (o.id != null) {
      x.id = o.id;
      seen = true;
    }
    if (o.enabled != null) {
      x.enabled = o.enabled;
      seen = true;
    }
    if (o.compare != null) {
      x.compare = o.compare;
      seen = true;
    }
    if (o.threshold != null) {
      x.threshold = o.threshold;
      seen = true;
    }
    if (o.state != null) {
      x.state = o.state;
      seen = true;
    }
    if (o.level != null) {
      x.level = o.level;
      seen = true;
    }
    if (o.text != null) {
      x.text = o.text;
      seen = true;
    }

    // 一个键都没有（库里可能存着早期写出来的空对象）⇒ 当作没配，而不是留一个空壳
    return seen ? x : undefined;
  }

  static encode(x: ModbusFunctionResponseFieldAlarm | undefined): any {
    if (x == null) {
      return undefined;
    }
    const o: any = {};

    if (x.id != null && x.id !== '') {
      o.id = x.id;
    }
    if (x.enabled != null) {
      o.enabled = x.enabled;
    }
    if (x.compare != null && x.compare !== '') {
      o.compare = x.compare;
    }
    if (x.threshold != null) {
      o.threshold = x.threshold;
    }
    if (x.state != null && x.state !== '') {
      o.state = x.state;
    }
    if (x.level != null && x.level !== '') {
      o.level = x.level;
    }
    if (x.text != null && x.text !== '') {
      o.text = x.text;
    }

    // 一个键都没写出去 ⇒ 当没配（与 decode 对称：不让一个空对象在库里来回传）
    return Object.keys(o).length > 0 ? o : undefined;
  }

  /**
   * 一组规则。**空数组与「元素全是空对象」都读作 `undefined`**（= 没配），与
   * {@link decode} 同一条口径，于是父 Codec 那一句「非空才出键」把 `[]` 也原样消掉。
   */
  static decodeList(a: any): ModbusFunctionResponseFieldAlarm[] | undefined {
    if (!Array.isArray(a) || a.length === 0) {
      return undefined;
    }
    const list: ModbusFunctionResponseFieldAlarm[] = [];
    for (const item of a) {
      const alarm = ModbusFunctionResponseFieldAlarmCodec.decode(item);
      if (alarm != null) {
        list.push(alarm);
      }
    }
    return list.length > 0 ? list : undefined;
  }

  /**
   * 一组规则。**顺序原样保留**：声明顺序参与同级并列的裁决（后端取靠后的那条），
   * 所以重排是一次真改动，不能在这里顺手排序。
   */
  static encodeList(list: ModbusFunctionResponseFieldAlarm[] | undefined): any {
    if (list == null || list.length === 0) {
      return undefined;
    }
    const arr: any[] = [];
    for (const alarm of list) {
      const o = ModbusFunctionResponseFieldAlarmCodec.encode(alarm);
      if (o != null) {
        arr.push(o);
      }
    }
    return arr.length > 0 ? arr : undefined;
  }
}
