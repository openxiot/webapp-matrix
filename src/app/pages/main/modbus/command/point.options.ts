/**
 * 功能码（设备点表）词表与显示工具。
 *
 * 结构以功能码为中心：label 为中文短语 i18n key，模板经 translate 管道渲染；
 * dataType / 字节序 的 value 即显示文本，无需翻译。
 */
import { ModbusBitName } from '../../../../typedef/define/modbus/Modbus';

/** 词条形状：value 为存储值；label 为 i18n key（中文短语即 key），无翻译时可直接当显示文本。 */
interface PointSelectOption {
  value: string;
  label: string;
}

/** 8 个功能码（十六进制大写）。 */
export const FC_OPTIONS: PointSelectOption[] = [
  { value: '01', label: '读线圈' },
  { value: '02', label: '读离散输入' },
  { value: '03', label: '读保持寄存器' },
  { value: '04', label: '读输入寄存器' },
  { value: '05', label: '写单个线圈' },
  { value: '06', label: '写单个寄存器' },
  { value: '0F', label: '写多个线圈' },
  { value: '10', label: '写多个寄存器' },
];

/** 新建默认功能码：读保持寄存器。 */
export const DEFAULT_FC = '03';

/** 读位（每点 1 位布尔，数量通常 1） */
export const READ_BIT_FCS = new Set(['01', '02']);
/** 读寄存器（带 数据格式/字节序/缩放/单位） */
export const READ_REG_FCS = new Set(['03', '04']);
/** 写功能码（05/06/0F/10）：读功能码为 01–04，写动作在列表中用红色区分。 */
export const WRITE_FCS = new Set(['05', '06', '0F', '10']);
/** 读功能码（01–04）：只有读操作有应答字段（fieldNames）。 */
export const READ_FCS = new Set(['01', '02', '03', '04']);

/** 名称前缀：读功能码的动作名以「读」开头、写功能码以「写」开头（对话框按功能码自动加上）。 */
export function fcPrefixKey(fc?: string): string {
  return fc != null && WRITE_FCS.has(fc) ? '写' : '读';
}

/**
 * 一条命令的名称主体：去掉开头的前缀（当前语言的前缀 + 中文的读/写 —— 点表多以中文录入，
 * 换个语言打开时不该把「读」当成名字的一部分）。前缀本身由对话框按功能码与语言重新拼上。
 */
export function nameBodyOf(name: string | undefined, prefix: string): string {
  const text = name ?? '';
  for (const p of [prefix, '读', '写']) {
    if (p.length > 0 && text.startsWith(p)) {
      return text.slice(p.length).trim();
    }
  }
  return text;
}

/** 前缀末尾是中日文字符（含全角标点）时与主体直接相连，其余语言（拉丁/西里尔/韩文等）用空格隔开。 */
const CJK_TAIL = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]$/;

/**
 * 名称 = 前缀 + 主体（空主体时只留前缀，交给校验拦住）。
 * 中文前缀（读/写）直接相连，其它语言的前缀（Read/Чтение/읽기…）用空格隔开 ——
 * 与 {@link nameBodyOf} 互逆：重新打开时去掉前缀，再去掉那个空格，得到原来的主体。
 */
export function composeName(prefix: string, body: string): string {
  const text = body.trim();
  if (text.length === 0) {
    return prefix;
  }
  if (prefix.length === 0) {
    return text;
  }
  return CJK_TAIL.test(prefix) ? prefix + text : `${prefix} ${text}`;
}

/** 是否为写功能码（05/06/0F/10）；用于表格里把写动作标红，区别于读功能码的蓝色。 */
export function isWriteFc(fc?: string): boolean {
  return fc != null && WRITE_FCS.has(fc);
}

export const DATA_TYPE_OPTIONS: PointSelectOption[] = [
  { value: 'int16', label: 'int16' },
  { value: 'uint16', label: 'uint16' },
  { value: 'int32', label: 'int32' },
  { value: 'uint32', label: 'uint32' },
  { value: 'float32', label: 'float32' },
  { value: 'string', label: 'string' },
];

/** 10 写多寄存器允许的数据类型（不含 string，写按原始值）。 */
export const WRITE_REGISTER_DATA_TYPE_OPTIONS = DATA_TYPE_OPTIONS.filter(
  (o) => o.value !== 'string',
);

/** 类型占用寄存器数：16 位→1、32 位/float→2、string→不固定。 */
export function registerSpan(dataType?: string): number | undefined {
  if (dataType === 'int16' || dataType === 'uint16') {
    return 1;
  }
  if (dataType === 'int32' || dataType === 'uint32' || dataType === 'float32') {
    return 2;
  }
  return undefined;
}

