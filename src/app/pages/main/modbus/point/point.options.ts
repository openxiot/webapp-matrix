/**
 * 点位「添加/编辑」对话框共用选项与显示工具。
 * label 为中文短语 i18n key，模板中经 translate 管道渲染；
 * 仅 dataType 的 value 即显示文本（int16/... ），无需翻译。
 */
export interface PointSelectOption {
  value: string;
  label: string;
}

export const AREA_OPTIONS: PointSelectOption[] = [
  { value: 'input', label: '输入寄存器' },
  { value: 'holding', label: '保持寄存器' },
  { value: 'coil', label: '线圈' },
  { value: 'discrete_input', label: '离散输入' },
];

/**
 * 各区域固定的读写值（Modbus 标准语义，选中区域即确定，不开放自由选择）：
 * - coil 线圈 / holding 保持寄存器 → 可读可写（rw）；
 * - discrete_input 离散输入 / input 输入寄存器 → 只读（r）。
 */
export const AREA_RW: Record<string, string> = {
  coil: 'rw',
  discrete_input: 'r',
  input: 'r',
  holding: 'rw',
};

/** 由区域推导其固定读写值；区域为空/未知时返回 undefined */
export function rwForArea(area?: string): string | undefined {
  return area ? AREA_RW[area] : undefined;
}

export const RW_OPTIONS: PointSelectOption[] = [
  { value: 'r', label: '只读(r)' },
  { value: 'w', label: '只写(w)' },
  { value: 'rw', label: '读写(rw)' },
];

export const DATA_TYPE_OPTIONS: PointSelectOption[] = [
  { value: 'int16', label: 'int16' },
  { value: 'uint16', label: 'uint16' },
  { value: 'int32', label: 'int32' },
  { value: 'uint32', label: 'uint32' },
  { value: 'float32', label: 'float32' },
  { value: 'string', label: 'string' },
];

/** area 枚举值 → 显示用 i18n key；未知/空值返回占位符 */
export function areaLabelKey(value?: string): string {
  const option = AREA_OPTIONS.find((o) => o.value === value);
  return option ? option.label : '-';
}

/** rw 枚举值 → 显示用 i18n key；未知/空值返回占位符 */
export function rwLabelKey(value?: string): string {
  const option = RW_OPTIONS.find((o) => o.value === value);
  return option ? option.label : '-';
}
