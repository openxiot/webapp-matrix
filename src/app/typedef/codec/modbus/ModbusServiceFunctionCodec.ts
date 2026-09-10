import { ModbusServiceFunction } from '../../define/modbus/ModbusService';
import { ModbusServiceFieldCodec } from './ModbusServiceFieldCodec';

export class ModbusServiceFunctionCodec {
  static decode(o: any): ModbusServiceFunction {
    const x = new ModbusServiceFunction();

    x.index = o.index;
    x.name = o.name || '';
    x.request = o.request || '';
    x.response = ModbusServiceFieldCodec.decodeArray(o.response);

    return x;
  }

  static encode(x: ModbusServiceFunction): any {
    return {
      index: x.index,
      name: x.name,
      request: x.request,
      // 写方法的应答是请求回显，没有读值：空数组要照发（后端据此判定写方法）
      response: ModbusServiceFieldCodec.encodeArray(x.response),
    };
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
