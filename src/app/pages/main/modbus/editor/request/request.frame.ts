/**
 * 生成功能码动作对应的 Modbus RTU 请求帧（完整帧：从站地址 + PDU + CRC16）。
 * 供设备点表编辑器行操作「命令」预览对话框使用；纯函数、无 Angular 依赖。
 *
 * 编码约定（与设备点表模型一致）：
 * - 从站地址取自设备信息，帧首字节；
 * - 寄存器/线圈地址 = 0 基数据地址（start），与逻辑地址换算口径一致；
 * - 03/04 等读命令 quantity 为数量；06 单寄存器值按 16 位无符号写；
 * - 05 写单线圈按 coilState → 0xFF00 / 0x0000；
 * - 0F 写多线圈：数量=条目数，按 offset 打包为位（bit0=起始地址），byteCount=ceil(n/8)；
 * - 10 写多寄存器：数量=各条类型占用之和，数据区按条 dataType/byteOrder 编码 2/4 字节真实值
 *   （int16/uint16=2 字节；int32/uint32/float32=4 字节；float32 的 value 即其 32 位位模式）。
 */
import {
  ModbusCoilItem,
  ModbusCommand,
  ModbusRegisterItem,
} from '../../../../../typedef/define/modbus/Modbus';
import { fcLabelKey, registerSpan } from '../../command/point.options';

/** 生成结果帧（字节 + 展示用十六进制 + 字节数）。 */
export interface RequestFrame {
  bytes: number[];
  /** 大写、空格分隔 */
  hex: string;
  count: number;
}

/** 生成结果：ok=false 时 messageKey 为 i18n key（数据不完整提示）。 */
export type BuildRequestResult =
  | { ok: true; frame: RequestFrame }
  | { ok: false; messageKey: string };

/** 命令数据不完整时统一提示。 */
const INCOMPLETE_KEY = '命令数据不完整，无法生成请求帧';

/** 数值 → 无符号位模式（负数补码、超界按 mod 折叠），与寄存器 hex 口径一致。 */
function toUint(value: number, bits: number): number {
  const mod = 2 ** bits;
  let v = value % mod;
  if (v < 0) {
    v += mod;
  }
  return v;
}

/** 16 位数值 → 高、低两字节。 */
function u16(n: number): [number, number] {
  const u = n & 0xffff;
  return [(u >>> 8) & 0xff, u & 0xff];
}

/** Modbus CRC16（多项式 0xA001，初值 0xFFFF，低字节在前）。 */
function crc16(bytes: number[]): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc & 0xffff;
}

function toHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

/** 16/32 位位模式 → 大端字节序，再按 byteOrder 重排成线上字节。 */
function valueBytes(u: number, span: number, byteOrder?: string): number[] {
  let be: number[];
  if (span === 1) {
    be = [(u >>> 8) & 0xff, u & 0xff];
  } else {
    be = [(u >>> 24) & 0xff, (u >>> 16) & 0xff, (u >>> 8) & 0xff, u & 0xff];
  }
  const order = byteOrder ?? 'ABCD';
  if (span === 1) {
    return order === 'DCBA' ? [be[1], be[0]] : be;
  }
  switch (order) {
    case 'DCBA':
      return [be[3], be[2], be[1], be[0]]; // 小端
    case 'BADC':
      return [be[1], be[0], be[3], be[2]]; // 字节交换
    case 'CDAB':
      return [be[2], be[3], be[0], be[1]]; // 字交换
    default:
      return be; // ABCD 大端
  }
}

/** 0F 多线圈：条目 offset→on 打包为位流；返回 [数量, 字节数, 位字节]。 */
function packCoils(
  items: ModbusCoilItem[] | undefined,
): [number, number, number[]] | null {
  if (!items || items.length === 0) {
    return null;
  }
  let count = 0;
  const onOffsets = new Set<number>();
  items.forEach((it, index) => {
    const offset = it.offset ?? index;
    if (offset < 0) {
      return;
    }
    if (offset + 1 > count) {
      count = offset + 1;
    }
    if (it.on) {
      onOffsets.add(offset);
    }
  });
  const byteCount = Math.ceil(count / 8);
  const bytes = new Array<number>(byteCount).fill(0);
  for (const offset of onOffsets) {
    const i = offset >> 3;
    bytes[i] = (bytes[i] ?? 0) | (1 << (offset & 7));
  }
  return [count, byteCount, bytes];
}

/** 10 多寄存器：按条类型/字节序编码真实值；返回 [寄存器数, 字节数, 数据字节]。 */
function encodeRegisters(
  items: ModbusRegisterItem[] | undefined,
): [number, number, number[]] | null {
  if (!items || items.length === 0) {
    return null;
  }
  const data: number[] = [];
  let quantity = 0;
  for (const it of items) {
    const span = registerSpan(it.dataType) ?? 1;
    const bits = span === 1 ? 16 : 32;
    quantity += span;
    const u = toUint(it.value ?? 0, bits);
    data.push(...valueBytes(u, span, it.byteOrder));
  }
  return [quantity, quantity * 2, data];
}

