import { ModbusCoilItem, ModbusRegisterItem } from '@app/typedef/define/modbus/Modbus';

/** 0F 写多线圈的表格行（UI 态：状态 on/off）。 */
export interface CoilRow {
  state: 'on' | 'off';
}

/** 10 写多寄存器的表格行（地址不手填，由起始地址按类型跨度自动排布）。 */
export interface RegRow {
  dataType?: string;
  byteOrder?: string;
  value?: number;
}

/** 默认线圈行：ON。 */
export function defaultCoilRow(): CoilRow {
  return { state: 'on' };
}

/** 默认寄存器行：int16 / ABCD / 0。 */
export function defaultRegRow(): RegRow {
  return { dataType: 'int16', byteOrder: 'ABCD', value: 0 };
}

/** 命令里的线圈条目 → 编辑行；空列表给一行默认（与新建默认一致）。 */
export function toCoilRows(items?: ModbusCoilItem[]): CoilRow[] {
  if (!items || items.length === 0) {
    return [defaultCoilRow()];
  }
  return items.map((it) => ({ state: it.on ? 'on' : 'off' }));
}

/** 命令里的寄存器条目 → 编辑行；空列表给一行默认。 */
export function toRegRows(items?: ModbusRegisterItem[]): RegRow[] {
  if (!items || items.length === 0) {
    return [defaultRegRow()];
  }
  return items.map((it) => ({
    dataType: it.dataType,
    byteOrder: it.byteOrder ?? 'ABCD',
    value: it.value,
  }));
}
