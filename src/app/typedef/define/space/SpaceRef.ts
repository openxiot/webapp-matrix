/**
 * 空间引用：只记 id 不记整个 {@link SpaceEntity}。
 *
 * 空间会改名、移动，引用方不该跟着烂掉；由写方从 SpaceEntity 现取现填。
 * 与后端 `cc.openxiot.matrix.db.space.SpaceOn` 对齐：设备实体（DeviceEntity.space）与
 * Modbus 服务（ModbusServiceDevice.space）共用同一个形状。
 */
export class SpaceRef {
  spaceId: string = '';
  rootId: string = '';
}
