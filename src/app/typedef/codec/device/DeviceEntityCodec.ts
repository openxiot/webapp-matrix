import { DeviceEntity } from '../../define/device/DeviceEntity';
import { SpaceRefCodec } from '../space/SpaceRefCodec';

export class DeviceEntityCodec {
  static decode(o: any): DeviceEntity {
    const x = new DeviceEntity();

    x.did = o.did || '';
    x.type = o.type || '';
    x.online = !!o.online;
    x.protocol = o.protocol || '';
    x.parentId = o.parentId || '';
    x.rootId = o.rootId || '';
    x.lastOnline = o.lastOnline || '';
    x.lastOffline = o.lastOffline || '';

    x.space = SpaceRefCodec.decode(o.space);

    return x;
  }

  static encode(x: DeviceEntity): any {
    return {
      did: x.did,
      type: x.type,
      online: x.online,
      protocol: x.protocol,
      parentId: x.parentId,
      rootId: x.rootId,
      lastOnline: x.lastOnline,
      lastOffline: x.lastOffline,
      space: SpaceRefCodec.encode(x.space),
    };
  }

  static decodeArray(array: Object): DeviceEntity[] {
    const list: DeviceEntity[] = [];

    if (array instanceof Array) {
      for (const item of array) {
        list.push(DeviceEntityCodec.decode(item));
      }
    }

    return list;
  }

  static encodeArray(list: DeviceEntity[]): any {
    return list.map((x) => DeviceEntityCodec.encode(x));
  }
}
