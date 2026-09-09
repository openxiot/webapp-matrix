export class DeviceSpaceRef {
  spaceId: string = '';
  rootId: string = '';
}

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
  space: DeviceSpaceRef = new DeviceSpaceRef();
}