/**
 * 请求帧里的数量：01/02 即位/线圈个数；03/04 非 string = 值的个数 × 类型跨度（string 的数量本身
 * 就是长度），与后端 ModbusFrameCodec.readQuantity 同口径。
 */
export function frameQuantityOf(fc?: string, quantity?: number, dataType?: string): number {
  const q = Math.max(1, Math.floor(quantity ?? 1));
  if (!READ_REG_FCS.has(fc ?? '')) {
    return q;
  }
  return q * (registerSpan(dataType) ?? 1);
}

/**
 * 一条读命令的应答字段个数（＝要填的字段名称个数）：03/04 string 恒为 1、其余类型为值的个数；
 * 01/02 的应答字段恒为 1（整段位掩码，名字由生成方按功能名称兜底，逐位命名走 {@link expectedBitCount}），
 * 写操作没有应答字段，返回 0。
 */
export function expectedFieldCount(fc?: string, quantity?: number, dataType?: string): number {
  if (fc == null) {
    return 0;
  }
  if (READ_REG_FCS.has(fc)) {
    return dataType === 'string' ? 1 : Math.max(1, Math.floor(quantity ?? 1));
  }
  return 0;
}

/** 一条读位命令要展示的位名称行数（01/02 = 位/线圈个数），其余功能码返回 0。 */
export function expectedBitCount(fc?: string, quantity?: number): number {
  if (fc == null || !READ_BIT_FCS.has(fc)) {
    return 0;
  }
  return Math.max(1, Math.floor(quantity ?? 1));
}

/** 位名称表里某一位的名称（未命名返回空串）。 */
export function bitNameAt(names: ModbusBitName[] | undefined, offset: number): string {
  return (names ?? []).find((item) => item?.offset === offset)?.name?.trim() ?? '';
}

/**
 * 位名称表 → 提交口径：**只保留真正命名了的位**（留空 = 该位不单独出值，仍可从整段掩码读），
 * 按偏移升序、同一位只留一条；偏移超出当前数量的条目丢弃（数量改小后不留残名）。
 * 与后端 `ModbusCommand.bitNames`（{@link ModbusBitName}：offset 0 基、可只命名其中几位）同口径。
 */
export function fitBitNames(names: ModbusBitName[] | undefined, count: number): ModbusBitName[] {
  const kept: ModbusBitName[] = [];
  const seen = new Set<number>();
  for (const item of names ?? []) {
    const offset = item?.offset;
    const name = (item?.name ?? '').trim();
    if (offset == null || offset < 0 || offset >= count || name.length === 0 || seen.has(offset)) {
      continue;
    }
    seen.add(offset);
    kept.push({ offset, name });
  }
  return kept.sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0));
}

/**
 * 应答字段默认名的基名：取命令名称去掉「读」/「写」前缀的主体（如「读开关状态」→「开关状态」），
 * 字段名是读回来的那个值的标签，带动作前缀反而不像数据字段。
 */
export function fieldBaseName(name?: string): string {
  return nameBodyOf(name, '');
}

/**
 * 重名的取值名（同一应答里的字段名与位名共用一个命名空间，后端 ModbusServiceValidator 会拒重名）。
 * 入参给「提交口径」的那套名字（字段名按数量补齐、位名只含命名了的位 + 整段位掩码头那个字段名），
 * 返回出现一次以上的名字（去空白后比较）——界面据此标红并拦住「确认」。
 */
export function duplicatedNames(names: (string | undefined)[]): Set<string> {
  const counts = new Map<string, number>();
  for (const raw of names) {
    const name = (raw ?? '').trim();
    if (name.length === 0) {
      continue;
    }
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
}

/** 应答字段的默认名称：单个字段用基名，多个字段在基名后加序号（对话框里可逐项改写）。 */
export function defaultFieldName(baseName: string, index: number, total: number): string {
  const base = baseName.trim();
  return total > 1 ? `${base} ${index + 1}` : base;
}

/** 把名称列表补/裁到 count 个：保留已改过的名字，缺的用默认名（基名 baseName）补齐。 */
export function fitFieldNames(
  names: string[] | undefined,
  count: number,
  baseName: string,
): string[] {
  const list = names ?? [];
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const kept = (list[i] ?? '').trim();
    return kept.length > 0 ? kept : defaultFieldName(baseName, i, count);
  });
}

