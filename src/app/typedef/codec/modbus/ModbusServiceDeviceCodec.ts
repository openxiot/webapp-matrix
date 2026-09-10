import { ModbusServiceDevice } from '../../define/modbus/ModbusService';
import { SpaceRefCodec } from '../space/SpaceRefCodec';

export class ModbusServiceDeviceCodec {
  static decode(o: any): ModbusServiceDevice {
    const x = new ModbusServiceDevice();

    if (o) {
      x.did = o.did || '';
      x.siid = o.siid ?? 0;
      x.aiid = o.aiid ?? 0;
      x.argument = o.argument ?? 0;
      x.space = SpaceRefCodec.decode(o.space);
    }

    return x;
  }

  static encode(x: ModbusServiceDevice): any {
    const o: any = {
      did: x.did,
      siid: x.siid,
      aiid: x.aiid,
      argument: x.argument,
    };
    // space 不参与校验，缺省时不必写（后端也不据此推断，只是不出现在按空间的清单里）
    if (x.space != null && x.space.spaceId !== '') {
      o.space = SpaceRefCodec.encode(x.space);
    }
    return o;
  }
}
