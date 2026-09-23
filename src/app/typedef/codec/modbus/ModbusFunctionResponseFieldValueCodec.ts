import { ModbusFunctionResponseFieldValue } from '../../define/modbus/ModbusService';

export class ModbusFunctionResponseFieldValueCodec {
  static decode(o: any): ModbusFunctionResponseFieldValue {
    const x = new ModbusFunctionResponseFieldValue();

    x.value = o.value;
    x.description = o.description || '';

    return x;
  }

  static encode(x: ModbusFunctionResponseFieldValue): any {
    return {
      value: x.value,
      description: x.description,
    };
  }

  static decodeArray(array: Object): ModbusFunctionResponseFieldValue[] {
    const list: ModbusFunctionResponseFieldValue[] = [];

    if (array instanceof Array) {
      for (const item of array) {
        list.push(ModbusFunctionResponseFieldValueCodec.decode(item));
      }
    }

    return list;
  }

  static encodeArray(list: ModbusFunctionResponseFieldValue[]): any {
    return list.map((x) => ModbusFunctionResponseFieldValueCodec.encode(x));
  }
}
