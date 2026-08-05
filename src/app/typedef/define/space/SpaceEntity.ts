import { DeviceEntity } from '../device/DeviceEntity';

export class SpaceEntity {
  id: string = '';
  tenantId: string = '';
  name: string = '';
  type: string = '';
  typeAlias: string = '';
  parentId: string = '';
  rootId: string = '';
  level: number = 0;
  ancestors: string[] = [];
  sortOrder: number = 0;
  children: SpaceEntity[] = [];
  devices: DeviceEntity[] = [];
  createTime: string = '';
  updateTime: string = '';
}
