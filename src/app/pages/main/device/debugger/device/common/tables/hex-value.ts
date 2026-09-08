/**
 * DataFormat.HEX 值处理工具。
 * HEX 值的原始形态是连续 hex 字符串(见 Vhex,比较/校验走 Number.parseInt(v,16)),
 * 不含前缀、不含分隔符,大小写均可。显示时可按字节(2 位)加空格分组。
 */

const HEX_CHARS = /^[0-9A-Fa-f]+$/;
const HEX_CHAR_RE = /[0-9A-Fa-f]/;

function isHexChar(ch: string): boolean {
  return HEX_CHAR_RE.test(ch);
}

/** 过滤非 hex 字符并转大写 —— 用于 hex 输入框落库/emit 的值。 */
export function sanitizeHex(value: string | null | undefined): string {
  return (value ?? '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
}

/** 是否为“纯 hex 数字字母”组成的字符串。 */
export function isHexString(value: unknown): value is string {
  return typeof value === 'string' && HEX_CHARS.test(value);
}

/** 显示格式化:纯 hex 串转大写、按字节(每 2 位)空格分组;非 hex 原样返回。 */
export function formatHexValue(value: unknown): string {
  if (typeof value !== 'string') {
    return value == null ? '' : String(value);
  }
  if (value === '' || !HEX_CHARS.test(value)) {
    return value;
  }
  const hex = value.toUpperCase();
  const bytes: string[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(hex.slice(i, i + 2));
  }
  return bytes.join(' ');
}

/** 统计文本中的 hex 字符个数(分隔空格不计),用于输入光标换算。 */
export function countHexChars(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (isHexChar(text[i])) {
      count++;
    }
  }
  return count;
}

/**
 * 输入框光标映射:在“按字节分组、含空格”的展示串里,找到第 hexCount 个 hex 字符之后的位置。
 * 即把“光标前有几个有效 hex 字符”换算回展示串的下标,保证自动插空格时光标不乱跳。
 */
export function hexCaretAfter(formatted: string, hexCount: number): number {
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (isHexChar(formatted[i])) {
      if (seen === hexCount) {
        return i;
      }
      seen++;
    }
  }
  return formatted.length;
}
