import { ModbusServiceFieldValue } from '../../define/modbus/ModbusService';

export class ModbusServiceFieldValueCodec {
  static decode(o: any): ModbusServiceFieldValue {
    const x = new ModbusServiceFieldValue();

    x.value = o.value;
    x.description = o.description || '';

    return x;
  }

  static encode(x: ModbusServiceFieldValue): any {
    return {
      value: x.value,
      description: x.description,
    };
  }

  static decodeArray(array: Object): ModbusServiceFieldValue[] {
    const list: ModbusServiceFieldValue[] = [];

    if (array instanceof Array) {
      for (const item of array) {
        list.push(ModbusServiceFieldValueCodec.decode(item));
      }
    }

    return list;
  }

  static encodeArray(list: ModbusServiceFieldValue[]): any {
    return list.map((x) => ModbusServiceFieldValueCodec.encode(x));
  }
}
