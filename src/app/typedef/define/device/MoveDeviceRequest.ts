/** 批量调整设备落点（PUT /matrix/v1/device/many/space）。根空间由服务端从 spaceId 现算，请求体里不带。 */
export class MoveDeviceRequest {
  spaceId: string = '';
  dids: string[] = [];
}
