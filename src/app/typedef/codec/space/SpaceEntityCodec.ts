import { SpaceEntity } from '../../define/space/SpaceEntity';
import { SpaceAccess } from '../../define/space/SpaceAccess';
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
    x.level = o.level || 0;
    x.ancestors = o.ancestors || [];
    x.sortOrder = o.sortOrder || 0;
    x.children = SpaceEntityCodec.decodeArray(o.children);
    x.devices = DeviceEntityCodec.decodeArray(o.devices);
    x.accesses = SpaceEntityCodec.decodeAccesses(o.accesses);
    x.createTime = o.createTime || '';
    x.updateTime = o.updateTime || '';

    return x;
  }

  static encode(x: SpaceEntity): any {
    return {
      // id: x.id,
      tenantId: x.tenantId,
      name: x.name,
      type: x.type,
      typeAlias: x.typeAlias,
      parentId: x.parentId,
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

  static decodeAccesses(array: Object): SpaceAccess[] {
    const list: SpaceAccess[] = [];

    if (array instanceof Array) {
      for (const item of array) {
        const a = new SpaceAccess();
        a.id = item.id || '';
        a.type = item.type || '';
        a.role = item.role || '';
        a.name = item.name || '';
        a.remark = item.remark || '';
        list.push(a);
      }
    }

    return list;
  }
}
