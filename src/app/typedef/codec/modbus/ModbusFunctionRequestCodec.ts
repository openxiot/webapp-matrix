import { ModbusFunctionRequest } from '../../define/modbus/ModbusService';
import { ModbusFunctionRequestFieldCodec } from './ModbusFunctionRequestFieldCodec';

/**
 * 请求帧定义与 JSON 的互转。
 *
 * 值为 null 就不出键；`fields` 为空也不出键（库里不留 `fields: []` 这种噪音 —— 读方法本来
 * 就没有写字段）。decode 对空数组给一个空列表，再编回去那个键就没了，与后端 Codec 同口径。
 */
export class ModbusFunctionRequestCodec {
  static decode(o: any): ModbusFunctionRequest {
    const x = new ModbusFunctionRequest();

    x.slaveId = o.slaveId;
    x.fc = o.fc || '';
    x.start = o.start;
    if (o.quantity != null) {
      x.quantity = o.quantity;
    }
    x.fields = ModbusFunctionRequestFieldCodec.decodeArray(o.fields);

    return x;
  }

  static encode(x: ModbusFunctionRequest): any {
    const o: any = {
      slaveId: x.slaveId,
      fc: x.fc,
      start: x.start,
    };
    // 读给 quantity、写给 fields，两者互斥（见 ModbusFunctionRequest 注释）
    if (x.quantity != null) {
      o.quantity = x.quantity;
    }
    if (x.fields != null && x.fields.length > 0) {
      o.fields = ModbusFunctionRequestFieldCodec.encodeArray(x.fields);
    }
    return o;
  }
}
