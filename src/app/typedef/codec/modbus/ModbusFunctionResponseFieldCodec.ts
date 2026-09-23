import { ModbusFunctionResponseField } from '../../define/modbus/ModbusService';
import { ModbusFunctionResponseFieldAlarmCodec } from './ModbusFunctionResponseFieldAlarmCodec';
import { ModbusFunctionResponseFieldBitCodec } from './ModbusFunctionResponseFieldBitCodec';
import { ModbusFunctionResponseFieldValueCodec } from './ModbusFunctionResponseFieldValueCodec';

/**
 * 应答字段解析规则与 JSON 的互转。
 *
 * 可选项（byteOrder / scale / unit / value-list / bit-list / alarms）只在有值时输出：编辑页把取回的定义原样回存，
 * 缺省项不该被补成空值写回库里。带连字符的 `value-list` / `bit-list` 对应实体的 valueList / bitList。
 */
export class ModbusFunctionResponseFieldCodec {
  static decode(o: any): ModbusFunctionResponseField {
    const x = new ModbusFunctionResponseField();

    x.index = o.index;
    x.field = o.field || '';
    x.bytes = o.bytes;
    x.format = o.format || '';
    if (o.byteOrder != null) {
      x.byteOrder = o.byteOrder;
    }
    if (o.scale != null) {
      x.scale = o.scale;
    }
    if (o.unit != null) {
      x.unit = o.unit;
    }
    if (o['value-list'] != null) {
      x.valueList = ModbusFunctionResponseFieldValueCodec.decodeArray(o['value-list']);
    }
    if (o['bit-list'] != null) {
      x.bitList = ModbusFunctionResponseFieldBitCodec.decodeArray(o['bit-list']);
    }
    // 空数组与「元素全是空壳」都读作「没配」（与后端 decode 同口径），故这里不能写成 else 分支的默认值
    x.alarms = ModbusFunctionResponseFieldAlarmCodec.decodeList(o.alarms);

    return x;
  }

  static encode(x: ModbusFunctionResponseField): any {
    const o: any = {
      index: x.index,
      field: x.field,
      bytes: x.bytes,
      format: x.format,
    };
    if (x.byteOrder != null && x.byteOrder !== '') {
      o.byteOrder = x.byteOrder;
    }
    if (x.scale != null) {
      o.scale = x.scale;
    }
    if (x.unit != null && x.unit !== '') {
      o.unit = x.unit;
    }
    if (x.valueList != null && x.valueList.length > 0) {
      o['value-list'] = ModbusFunctionResponseFieldValueCodec.encodeArray(x.valueList);
    }
    if (x.bitList != null && x.bitList.length > 0) {
      o['bit-list'] = ModbusFunctionResponseFieldBitCodec.encodeArray(x.bitList);
    }
    const alarms = ModbusFunctionResponseFieldAlarmCodec.encodeList(x.alarms);
    if (alarms != null) {
      o.alarms = alarms;
    }
    return o;
  }

  static decodeArray(array: Object): ModbusFunctionResponseField[] {
    const list: ModbusFunctionResponseField[] = [];

    if (array instanceof Array) {
      for (const item of array) {
        list.push(ModbusFunctionResponseFieldCodec.decode(item));
      }
    }

    return list;
  }

  static encodeArray(list: ModbusFunctionResponseField[]): any {
    return list.map((x) => ModbusFunctionResponseFieldCodec.encode(x));
  }
}
