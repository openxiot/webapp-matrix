/**
 * 生成功能码动作对应的 Modbus RTU 请求帧与应答帧（完整帧：从站地址 + PDU + CRC16），
 * 并把帧按字段切开供展示。
 * 供设备点表编辑器行操作「命令」预览对话框使用；纯函数、无 Angular 依赖。
 *
 * 编码约定（与设备点表模型一致）：
 * - 从站地址取自设备信息，帧首字节；
 * - 寄存器/线圈地址 = 0 基数据地址（start），与逻辑地址换算口径一致；
 * - 01/02 读位：数量即位数，帧里数量 = 数量；03/04 读寄存器：数量为**值的个数**，
 *   帧里数量 = 数量 × 类型跨度（string 的数量本身就是长度，不加倍）——见 frameQuantityOf；
 * - 06 单寄存器值按 16 位无符号写；
 * - 05 写单线圈按 coilState → 0xFF00 / 0x0000；
 * - 0F 写多线圈：数量=条目数，按 offset 打包为位（bit0=起始地址），byteCount=ceil(n/8)；
 * - 10 写多寄存器：数量=各条类型占用之和，数据区按条 dataType/byteOrder 编码 2/4 字节真实值
 *   （int16/uint16=2 字节；int32/uint32/float32=4 字节；float32 的 value 即其 32 位位模式）。
 */
import {
  ModbusCoilItem,
  ModbusCommand,
  ModbusRegisterItem,
} from '@app/typedef/define/modbus/Modbus';
import {
  expectedBitCount,
  expectedFieldCount,
  fcLabelKey,
  fieldBaseName,
  fitBitNames,
  fitFieldNames,
  frameQuantityOf,
  registerSpan,
} from '../../command/point.options';

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
    // 03/04 的数量是「值的个数」，帧里要读的寄存器数 = 数量 × 类型跨度
    return [...start, ...u16(frameQuantityOf(fc, command.quantity, command.dataType))];
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
 * 应答帧：生成功能码动作对应的 Modbus RTU 正常应答帧与异常应答帧。
 * 与请求帧同口径：完整帧（从站地址 + PDU + CRC16），纯函数、无 Angular 依赖。
 * ----------------------------------------------------------------------------------------------*/

/** 应答形态：read=带数据区（01–04）；echo=请求回显（05/06）；ack=只回显地址与数量（0F/10）；exception=异常应答。 */
export type ResponseKind = 'read' | 'echo' | 'ack' | 'exception';

/** 应答帧：bytes 里为 null 的字节表示「设备返回后才能确定」，十六进制显示为 ??。 */
export interface ResponseFrame {
  bytes: (number | null)[];
  /** 大写、空格分隔；未知字节为 ?? */
  hex: string;
  count: number;
  kind: ResponseKind;
  /** 数据区为示例值：读应答的真实数据由设备返回，此处按字节数补零以给出完整可照抄的帧 */
  sample: boolean;
}

/** 一次命令的两条应答帧：正常应答 + 异常应答。 */
export interface ResponsePreview {
  frame: ResponseFrame;
  exception: ResponseFrame;
}

/** 生成结果：ok=false 时 messageKey 为 i18n key（数据不完整提示）。 */
export type BuildResponseResult =
  | { ok: true; preview: ResponsePreview }
  | { ok: false; messageKey: string };

/** 读功能码（01–04）：应答带数据区；其余为写功能码。 */
const READ_FC_NUMBERS = new Set([0x01, 0x02, 0x03, 0x04]);
/** 读位功能码（01/02）：数据区按位数向上取整到字节；读寄存器（03/04）按每个寄存器 2 字节。 */
const READ_BIT_FC_NUMBERS = new Set([0x01, 0x02]);

/** 按字节补 CRC16 尾，得到完整帧。 */
function withCrc(body: number[]): number[] {
  const crc = crc16(body);
  return [...body, crc & 0xff, (crc >>> 8) & 0xff];
}

