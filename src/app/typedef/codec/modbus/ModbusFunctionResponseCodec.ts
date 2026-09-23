import { ModbusFunctionResponse } from '../../define/modbus/ModbusService';
import { ModbusFunctionResponseFieldCodec } from './ModbusFunctionResponseFieldCodec';

/**
 * 应答定义与 JSON 的互转。
 *
 * `fields` 为空不出键（库里不留 `fields: []`）；再往上一层由 {@link ModbusFunctionCodec} 把关：
 * 连整个 `response` 都没有字段时那个键也不出，写方法因此是「整段没有应答定义」。
 */
export class ModbusFunctionResponseCodec {
  static decode(o: any): ModbusFunctionResponse {
    const x = new ModbusFunctionResponse();

    x.fields = ModbusFunctionResponseFieldCodec.decodeArray(o.fields);

    return x;
  }

  static encode(x: ModbusFunctionResponse): any {
    const o: any = {};
    if (x.fields != null && x.fields.length > 0) {
      o.fields = ModbusFunctionResponseFieldCodec.encodeArray(x.fields);
    }
    return o;
  }
}
