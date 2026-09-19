import { WebDashboardCatalogDevice, WebDashboardCatalog } from '../../define/dashboard/WebDashboardCatalog';
import { ModbusServiceCodec } from '../modbus/ModbusServiceCodec';

/**
 * 候选清单与 JSON 的互转。**只解不编**：编辑器只读它，改写它的是服务定义页那边的事。
 *
 * 服务那一半**整个委派给 {@link ModbusServiceCodec}**，不另写一份：后端下发时也复用了同一个
 * `ModbusServiceCodec`（见 `WebDashboardCatalogCodec` 的说明），两边因此逐字对齐 ——
 * 服务定义将来多一个字段，这里不用跟。
 */
export class WebDashboardCatalogCodec {
  static decode(o: any): WebDashboardCatalog {
    const x = new WebDashboardCatalog();
    x.devices = WebDashboardCatalogCodec.decodeDevices(o?.devices);
    x.services = ModbusServiceCodec.decodeArray(o?.services);
    return x;
  }

  /**
   * 设备逐项校验。
   *
   * **没有 `did` 的一行整行丢掉**：设备卡存的正是 `did`，一行没有 id 的候选选中了也存不下去
   * —— 留在下拉里等于给用户一个必然失败的选项。
   */
  static decodeDevices(rows: any): WebDashboardCatalogDevice[] {
    if (!Array.isArray(rows)) {
      return [];
    }
    const devices: WebDashboardCatalogDevice[] = [];
    for (const row of rows) {
      if (typeof row !== 'object' || row === null) {
        continue;
      }
      const did = (row as any).did;
      if (typeof did !== 'string' || did.length === 0) {
        continue;
      }
      const device = new WebDashboardCatalogDevice();
      device.did = did;
      device.type = typeof (row as any).type === 'string' ? (row as any).type : '';
      // 缺 `online` 按离线：这个值只用来在清单里标一下，缺了就说不出「在线」
      device.online = (row as any).online === true;
      devices.push(device);
    }
    return devices;
  }
}
