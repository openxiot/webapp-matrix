import { DeviceEntity } from '../device/DeviceEntity';
import { ModelAnchor } from '../model/ModelAnchor';
import { SpaceAccess } from './SpaceAccess';

export class SpaceEntity {
  id: string = '';
  tenantId: string = '';
  name: string = '';
  type: string = '';
  typeAlias: string = '';
  parentId: string = '';
  level: number = 0;
  ancestors: string[] = [];
  sortOrder: number = 0;
  children: SpaceEntity[] = [];
  devices: DeviceEntity[] = [];
  accesses: SpaceAccess[] = [];
  /** 这个空间在 3D 模型里的位置。为空 = 没标注过。 */
  anchor: ModelAnchor | null = null;
  createTime: string = '';
  updateTime: string = '';
}
