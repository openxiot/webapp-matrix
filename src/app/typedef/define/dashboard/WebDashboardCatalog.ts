/**
 * 看板编辑器要的候选清单（`GET /matrix/v1/dashboard/web/catalog/{spaceId}`）。
 *
 * 存在这个接口的理由只有一个：**编辑器要的是实体本身的形状** ——
 * 服务卡的三级级联要 `functions[].response.fields[]` 里的 `format` / `unit` / `valueList` / `bitList`，
 * 设备卡要设备型号。这些前端在别处都拿不到（服务清单页那份是按设备查的，设备列表页那份
 * 只有自己那一层），没有它就只能让用户手抄 id。
 *
 * 两份清单的**口径与归属校验逐字一致**（后端按根空间的子树取，见 `WebDashboardCatalogService`）：
 * 不一致的表现是最难查的那种 ——「编辑器里选得到，保存报『不属于本空间』」。
 *
 * 它是**编辑时的一次性取数**（进编辑态取一次），不是每次刷新都拉的，所以整份下发、不做投影裁剪。
 */

import { DeviceEntity } from '../device/DeviceEntity';
import { ModbusService } from '../modbus/ModbusService';

/**
 * 候选设备。
 *
 * **没有 `name`**：`DeviceEntity` 上就没有名字，全仓库的设备显示名都在前端按一条四级回退链解析
 * （产品名称 → 设备实例描述 → URN 的 type 段 → `did`，见 `DeviceDisplayService`）。
 * 服务端要给出这个名字，就得回调产品服务、把同一条链再实现一遍 —— 两处各解一次，迟早解出两个名字。
 * 所以这里只给**解析得出名字所必需的输入**。
 */
export class WebDashboardCatalogDevice {
  /** 设备 ID（后端 `_id`） */
  did: string = '';
  /** DeviceType URN：查产品规格的键，也是回退链的第三级 */
  type: string = '';
  /** 在线状态。**恒给** —— `false` 与「没有这个字段」不是一回事 */
  online: boolean = false;
}

/** 本项目的候选设备与服务 */
export class WebDashboardCatalog {
  devices: WebDashboardCatalogDevice[] = [];
  /** 完整的服务定义（与 `/modbus/service` 的下发形状逐字相同，故直接复用 `ModbusService`） */
  services: ModbusService[] = [];
}

/**
 * 候选设备 → {@link DeviceEntity}（`DeviceDisplayService` 那条四级回退链认的是后者）。
 *
 * **两处调用方**（编辑器填设备下拉、看板页算磁贴摘要），所以这份映射提到这里：
 * 两处各写一遍，将来那条链多读一个字段时就只会改到一处 —— 表现是「对话框里叫得出名字、
 * 磁贴上叫不出」这种要盯一会儿才发现的差别。
 *
 * `did` 为空的条目丢掉（`WebDashboardCatalogDevice` 里它是主键，空的不该出现在任何下拉里）。
 * **`online` 故意不拷**：清单是进编辑态时取一次的，到对话框打开时那个状态可能已经过期 ——
 * 拷进来只会诱人拿它当实时状态用。
 */
export function catalogDevices(catalog: WebDashboardCatalog | null): DeviceEntity[] {
  return (catalog?.devices ?? [])
    .filter((device) => !!device.did)
    .map((device) => Object.assign(new DeviceEntity(), { did: device.did, type: device.type }));
}
