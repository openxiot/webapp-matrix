import { ModbusServiceFunction } from '../../define/modbus/ModbusService';
import { ModbusServiceFieldCodec } from './ModbusServiceFieldCodec';

export class ModbusServiceFunctionCodec {
  static decode(o: any): ModbusServiceFunction {
    const x = new ModbusServiceFunction();

    x.index = o.index;
    x.name = o.name || '';
    x.request = o.request || '';
    if (o.interval != null) {
      x.interval = o.interval;
    }
    if (o.polling != null) {
      x.polling = o.polling;
    }
    x.response = ModbusServiceFieldCodec.decodeArray(o.response);

    return x;
  }

  static encode(x: ModbusServiceFunction): any {
    const o: any = {
      index: x.index,
      name: x.name,
      request: x.request,
      // 写方法的应答是请求回显，没有读值：空数组要照发（后端据此判定写方法）
      response: ModbusServiceFieldCodec.encodeArray(x.response),
    };
    // 没配周期的方法不带这些键：后端也用 null 表达「没配」，不带即缺省
    if (x.interval != null) {
      o.interval = x.interval;
    }
    // 轮询开关只在有周期时发（没周期的 false 与缺省等价，见 ModbusService.polling 注释）
    if (x.polling != null) {
      o.polling = x.polling;
    }
    return o;
  }

  static decodeArray(array: Object): ModbusServiceFunction[] {
    const list: ModbusServiceFunction[] = [];

    if (array instanceof Array) {
      for (const item of array) {
        list.push(ModbusServiceFunctionCodec.decode(item));
      }
    }

    return list;
  }

  static encodeArray(list: ModbusServiceFunction[]): any {
    return list.map((x) => ModbusServiceFunctionCodec.encode(x));
  }
}
