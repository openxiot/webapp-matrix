import { DeviceEntity, DeviceSpaceRef } from '../../define/device/DeviceEntity';

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

    if (o.space) {
      x.space.spaceId = o.space.spaceId || '';
      x.space.rootId = o.space.rootId || '';
    }

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
      space: {
        spaceId: x.space.spaceId,
        rootId: x.space.rootId,
      } as DeviceSpaceRef,
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