/** 十六进制文本；null（设备返回后才确定）显示为 ??。 */
function toHexOrPlaceholder(bytes: (number | null)[]): string {
  return bytes
    .map((b) => (b == null ? '??' : b.toString(16).padStart(2, '0').toUpperCase()))
    .join(' ');
}

/**
 * 0F/10 写多个时应答回显的数量：0F 为线圈条目数，10 为各条类型占用的寄存器数之和
 * （与请求帧数据区同源，故直接复用打包/编码结果）。
 */
function writeQuantity(command: ModbusCommand, fc: number): number | null {
  const packed = fc === 0x0f ? packCoils(command.coils) : encodeRegisters(command.registers);
  return packed ? packed[0] : null;
}

/** 异常应答：从站 + (功能码 | 0x80) + 异常码 + CRC16；异常码与 CRC 由设备返回，以 ?? 占位。 */
function exceptionFrame(slaveId: number, fc: number): ResponseFrame {
  const bytes: (number | null)[] = [slaveId, fc | 0x80, null, null, null];
  return {
    bytes,
    hex: toHexOrPlaceholder(bytes),
    count: bytes.length,
    kind: 'exception',
    sample: false,
  };
}

/**
 * 生成功能码动作对应的应答帧（正常应答 + 异常应答）。从站地址非法或命令数据不完整时 ok=false。
 *
 * - 01–04 读：`从站 + 功能码 + 字节数 + 数据区 + CRC16`，字节数由数量算出（读位 ceil(n/8)、
 *   读寄存器 n×2），数据区按示例值（全 0）补全 —— 真实数据由设备返回，故整帧标记 sample；
 * - 05/06 写单个：应答是请求回显，与请求帧逐字节相同；
 * - 0F/10 写多个：应答只回显 起始地址 + 数量，不带数据区。
 *
 * 异常应答恒随正常应答一并给出（设备返回哪个异常码由现场决定，帧内留 ??）。
 */
export function buildResponseFrame(
  command: ModbusCommand,
  slaveId: number | undefined,
): BuildResponseResult {
  if (slaveId == null || slaveId < 0 || slaveId > 255) {
    return { ok: false, messageKey: INCOMPLETE_KEY };
  }
  const fc = parseInt(command.fc ?? '', 16);
  if (Number.isNaN(fc)) {
    return { ok: false, messageKey: INCOMPLETE_KEY };
  }

  let body: number[] | null = null;
  let kind: ResponseKind | null = null;
  let sample = false;

  if (READ_FC_NUMBERS.has(fc)) {
    // 读位按位数向上取整到字节；读寄存器按帧里实际读的寄存器数（值的个数 × 类型跨度）× 2 字节
    const byteCount = READ_BIT_FC_NUMBERS.has(fc)
      ? Math.ceil((command.quantity ?? 1) / 8)
      : frameQuantityOf(command.fc, command.quantity, command.dataType) * 2;
    if (byteCount < 1) {
      return { ok: false, messageKey: INCOMPLETE_KEY };
    }
    body = [slaveId, fc, byteCount, ...new Array<number>(byteCount).fill(0)];
    kind = 'read';
    sample = true;
  } else if (fc === 0x05 || fc === 0x06) {
    const data = buildData(command); // 回显即请求的数据区
    if (data) {
      body = [slaveId, fc, ...data];
      kind = 'echo';
    }
  } else if (fc === 0x0f || fc === 0x10) {
    const quantity = writeQuantity(command, fc);
    if (quantity != null) {
      body = [slaveId, fc, ...u16(command.start ?? 0), ...u16(quantity)];
      kind = 'ack';
    }
  }

  if (!body || !kind) {
    return { ok: false, messageKey: INCOMPLETE_KEY };
  }
  const bytes = withCrc(body);
  return {
    ok: true,
    preview: {
      frame: { bytes, hex: toHex(bytes), count: bytes.length, kind, sample },
      exception: exceptionFrame(slaveId, fc),
    },
  };
}

/* ----------------------------------------------------------------------------------------------
 * 帧结构解析：把已生成的 frame.bytes 按字段切开，附含义与解读，供预览对话框在帧下方展示。
 * 字节切分一律以 frame.bytes 为准（与帧一致，不依赖命令字段重复推算）。
 * ----------------------------------------------------------------------------------------------*/