/** 按功能码组出 PDU 数据区；必要字段缺失返回 null。 */
function buildData(command: ModbusCommand): number[] | null {
  const start = u16(command.start ?? 0);
  const fc = command.fc;

  if (fc === '01' || fc === '02' || fc === '03' || fc === '04') {
    const quantity = command.quantity ?? 1;
    return [...start, ...u16(quantity)];
  }
  if (fc === '05') {
    if (command.coilState !== 'on' && command.coilState !== 'off') {
      return null;
    }
    return command.coilState === 'on' ? [...start, 0xff, 0x00] : [...start, 0x00, 0x00];
  }
  if (fc === '06') {
    if (command.registerValue == null) {
      return null;
    }
    return [...start, ...u16(command.registerValue)];
  }
  if (fc === '0F') {
    const packed = packCoils(command.coils);
    if (!packed) {
      return null;
    }
    const [count, byteCount, coilBytes] = packed;
    return [...start, ...u16(count), byteCount, ...coilBytes];
  }
  if (fc === '10') {
    const encoded = encodeRegisters(command.registers);
    if (!encoded) {
      return null;
    }
    const [quantity, byteCount, regBytes] = encoded;
    return [...start, ...u16(quantity), byteCount, ...regBytes];
  }
  return null;
}

/**
 * 生成完整 RTU 请求帧。from 从站地址（0-255）不在 0-255 内或命令数据不完整时 ok=false。
 */
export function buildRequestFrame(
  command: ModbusCommand,
  slaveId: number | undefined,
): BuildRequestResult {
  if (slaveId == null || slaveId < 0 || slaveId > 255) {
    return { ok: false, messageKey: INCOMPLETE_KEY };
  }
  const fc = parseInt(command.fc ?? '', 16);
  if (Number.isNaN(fc)) {
    return { ok: false, messageKey: INCOMPLETE_KEY };
  }
  const data = buildData(command);
  if (!data) {
    return { ok: false, messageKey: INCOMPLETE_KEY };
  }
  const body = [slaveId, fc, ...data];
  const crc = crc16(body);
  const bytes = [...body, crc & 0xff, (crc >>> 8) & 0xff];
  return { ok: true, frame: { bytes, hex: toHex(bytes), count: bytes.length } };
}

/* ----------------------------------------------------------------------------------------------
 * 帧结构解析：把已生成的 frame.bytes 按字段切开，附含义与解读，供预览对话框在请求帧下方展示。
 * 字节切分一律以 frame.bytes 为准（与请求帧一致，不依赖命令字段重复推算）。
 * ----------------------------------------------------------------------------------------------*/

/** 解析出的一个字段：labelKey 为字段名 i18n key；hex 为该字段字节；值用 text/textKey+textParams 或 lines 表达。 */
export interface RequestFramePart {
  labelKey: string;
  /** 该字段的十六进制字节（空格分隔大写） */
  hex: string;
  /** 纯文本解读（无需翻译时直接展示） */
  text?: string;
  /** 需翻译的解读（i18n key） */
  textKey?: string;
  textParams?: Record<string, unknown>;
  /** 附加多行解读（线圈位 / 寄存器逐项），用于数据区 */
  lines?: string[];
}

/** 数据区某两项之间的解读行（线圈位 / 寄存器逐项），供模板小字号多行渲染。 */
interface DecodeLine {
  /** 线圈偏移 / 寄存器地址（多寄存器为起始地址） */
  at: string;
  /** 类型 + 字节序（寄存器）；线圈该项为空 */
  kind: string;
  /** 状态 ON/OFF（线圈）或类型化数值（寄存器） */
  value: string;
}

/** 把字节流按 大端→小端 拆回无符号整型（valueBytes 的逆过程）。 */
function fromWireBytes(bytes: number[], span: number, byteOrder?: string): number {
  const order = byteOrder ?? 'ABCD';
  let be: number[];
  if (span === 1) {
    const [a, b] = bytes;
    be = order === 'DCBA' ? [b, a] : [a, b];
  } else {
    const [a, b, c, d] = bytes;
    switch (order) {
      case 'DCBA':
        be = [d, c, b, a];
        break;
      case 'BADC':
        be = [b, a, d, c];
        break;
      case 'CDAB':
        be = [c, d, a, b];
        break;
      default:
        be = [a, b, c, d];
    }
  }
  let u = 0;
  for (const x of be) {
    u = (u << 8) | x;
  }
  return u;
}

