import { ModbusFunctionResponseFieldBit } from '../../define/modbus/ModbusService';
import { ModbusFunctionResponseFieldAlarmCodec } from './ModbusFunctionResponseFieldAlarmCodec';

/**
 * 位区字段里的具名位（01/02）与 JSON 的互转：`{offset, field, alarms?}` —— 偏移 0 基、从位区起点算起，
 * field 是这一位在 invoke 返回值里的 key（取值 0/1）。
 *
 * `alarms` 与父字段那份是**两处独立配置**（位比的是自己的 0/1），同样守「没配就不出键」。
 */
export class ModbusFunctionResponseFieldBitCodec {
  static decode(o: any): ModbusFunctionResponseFieldBit {
    const x = new ModbusFunctionResponseFieldBit();

    x.offset = o.offset;
    x.field = o.field || '';
    // 空数组与「元素全是空壳」都读作「没配」，与父 Codec 同口径
    x.alarms = ModbusFunctionResponseFieldAlarmCodec.decodeList(o.alarms);

    return x;
  }

  static encode(x: ModbusFunctionResponseFieldBit): any {
    const o: any = {
      offset: x.offset,
      field: x.field,
    };
    const alarms = ModbusFunctionResponseFieldAlarmCodec.encodeList(x.alarms);
    if (alarms != null) {
      o.alarms = alarms;
    }
    return o;
  }

  static decodeArray(array: Object): ModbusFunctionResponseFieldBit[] {
    const list: ModbusFunctionResponseFieldBit[] = [];

    if (array instanceof Array) {
      for (const item of array) {
        list.push(ModbusFunctionResponseFieldBitCodec.decode(item));
      }
    }

    return list;
  }

  static encodeArray(list: ModbusFunctionResponseFieldBit[]): any {
    return list.map((x) => ModbusFunctionResponseFieldBitCodec.encode(x));
  }
}
