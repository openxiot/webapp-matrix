import { ModbusServiceField } from '../../define/modbus/ModbusService';
import { ModbusServiceFieldBitCodec } from './ModbusServiceFieldBitCodec';
import { ModbusServiceFieldValueCodec } from './ModbusServiceFieldValueCodec';

/**
 * 应答字段解析规则与 JSON 的互转。
 *
 * 可选项（byteOrder / scale / unit / value-list / bit-list）只在有值时输出：编辑页把取回的定义原样回存，
 * 缺省项不该被补成空值写回库里。带连字符的 `value-list` / `bit-list` 对应实体的 valueList / bitList。
 */
export class ModbusServiceFieldCodec {
  static decode(o: any): ModbusServiceField {
    const x = new ModbusServiceField();

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
      x.valueList = ModbusServiceFieldValueCodec.decodeArray(o['value-list']);
    }
    if (o['bit-list'] != null) {
      x.bitList = ModbusServiceFieldBitCodec.decodeArray(o['bit-list']);
    }

    return x;
  }

  static encode(x: ModbusServiceField): any {
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
      o['value-list'] = ModbusServiceFieldValueCodec.encodeArray(x.valueList);
    }
    if (x.bitList != null && x.bitList.length > 0) {
      o['bit-list'] = ModbusServiceFieldBitCodec.encodeArray(x.bitList);
    }
    return o;
  }

  static decodeArray(array: Object): ModbusServiceField[] {
    const list: ModbusServiceField[] = [];

    if (array instanceof Array) {
      for (const item of array) {
        list.push(ModbusServiceFieldCodec.decode(item));
      }
    }

    return list;
  }

  static encodeArray(list: ModbusServiceField[]): any {
    return list.map((x) => ModbusServiceFieldCodec.encode(x));
  }
}
