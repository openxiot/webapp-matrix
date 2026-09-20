import { DeviceProperty } from '@app/service/device.spec.service';
import {
  DeviceData,
  WebDashboardWidgetDataItem,
  deviceData,
} from '@app/typedef/define/dashboard/WebDashboardWidgetData';
import { DeviceLine, deviceLine, deviceState } from './device.state';

/**
 * 设备卡的这一行 `属性名: 值 单位`。
 *
 * 钉的是**三个来源各管哪一段**：名字与单位来自产品规格（查不到各自的退路不同）、值来自读数
 * （`0` 与「没值」分得开）。合成一句话写错的表现是卡片一直在、数字是错的 —— 比空一张卡难查。
 */
describe('device.state', () => {
  const PID = 'did-1.1.1';

  function item(data: Record<string, unknown>, success = true): WebDashboardWidgetDataItem {
    const x = new WebDashboardWidgetDataItem();
    x.id = 'w1';
    x.success = success;
    x.data = data;
    return x;
  }

  /** 从线格式直接读一份数据（连读取函数一起过一遍，两者是一体的） */
  function read(data: Record<string, unknown>, success = true): DeviceData {
    return deviceData(item(data, success));
  }

  function property(name: string, unit: string): DeviceProperty {
    const p = new DeviceProperty();
    p.siid = 1;
    p.piid = 1;
    p.name = name;
    p.unit = unit;
    return p;
  }

  describe('deviceState', () => {
    it('还没取到（item 是 undefined）→ loading，卡片留白', () => {
      expect(deviceState(undefined)).toBe('loading');
    });

    it('取到了 → ok，哪怕这个属性一次都没上报过', () => {
      // 与设备卡的取舍有关：没有「尚未采集」那一态，没读数由那一行的 `-` 说
      expect(deviceState(item({ pid: PID }))).toBe('ok');
    });

    it('这张卡整个失败 → failed（服务端那句话由 note 显示）', () => {
      expect(deviceState(item({}, false))).toBe('failed');
    });
  });

  describe('deviceLine', () => {
    it('正常：名字与单位来自产品规格，值来自读数', () => {
      const line = deviceLine(read({ pid: PID, value: 23.5 }), property('温度', '℃'), {});
      expect(line).toEqual<DeviceLine>({ name: '温度', text: '23.5', unit: '℃' });
    });

    it('0 是有效读数（不是「没值」）', () => {
      expect(deviceLine(read({ pid: PID, value: 0 }), property('温度', '℃'), {}).text).toBe('0');
    });

    it('没有读数 → `-`（与服务卡同一个说法）', () => {
      expect(deviceLine(read({ pid: PID }), property('温度', '℃'), {}).text).toBe('-');
    });

    it('规格里查不到这个属性 → 名字退回 pid 原文，且**不带单位**', () => {
      // pid 原文看着糙，但它说明了「这个 pid 在产品规格里找不到」；空白只说明「这里没东西」，
      // 而编一个名字最坏（一个哪儿都不存在的属性名，谁也排查不了）。没有规格就没有单位可说
      const line = deviceLine(read({ pid: PID, value: 23.5 }), undefined, {});
      expect(line).toEqual<DeviceLine>({ name: PID, text: '23.5', unit: '' });
    });

    it('规格里查到了属性但没有文案 → 同样退回 pid 原文（空名字不是名字）', () => {
      const line = deviceLine(read({ pid: PID, value: 1 }), property('', '℃'), {});
      expect(line.name).toBe(PID);
    });

    it('属性没有单位时那一栏是空串（模板据此不渲染它）', () => {
      expect(deviceLine(read({ pid: PID, value: 1 }), property('开关', ''), {}).unit).toBe('');
    });

    it('showUnit 为假时单位不显示，名字与值照旧', () => {
      const line = deviceLine(read({ pid: PID, value: 23.5 }), property('温度', '℃'), {
        showUnit: false,
      });
      expect(line).toEqual<DeviceLine>({ name: '温度', text: '23.5', unit: '' });
    });

    it('showUnit 缺省是显示（缺省值只在配置里没有这个键时生效）', () => {
      expect(deviceLine(read({ pid: PID, value: 1 }), property('温度', '℃'), {}).unit).toBe('℃');
      expect(
        deviceLine(read({ pid: PID, value: 1 }), property('温度', '℃'), { showUnit: undefined })
          .unit,
      ).toBe('℃');
    });

    it('读失败时那一行仍按「没值」渲染（失败标识在卡头，不在这一行）', () => {
      const line = deviceLine(
        read({ pid: PID, error: 'device offline' }),
        property('温度', '℃'),
        {},
      );
      expect(line).toEqual<DeviceLine>({ name: '温度', text: '-', unit: '℃' });
    });

    it('pid 缺失且查不到规格时名字给 `-`（不留空白，也不抛）', () => {
      expect(deviceLine(read({}), undefined, {}).name).toBe('-');
    });
  });
});
