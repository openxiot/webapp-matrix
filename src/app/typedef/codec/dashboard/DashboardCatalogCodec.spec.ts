import { DashboardCatalogCodec } from './DashboardCatalogCodec';

/**
 * 候选清单的解码。要钉住的是**「这一项能不能被选」与「选完能不能存」是同一件事**：
 * 一行没有 `did` 的设备留在下拉里，用户选它、保存、然后拿到一句「不属于本空间」，
 * 而真正的原因是这个候选本来就不该出现。
 *
 * 服务那一半整个委派给 `ModbusServiceCodec`（两边下发时用的是同一个后端 codec），
 * 所以这里只断言「确实解出来了、而且是完整的服务」—— 字段级的解码归那个 codec 自己的用例。
 */
describe('DashboardCatalogCodec', () => {
  describe('decode 的兜底', () => {
    it('整个 data 缺失也能解出一份空清单（不抛）', () => {
      const catalog = DashboardCatalogCodec.decode(undefined);

      expect(catalog.devices).toEqual([]);
      expect(catalog.services).toEqual([]);
    });

    it('两份清单缺失 / 不是数组时各给空数组', () => {
      const catalog = DashboardCatalogCodec.decode({ devices: null, services: 'svc' });

      expect(catalog.devices).toEqual([]);
      expect(catalog.services).toEqual([]);
    });
  });

  describe('设备', () => {
    it('did / type 原样带出，online 缺省按离线', () => {
      const catalog = DashboardCatalogCodec.decode({
        devices: [{ did: 'd1', type: 'tr_aaa', online: true }, { did: 'd2', type: 'tr_bbb' }],
      });

      expect(catalog.devices.map((device) => device.did)).toEqual(['d1', 'd2']);
      expect(catalog.devices[0].online).toBe(true);
      // 说不出「在线」时按离线：这个值只用来在清单里标一下，猜一个在线更糟
      expect(catalog.devices[1].online).toBe(false);
    });

    it('没有 did 的一行整行丢掉（选中了也存不下去）', () => {
      const catalog = DashboardCatalogCodec.decode({
        devices: [{ type: 'tr_aaa' }, { did: '', type: 'tr_bbb' }, { did: 'd3' }, null, 'd4'],
      });

      expect(catalog.devices.map((device) => device.did)).toEqual(['d3']);
    });

    it('type 不是字符串时给空串（不编一个型号出来）', () => {
      const catalog = DashboardCatalogCodec.decode({ devices: [{ did: 'd1', type: 12 }] });

      expect(catalog.devices[0].type).toBe('');
    });
  });

  describe('服务', () => {
    it('完整的服务定义解出来（含方法里的应答字段：编辑器级联要的就是它）', () => {
      const catalog = DashboardCatalogCodec.decode({
        services: [
          {
            id: 'svc-1',
            name: '1 号冷水机组',
            functions: [
              {
                index: 1,
                name: '读蒸发器进水温度',
                response: [{ index: 1, field: '温度', bytes: 2, format: 'int16', unit: '℃' }],
              },
            ],
          },
        ],
      });

      const service = catalog.services[0];
      expect(service.id).toBe('svc-1');
      // 服务名是**用户填的**，原样带出（不翻译、不做任何加工）
      expect(service.name).toBe('1 号冷水机组');
      expect(service.functions[0].response[0].field).toBe('温度');
      expect(service.functions[0].response[0].unit).toBe('℃');
    });
  });
});
