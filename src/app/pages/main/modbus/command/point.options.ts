/**
 * 功能码（设备点表）词表与显示工具。
 *
 * 结构以功能码为中心：label 为中文短语 i18n key，模板经 translate 管道渲染；
 * dataType / 字节序 的 value 即显示文本，无需翻译。
 */
/** 词条形状：value 为存储值；label 为 i18n key（中文短语即 key），无翻译时可直接当显示文本。 */
interface PointSelectOption {
  value: string;
  label: string;
}

/** 8 个功能码（十六进制大写）。 */
export const FC_OPTIONS: PointSelectOption[] = [
  { value: '01', label: '读取线圈状态' },
  { value: '02', label: '读取离散输入状态' },
  { value: '03', label: '读取保持寄存器' },
  { value: '04', label: '读取输入寄存器' },
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

/** 选 03/04 数据类型时的推荐数量（string 不自动填，由用户给长度）。 */
export function quantityForDataType(dataType?: string): number | undefined {
  if (dataType === 'string') {
    return undefined;
  }
  return registerSpan(dataType);
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

/** 线圈状态：on/off（显示 ON/OFF，通用无需翻译）。 */
export function coilStateText(value?: string): string {
  return value === 'on' ? 'ON' : value === 'off' ? 'OFF' : '-';
}

/** 数值 → 大写十六进制展示（无 0x 前缀，与起始地址输入框一致）；空值 → '-'。 */
export function hexText(value?: number | null): string {
  if (value == null) {
    return '-';
  }
  return value.toString(16).toUpperCase();
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
