import { ModbusServiceFieldBit } from '../../define/modbus/ModbusService';

/**
 * 位区字段里的具名位（01/02）与 JSON 的互转：`{offset, field}` —— 偏移 0 基、从位区起点算起，
 * field 是这一位在 invoke 返回值里的 key（取值 0/1）。
 */
export class ModbusServiceFieldBitCodec {
  static decode(o: any): ModbusServiceFieldBit {
    const x = new ModbusServiceFieldBit();

    x.offset = o.offset;
    x.field = o.field || '';

    return x;
  }

  static encode(x: ModbusServiceFieldBit): any {
    return {
      offset: x.offset,
      field: x.field,
    };
  }

  static decodeArray(array: Object): ModbusServiceFieldBit[] {
    const list: ModbusServiceFieldBit[] = [];

    if (array instanceof Array) {
      for (const item of array) {
        list.push(ModbusServiceFieldBitCodec.decode(item));
      }
    }

    return list;
  }

  static encodeArray(list: ModbusServiceFieldBit[]): any {
    return list.map((x) => ModbusServiceFieldBitCodec.encode(x));
  }
}
