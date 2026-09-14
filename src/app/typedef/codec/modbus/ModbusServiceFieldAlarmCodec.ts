import { ModbusServiceFieldAlarm } from '../../define/modbus/ModbusService';

/**
 * 出值的告警配置与 JSON 的互转（对应后端 `ModbusServiceFieldAlarmCodec`）。
 *
 * 守全仓的「null 不出键」：没配的项不写出去，免得往库里写一堆空值；空对象解码成 `undefined`
 * （而不是一个字段全空的实例），这样父 Codec 才能靠「没有就不出键」把「没配」原样带回去 ——
 * 编辑页取回定义后原样回存，不该因为过了一趟前端就把服务定义改形。
 *
 * 六个字段都是可选的（`compare` 与 `threshold`/`state` 按比较方式互斥），故一律用 `!= null` 判，
 * 不做 `||` 兜底：`enabled: false` 与 `threshold: 0` 都是**有值**。
 */
export class ModbusServiceFieldAlarmCodec {
  static decode(o: any): ModbusServiceFieldAlarm | undefined {
    if (o == null) {
      return undefined;
    }
    const x = new ModbusServiceFieldAlarm();
    let seen = false;

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

  static encode(x: ModbusServiceFieldAlarm | undefined): any {
    if (x == null) {
      return undefined;
    }
    const o: any = {};

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
}
