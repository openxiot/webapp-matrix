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

/**
 * 数值文案：整数不带小数点，浮点**最多留 2 位小数**（`0.30000000000000004` → `0.3`，
 * `23.4567890` → `23.46`）。
 *
 * 「最多」是字面意思：`23.5` 还是 `23.5`，不补成 `23.50` —— 这是一列读数的口径，补零只会让
 * 上下两行对不齐。代价是小于 `0.005` 的读数会显示成 `0`：这是「留 2 位」的题中之义，
 * 不是四舍五入出了错。
 *
 * **配置值不走这里**：告警阈值、缩放倍数那些是用户自己敲进去的定义（页面上是 `${threshold}`、
 * `×${scale}`），原样显示才看得出「我配的是多少」—— 收成 2 位就显示成另一个数了。
 */
export function numberText(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}
