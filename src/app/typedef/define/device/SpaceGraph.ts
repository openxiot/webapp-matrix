import { SpaceEntity } from '../space/SpaceEntity';
import { DeviceEntity } from './DeviceEntity';
import { GenericService } from '../service/GenericService';

/**
 * 空间图（GET /matrix/v1/space/graph/{rootId}）：根空间下全部子孙空间 + 设备 + 服务。
 *
 * 三者都是扁平的：空间树由前端按 parentId 搭（见 project.component 的 buildTree），
 * services 里每项带 did / spaceId，用来把服务挂到对应设备 / 空间下。
 */
export class SpaceGraph {
  spaces: SpaceEntity[] = [];
  devices: DeviceEntity[] = [];
  /** 该根空间下的全部服务（精简视图，见 GenericService） */
  services: GenericService[] = [];
}
