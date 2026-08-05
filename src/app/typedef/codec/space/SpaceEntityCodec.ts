import { SpaceEntity } from '../../define/space/SpaceEntity';
import { DeviceEntityCodec } from '../device/DeviceEntityCodec';

export class SpaceEntityCodec {
  static decode(o: any): SpaceEntity {
    const x = new SpaceEntity();

    x.id = o.id || '';
    x.tenantId = o.tenantId || '';
    x.name = o.name || '';
    x.type = o.type || '';
    x.typeAlias = o.typeAlias || '';
    x.parentId = o.parentId || '';
    x.rootId = o.rootId || '';
    x.level = o.level || 0;
    x.ancestors = o.ancestors || [];
    x.sortOrder = o.sortOrder || 0;
    x.children = SpaceEntityCodec.decodeArray(o.children);
    x.devices = DeviceEntityCodec.decodeArray(o.devices);
    x.createTime = o.createTime || '';
    x.updateTime = o.updateTime || '';

    return x;
  }

  static encode(x: SpaceEntity): any {
    return {
      id: x.id,
      tenantId: x.tenantId,
      name: x.name,
      type: x.type,
      typeAlias: x.typeAlias,
      parentId: x.parentId,
      rootId: x.rootId,
      level: x.level,
      ancestors: x.ancestors,
      sortOrder: x.sortOrder,
      children: SpaceEntityCodec.encodeArray(x.children),
      devices: DeviceEntityCodec.encodeArray(x.devices),
      createTime: x.createTime,
      updateTime: x.updateTime,
    };
  }

  static decodeArray(array: Object): SpaceEntity[] {
    const list: SpaceEntity[] = [];

    if (array instanceof Array) {
      for (const item of array) {
        list.push(SpaceEntityCodec.decode(item));
      }
    }

    return list;
  }

  static encodeArray(list: SpaceEntity[]): any {
    return list.map((x) => SpaceEntityCodec.encode(x));
  }
}