/** 解析出的一个字段：labelKey 为字段名 i18n key；hex 为该字段字节；值用 text/textKey+textParams 或 lines 表达。 */
export interface FramePart {
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

/** 位模式 → 展示文本：有符号整型按补码解释，其余（无符号 / 浮点）给位模式十六进制。 */
function decodeValue(u: number, type: string, bits: number): number | string {
  if (type === 'int16' || type === 'int32') {
    const mod = 2 ** bits;
    return u >= mod / 2 ? u - mod : u;
  }
  return '0x' + u.toString(16).toUpperCase().padStart(bits / 4, '0');
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
      const value = decodeValue(fromWireBytes(slice, span, order), type, bits);
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
): FramePart[] {
  const bytes = frame.bytes;
  const parts: FramePart[] = [];

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

  parts.push(crcPart(bytes));
  return parts;
}

/* ----------------------------------------------------------------------------------------------
 * 应答帧解析：与请求帧同一套字段形状，随应答形态（读 / 回显 / 确认 / 异常）给出对应字段。
 * ----------------------------------------------------------------------------------------------*/

/** 取字节；null（设备返回后才确定）按 0 计，仅用于读已经确定的前置字段。 */
function at(bytes: (number | null)[], index: number): number {
  return bytes[index] ?? 0;
}

/** CRC16 尾字段（末两字节）；两字节未知时不给解读，由调用方补文案。 */
function crcPart(bytes: (number | null)[]): FramePart {
  const length = bytes.length;
  const lo = bytes[length - 2];
  const hi = bytes[length - 1];
  if (lo == null || hi == null) {
    return { labelKey: 'CRC16', hex: '?? ??' };
  }
  const value = ((lo | (hi << 8)) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return { labelKey: 'CRC16', hex: toHex([lo, hi]), text: '0x' + value };
}

/**
 * 读应答的字段名称（按功能码口径补齐，旧数据留空则用默认名：名称主体，多字段再加序号）。
 * 与生成服务时的 response[].field 同一套（见 device/services/service.functions）。
 */
function readFieldNames(command: ModbusCommand): string[] {
  return fitFieldNames(
    command.fieldNames,
    expectedFieldCount(command.fc, command.quantity, command.dataType),
    fieldBaseName(command.name),
  );
}

/**
 * 读位命令的位名称：偏移 → 位名称（只含命名了的位）。
 * 与生成服务时 response[].bit-list 同一套（见 device/services/service.functions）。
 */
function readBitNames(command: ModbusCommand): Map<number, string> {
  const names = new Map<number, string>();
  for (const bit of fitBitNames(command.bitNames, expectedBitCount(command.fc, command.quantity))) {
    names.set(bit.offset ?? 0, bit.name ?? '');
  }
  return names;
}

/**
 * 读应答数据区 → 逐项解读：读位按位、读寄存器按点表声明的类型与字节序切分。
 * 值来自示例数据区（真实数据由设备返回），故这里展示的是「将来怎么解」；
 * 多值读（数量 > 1）每行前面标上应答字段名（读位只标命名了的位），与生成的服务字段一一对照。
 */
function readDataLines(command: ModbusCommand, data: number[]): string[] {
  const quantity = command.quantity ?? 1;
  if (READ_BIT_FC_NUMBERS.has(parseInt(command.fc ?? '', 16))) {
    const names = readBitNames(command);
    return coilDecodeLines(data, quantity).map((l) => {
      const label = names.get(Number(l.at));
      return label ? `${label}  ${l.at}=${l.value}` : `${l.at}=${l.value}`;
    });
  }

  const type = command.dataType ?? 'int16';
  if (type === 'string') {
    // string 不按寄存器切分，示例值（全 0）也没有展示意义，只给跨度
    return [`${quantity > 1 ? `0-${quantity - 1}` : '0'}  string ${quantity * 2}B`];
  }

  const names = readFieldNames(command);
  const order = command.byteOrder ?? 'ABCD';
  const suffix = [command.scale != null ? `×${command.scale}` : '', command.unit ?? '']
    .filter((s) => s.length > 0)
    .join(' ');
  const span = registerSpan(type) ?? 1;
  const lines: string[] = [];
  let address = 0;
  let index = 0;
  for (let cursor = 0; cursor + span * 2 <= data.length; cursor += span * 2) {
    const slice = data.slice(cursor, cursor + span * 2);
    const value = decodeValue(fromWireBytes(slice, span, order), type, span * 8);
    const atLabel = span > 1 ? `${address}-${address + span - 1}` : `${address}`;
    const label = names.length > 1 ? `${names[index] ?? ''}  ` : '';
    lines.push(`${label}${atLabel}  ${type} ${order}${suffix ? ` ${suffix}` : ''} = ${value}`);
    address += span;
    index += 1;
  }
  return lines;
}

/** 应答帧解析需要的外部文案：纯函数不依赖 Angular i18n，组合文案由调用方按当前语言翻好传入。 */
export type FrameTranslator = (key: string) => string;

/** Modbus 标准异常码含义；设备返回哪个由现场决定，故这里只列常见四个。 */
const EXCEPTION_CODES_KEY = '01 非法功能码 / 02 非法数据地址 / 03 非法数据值 / 04 从站设备故障';

/**
 * 解析应答帧结构：
 * - read：从站地址 / 功能码 / 字节数 / 数据区（按点表声明的类型与字节序逐项解读）/ CRC16；
 * - echo：05/06 的应答与请求逐字节相同，直接复用请求帧那套字段解析；
 * - ack：0F/10 只回显 起始地址 + 数量；
 * - exception：从站地址 / 功能码（名称 + 异常）/ 异常码（??，附常见含义）/ CRC16。
 */
export function describeResponseFrame(
  command: ModbusCommand,
  frame: ResponseFrame,
  t: FrameTranslator,
): FramePart[] {
  const bytes = frame.bytes;

  // 逐字节回显的帧不含未知字节，按请求帧同一套字段解析
  if (frame.kind === 'echo') {
    const echo = bytes.filter((b): b is number => b != null);
    return describeRequestFrame(command, { bytes: echo, hex: frame.hex, count: frame.count });
  }

  const parts: FramePart[] = [
    { labelKey: '从站地址', hex: toHex([at(bytes, 0)]), text: String(at(bytes, 0)) },
  ];

  if (frame.kind === 'exception') {
    parts.push({
      labelKey: '功能码',
      hex: toHex([at(bytes, 1)]),
      text: `${t(fcLabelKey(command.fc))} + ${t('异常')}`,
    });
    parts.push({ labelKey: '异常码', hex: '??', text: t(EXCEPTION_CODES_KEY) });
    const crc = crcPart(bytes);
    crc.text ??= t('待设备返回');
    parts.push(crc);
    return parts;
  }

  parts.push({ labelKey: '功能码', hex: toHex([at(bytes, 1)]), textKey: fcLabelKey(command.fc) });

  if (frame.kind === 'ack') {
    parts.push({
      labelKey: '起始地址',
      hex: toHex([at(bytes, 2), at(bytes, 3)]),
      text: String(((at(bytes, 2) << 8) | at(bytes, 3)) & 0xffff),
    });
    parts.push({
      labelKey: '数量',
      hex: toHex([at(bytes, 4), at(bytes, 5)]),
      text: String(((at(bytes, 4) << 8) | at(bytes, 5)) & 0xffff),
    });
    parts.push(crcPart(bytes));
    return parts;
  }

  // read：字节数 + 数据区 + CRC16
  const byteCount = at(bytes, 2);
  parts.push({ labelKey: '字节数', hex: toHex([byteCount]), text: String(byteCount) });
  const data = bytes.slice(3, 3 + byteCount).map((b) => b ?? 0);
  parts.push({ labelKey: '数据区', hex: toHex(data), lines: readDataLines(command, data) });
  parts.push(crcPart(bytes));
  return parts;
}
