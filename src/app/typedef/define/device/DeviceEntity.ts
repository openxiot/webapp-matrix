export class DeviceSpaceRef {
  spaceId: string = '';
  rootId: string = '';
}

export class DeviceEntity {
  did: string = '';
  type: string = '';
  online: boolean = false;
  protocol: string = '';
  lastOnline: string = '';
  lastOffline: string = '';
  space: DeviceSpaceRef = new DeviceSpaceRef();
}
