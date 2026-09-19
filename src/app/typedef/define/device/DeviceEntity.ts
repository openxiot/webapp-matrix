import { ModelAnchor } from '../model/ModelAnchor';
import { SpaceRef } from '../space/SpaceRef';

export class DeviceEntity {
  did: string = '';
  type: string = '';
  online: boolean = false;
  protocol: string = '';
  /** 父设备 did（空 = 顶层设备）。子设备从属关系用它在列表里缩进挂到父设备下。 */
  parentId: string = '';
  /** 根设备 did（整棵设备树的祖先根）。 */
  rootId: string = '';
  lastOnline: string = '';
  lastOffline: string = '';
  /** 设备所在的空间（与 Modbus 服务的 SpaceRef 同一个类，见 define/space/SpaceRef） */
  space: SpaceRef = new SpaceRef();
  /**
   * 这台设备在 3D 模型里的位置。为空时落到 `space` 那个空间的锚点上
   * （回退链见 pages/main/project/3d/anchor/project.3d.anchor.ts）。
   */
  anchor: ModelAnchor | null = null;
}
