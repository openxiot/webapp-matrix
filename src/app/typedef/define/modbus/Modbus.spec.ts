import { ModbusConfig, modbusConfigLabel, modbusSlaveLabel } from './Modbus';

/**
 * 点表显示名的那两个纯函数。
 *
 * 它们原先在三个页面各写了一遍（服务清单页 / 服务详情页 / 编辑页），本次收成一份，
 * 首页「服务类型分布」也开始用它 —— 断言的重点因此是**四个地方看到的名字必须逐字相同**，
 * 以及两处容易悄悄走样的兜底：厂家型号都空时给空串（由调用方决定显示什么），
 * 点表查不到时退回 id（点表被删或不可见是常态，不是错误）。
 */
describe('modbusSlaveLabel', () => {
  it('拼厂家与型号，中间一个空格', () => {
    expect(modbusSlaveLabel({ manufacturer: '特灵', model: '19XRV' })).toBe('特灵 19XRV');
  });

  it('两侧空白先修掉再拼（点表里手填的厂家型号常带空格）', () => {
    expect(modbusSlaveLabel({ manufacturer: ' 特灵 ', model: ' 19XRV  ' })).toBe('特灵 19XRV');
  });

  it('只有一半时不给多余的空格', () => {
    expect(modbusSlaveLabel({ manufacturer: '特灵', model: '' })).toBe('特灵');
    expect(modbusSlaveLabel({ manufacturer: '', model: '19XRV' })).toBe('19XRV');
  });

  it('两者都空 / slave 缺失都给空串', () => {
    // 空串而不是 `-`：显示什么都不该由这个函数替页面决定
    expect(modbusSlaveLabel({ manufacturer: '', model: '' })).toBe('');
    expect(modbusSlaveLabel(undefined)).toBe('');
    expect(modbusSlaveLabel(null)).toBe('');
  });
});

describe('modbusConfigLabel', () => {
  const configs: ModbusConfig[] = [config('cfg-1', '特灵', '19XRV'), config('cfg-2', '开利', '')];

  it('按 id 找到点表，用它的厂家型号', () => {
    expect(modbusConfigLabel(configs, 'cfg-1')).toBe('特灵 19XRV');
    expect(modbusConfigLabel(configs, 'cfg-2')).toBe('开利');
  });

  it('点表查不到时退回 id（被删或不可见都算）', () => {
    // 退回 id 而不是空串：页面上「这个服务配过一张点表、但它现在看不见了」比一片空白有用
    expect(modbusConfigLabel(configs, 'cfg-gone')).toBe('cfg-gone');
  });

  it('id 为空 = 没配点表，给空串（不是把一个空 id 当名字）', () => {
    expect(modbusConfigLabel(configs, '')).toBe('');
    expect(modbusConfigLabel(configs, undefined)).toBe('');
    expect(modbusConfigLabel(configs, null)).toBe('');
  });

  it('找到点表但厂家型号都空，照旧退回 id', () => {
    expect(modbusConfigLabel([config('cfg-3', '', '')], 'cfg-3')).toBe('cfg-3');
  });

  it('清单为空时不炸，退回 id', () => {
    expect(modbusConfigLabel([], 'cfg-1')).toBe('cfg-1');
  });
});

function config(id: string, manufacturer: string, model: string): ModbusConfig {
  return { id, slave: { manufacturer, model }, commands: [] };
}