/** 线圈数据区 → 每偏移一位的解读。 */
function coilDecodeLines(data: number[], quantity: number): DecodeLine[] {
  const lines: DecodeLine[] = [];
  const count = Math.min(quantity, data.length * 8);
  for (let offset = 0; offset < count; offset++) {
    const on = ((data[offset >> 3] >> (offset & 7)) & 1) === 1;
    lines.push({ at: String(offset), kind: '', value: on ? 'ON' : 'OFF' });
  }
  return lines;
}

/** 寄存器数据区 → 逐寄存器条目的解读（地址/类型/字节序 → 还原数值）。 */
function registerDecodeLines(
  command: ModbusCommand,
  data: number[],
): DecodeLine[] {
  const items = command.registers ?? [];
  const lines: DecodeLine[] = [];
  let registerAddress = command.start ?? 0;
  let cursor = 0;
  for (const item of items) {
    const span = registerSpan(item.dataType) ?? 1;
    const slice = data.slice(cursor, cursor + span * 2);
    const type = item.dataType ?? 'int16';
    const order = item.byteOrder ?? 'ABCD';
    const at = span > 1 ? `${registerAddress}-${registerAddress + span - 1}` : `${registerAddress}`;
    if (slice.length === span * 2) {
      const bits = span * 8;
      const mod = 2 ** bits;
      let u = fromWireBytes(slice, span, order);
      let value: number | string;
      if (type === 'int16' || type === 'int32') {
        if (u >= mod / 2) {
          u -= mod;
        }
        value = u;
      } else {
        value = '0x' + u.toString(16).toUpperCase().padStart(bits / 4, '0');
      }
      lines.push({ at, kind: `${type} ${order}`, value: String(value) });
    }
    cursor += span * 2;
    registerAddress += span;
  }
  return lines;
}

/**
 * 解析请求帧结构：从站/功能码 + 按功能码的地址/数量/数据区（0F/10 含逐位、逐寄存器解读）+ CRC16。
 */
export function describeRequestFrame(
  command: ModbusCommand,
  frame: RequestFrame,
): RequestFramePart[] {
  const bytes = frame.bytes;
  const parts: RequestFramePart[] = [];

  parts.push({ labelKey: '从站地址', hex: toHex([bytes[0]]), text: String(bytes[0]) });
  parts.push({
    labelKey: '功能码',
    hex: toHex([bytes[1]]),
    textKey: fcLabelKey(command.fc),
  });

  // 起始地址（所有功能码都有）
  parts.push({
    labelKey: '起始地址',
    hex: toHex([bytes[2], bytes[3]]),
    text: String(((bytes[2] << 8) | bytes[3]) & 0xffff),
  });

  const fc = command.fc;
  if (fc === '01' || fc === '02' || fc === '03' || fc === '04') {
    const quantity = ((bytes[4] << 8) | bytes[5]) & 0xffff;
    parts.push({ labelKey: '数量', hex: toHex([bytes[4], bytes[5]]), text: String(quantity) });
  } else if (fc === '05') {
    const on = bytes[4] === 0xff && bytes[5] === 0x00;
    parts.push({ labelKey: '线圈状态', hex: toHex([bytes[4], bytes[5]]), text: on ? 'ON' : 'OFF' });
  } else if (fc === '06') {
    parts.push({
      labelKey: '寄存器值',
      hex: toHex([bytes[4], bytes[5]]),
      text: String(((bytes[4] << 8) | bytes[5]) & 0xffff),
    });
  } else if (fc === '0F') {
    const quantity = ((bytes[4] << 8) | bytes[5]) & 0xffff;
    parts.push({ labelKey: '数量', hex: toHex([bytes[4], bytes[5]]), text: String(quantity) });
    parts.push({ labelKey: '字节数', hex: toHex([bytes[6]]), text: String(bytes[6]) });
    const data = bytes.slice(7, 7 + bytes[6]);
    parts.push({
      labelKey: '线圈数据',
      hex: toHex(data),
      lines: coilDecodeLines(data, quantity).map((l) => `${l.at}=${l.value}`),
    });
  } else if (fc === '10') {
    const quantity = ((bytes[4] << 8) | bytes[5]) & 0xffff;
    parts.push({ labelKey: '数量', hex: toHex([bytes[4], bytes[5]]), text: String(quantity) });
    parts.push({ labelKey: '字节数', hex: toHex([bytes[6]]), text: String(bytes[6]) });
    const data = bytes.slice(7, 7 + bytes[6]);
    parts.push({
      labelKey: '寄存器数据',
      hex: toHex(data),
      lines: registerDecodeLines(command, data).map(
        (l) => `${l.at}  ${l.kind} = ${l.value}`,
      ),
    });
  }

  const length = bytes.length;
  const crcValue = bytes[length - 2] | (bytes[length - 1] << 8);
  parts.push({
    labelKey: 'CRC16',
    hex: toHex([bytes[length - 2], bytes[length - 1]]),
    text: '0x' + crcValue.toString(16).toUpperCase().padStart(4, '0'),
  });
  return parts;
}