/** 字节序四种排布（32 位跨两个寄存器；16 位只用 ABCD/DCBA）。 */
export const BYTE_ORDER_OPTIONS: PointSelectOption[] = [
  { value: 'ABCD', label: 'ABCD' },
  { value: 'DCBA', label: 'DCBA' },
  { value: 'BADC', label: 'BADC' },
  { value: 'CDAB', label: 'CDAB' },
];

/** 字节序 → 说明文案 i18n key。 */
export function byteOrderNoteKey(value?: string): string {
  switch (value) {
    case 'ABCD':
      return '大端';
    case 'DCBA':
      return '小端';
    case 'BADC':
      return '字节交换';
    case 'CDAB':
      return '字交换';
    default:
      return '';
  }
}

/** 按数据类型返回可用的字节序：16 位只有 大端/小端。 */
export function byteOrderOptionsFor(dataType?: string): PointSelectOption[] {
  if (dataType === 'int16' || dataType === 'uint16') {
    return BYTE_ORDER_OPTIONS.filter((o) => o.value === 'ABCD' || o.value === 'DCBA');
  }
  return BYTE_ORDER_OPTIONS;
}

/** 线圈状态选项（05/0F 下拉用）：on=ON、off=OFF（无需翻译）。 */
export const COIL_STATE_OPTIONS = [
  { value: 'on', label: 'ON' },
  { value: 'off', label: 'OFF' },
];

/** 线圈状态：on/off（显示 ON/OFF，通用无需翻译）。 */
export function coilStateText(value?: string): string {
  return value === 'on' ? 'ON' : value === 'off' ? 'OFF' : '-';
}

/** 寄存器原始值的位宽：int16/uint16→16 位，其余（int32/uint32/float32/未知）→32 位。 */
function registerBits(dataType?: string): 16 | 32 {
  return dataType === 'int16' || dataType === 'uint16' ? 16 : 32;
}

/** 有符号整型（负数值按补码写/读）。 */
function isSignedInt(dataType?: string): boolean {
  return dataType === 'int16' || dataType === 'int32';
}

/**
 * 寄存器原始值 → 按类型的位模式十六进制文本（FC10 子表用，随 dataType 联动）：
 * - int16/int32 负数显示补码（-1 → FFFF / FFFFFFFF）；
 * - uint32/float32 显示其 32 位位模式原值。
 */
export function registerValueHex(value?: number | null, dataType?: string): string {
  if (value == null) {
    return '';
  }
  const mod = 2 ** registerBits(dataType);
  const unsigned = value >= 0 ? value % mod : (value % mod) + mod;
  return unsigned.toString(16).toUpperCase();
}

/**
 * 位模式十六进制文本 → 按类型的带符号数值（FC10 子表用）：
 * - int16/int32 高位置位按补码解释为负数（FFFF → -1）；
 * - uint32/float32 保持 32 位位模式无符号原值。
 */
export function parseRegisterHex(text: string, dataType?: string): number | undefined {
  const clean = text.trim().toUpperCase().replace(/^0X/, '');
  if (clean.length === 0) {
    return undefined;
  }
  const raw = parseInt(clean, 16);
  if (Number.isNaN(raw)) {
    return undefined;
  }
  const bits = registerBits(dataType);
  const mod = 2 ** bits;
  let value = raw % mod;
  if (isSignedInt(dataType) && value >= mod / 2) {
    value -= mod;
  }
  return value;
}

/** fc 枚举值 → 功能码名称 i18n key；未知/空值返回占位符。 */
export function fcLabelKey(fc?: string): string {
  const option = FC_OPTIONS.find((o) => o.value === fc);
  return option ? option.label : '-';
}

/** 功能码 → 逻辑地址 1 基区段起始（40001/30001/10001/00001 四种）。仅 {@link logicalAddressOf} 使用。 */
function logicalBase(fc?: string): number | undefined {
  switch (fc) {
    case '01':
    case '05':
    case '0F':
      return 1; // 线圈 00001
    case '02':
      return 10001; // 离散输入 10001
    case '04':
      return 30001; // 输入寄存器 30001
    case '03':
    case '06':
    case '10':
      return 40001; // 保持寄存器 40001
    default:
      return undefined;
  }
}

/** 逻辑地址（1 基工程号）＝ start + 区段基址；start 为空返回 undefined。 */
export function logicalAddressOf(fc?: string, start?: number): number | undefined {
  const base = logicalBase(fc);
  if (base == null || start == null) {
    return undefined;
  }
  return base + start;
}
