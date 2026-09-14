/**
 * 采样值的展示文案：数值收一收浮点误差，对象退化成 JSON，null 显示 -。
 *
 * 放在这里而不是某个页面里：采集历史与控制历史两张表在用它，告警页的「当前值」也要用同一句话 ——
 * 同一个 `0.30000000000000004` 在三个页面上必须长得一样，各写一份迟早会走样。
 *
 * 「值」在协议里可以是数值（含缩放后的浮点）、取值表的描述字符串、位区的 0/1（见 `ModbusValue`），
 * 故这里按运行时类型分支，而不是假定是数字。
 */
export function valueText(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'number') {
    return numberText(value);
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** 数值文案：整数不带小数点，浮点收到 4 位（0.30000000000000004 → 0.3） */
export function numberText(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}
