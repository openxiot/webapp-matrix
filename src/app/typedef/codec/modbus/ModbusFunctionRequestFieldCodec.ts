import { ModbusFunctionRequestField } from '../../define/modbus/ModbusService';

/**
 * 写入字段定义与 JSON 的互转。
 *
 * 可选项（offset / byteOrder / value）只在有值时输出 —— 编辑页把取回的定义原样回存，
 * 缺省项不该被补成空值写回库里（与应答字段 Codec 同一条口径）。
 * `value` 的判定必须用 `!= null`：`false`（位 = 关）与 `0` 都是有效缺省值。
 */
export class ModbusFunctionRequestFieldCodec {
  static decode(o: any): ModbusFunctionRequestField {
    const x = new ModbusFunctionRequestField();

    x.index = o.index;
    x.field = o.field || '';
    if (o.offset != null) {
      x.offset = o.offset;
    }
    x.format = o.format || '';
    if (o.byteOrder != null) {
      x.byteOrder = o.byteOrder;
    }
    if (o.value != null) {
      x.value = o.value;
    }

    return x;
  }

  static encode(x: ModbusFunctionRequestField): any {
    const o: any = {
      index: x.index,
      field: x.field,
      format: x.format,
    };
    if (x.offset != null) {
      o.offset = x.offset;
    }
    if (x.byteOrder != null && x.byteOrder !== '') {
      o.byteOrder = x.byteOrder;
    }
    if (x.value != null) {
      o.value = x.value;
    }
    return o;
  }

  static decodeArray(array: Object): ModbusFunctionRequestField[] {
    const list: ModbusFunctionRequestField[] = [];

    if (array instanceof Array) {
      for (const item of array) {
        list.push(ModbusFunctionRequestFieldCodec.decode(item));
      }
    }

    return list;
  }

  static encodeArray(list: ModbusFunctionRequestField[]): any {
    return list.map((x) => ModbusFunctionRequestFieldCodec.encode(x));
  }
}
