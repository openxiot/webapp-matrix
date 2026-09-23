import { ModbusFunction } from '../../define/modbus/ModbusService';
import { ModbusFunctionRequestCodec } from './ModbusFunctionRequestCodec';
import { ModbusFunctionResponseCodec } from './ModbusFunctionResponseCodec';

export class ModbusFunctionCodec {
  static decode(o: any): ModbusFunction {
    const x = new ModbusFunction();

    x.index = o.index;
    x.name = o.name || '';
    if (o.request != null) {
      x.request = ModbusFunctionRequestCodec.decode(o.request);
    }
    if (o.interval != null) {
      x.interval = o.interval;
    }
    if (o.polling != null) {
      x.polling = o.polling;
    }
    if (o.response != null) {
      x.response = ModbusFunctionResponseCodec.decode(o.response);
    }

    return x;
  }

  static encode(x: ModbusFunction): any {
    const o: any = {
      index: x.index,
      name: x.name,
      request: ModbusFunctionRequestCodec.encode(x.request),
    };
    // 没配周期的方法不带这些键：后端也用 null 表达「没配」，不带即缺省
    if (x.interval != null) {
      o.interval = x.interval;
    }
    // 轮询开关只在有周期时发（没周期的 false 与缺省等价，见 ModbusService.polling 注释）
    if (x.polling != null) {
      o.polling = x.polling;
    }
    // 写方法的应答是请求回显，没有读值：连 response 这个键都不出（后端据此判定写方法）
    if (x.response != null && x.response.fields.length > 0) {
      o.response = ModbusFunctionResponseCodec.encode(x.response);
    }
    return o;
  }

  static decodeArray(array: Object): ModbusFunction[] {
    const list: ModbusFunction[] = [];

    if (array instanceof Array) {
      for (const item of array) {
        list.push(ModbusFunctionCodec.decode(item));
      }
    }

    return list;
  }

  static encodeArray(list: ModbusFunction[]): any {
    return list.map((x) => ModbusFunctionCodec.encode(x));
  }
}
