import { DeviceEntity } from '../device/DeviceEntity';
import { SpaceAccess } from './SpaceAccess';

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
  accesses: SpaceAccess[] = [];
  createTime: string = '';
  updateTime: string = '';
}
