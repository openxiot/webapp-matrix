/**
 * 通用服务清单项：空间图 `services` 的元素（后端 ModbusServiceCodec.encodeBrief 的精简视图）。
 *
 * 只有「够列个清单」的五个字段：整份服务定义（functions / response）动辄几十 KB，
 * 空间图里一次要带很多服务，故清单不带定义，详情另按 id 调 ModbusServiceResource 的 `/one/{id}`。
 *
 * - `type` 标明服务种类（当前恒为 `modbus`），供前端把服务与设备混在一张表里渲染；
 * - `did` / `spaceId` 是依赖设备及其落点，用于把服务挂到设备行 / 空间下。
 *
 * 注意：后端精简查询只投影了这几个字段，缺省字段（如 functions）一律是空的，别当完整定义用。
 */
export class GenericService {
  id: string = '';
  name: string = '';
  /** 服务种类，当前恒为 modbus */
  type: string = '';
  /** 依赖设备 did */
  did: string = '';
  /** 依赖设备所在空间 id */
  spaceId: string = '';
}
