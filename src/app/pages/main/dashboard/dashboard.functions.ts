import { ModbusConfig, modbusConfigLabel } from '../../../typedef/define/modbus/Modbus';
import {
  StatisticsBucket,
  StatisticsCount,
} from '../../../typedef/define/statistics/OverviewStatistics';

/**
 * 数据看板的取数与折算（纯函数，与渲染无关）。
 *
 * 这一层只做两件事：算**时间窗口**（后端只收 from/to，没有「最近 N 小时」这类参数），
 * 把后端的聚合结果折成图表要的 `{name, value}`。所有数字都是服务端算好的，这里不重新统计。
 *
 * 三条口径：
 * - **名字一律原样显示**：设备类型段、告警文本是服务端数据，不翻译（点表名是前端用
 *   {@link modbusConfigLabel} 拼的，拼出来同样是数据）；
 * - **窗口与「今日」同源**：窗口恒为「当前整点往前数 24 个整点桶」，而 `from ≤ 今天 00:00`
 *   恒成立（`hourStart ≥ 今天 00:00 + 23h`），故「今日」直接在这份 `hourly` 上求和，
 *   不必再发一次请求；
 * - **缺数据不等于 0**：这里不做「取不到就给 0」的兜底 —— 空数组是合法的空分布，
 *   请求失败由调用方走错误态。
 */

/** 一小时（毫秒） */
export const HOUR = 3_600_000;

/** 告警曲线与三张分布共用的窗口长度：24 个整点桶 */
const WINDOW_HOURS = 24;

/** 图表的一片。`name` 是**服务端数据**，原样显示 */
export interface ChartPoint {
  name: string;
  value: number;
}

/**
 * 近 24 小时整点窗口：`[当前整点 - 23h, now]`。
 *
 * 终点取 `now` 而不是下一个整点：当前这一小时是**部分桶**，它的数只统计到此刻为止 ——
 * 曲线右端的数随时间往上爬，与卡片上的「今日」同一份数据。
 */
export function alarmWindow(now: number): { from: number; to: number } {
  const hourStart = Math.floor(now / HOUR) * HOUR;
  return { from: hourStart - (WINDOW_HOURS - 1) * HOUR, to: now };
}

/**
 * 本地当日 00:00 的毫秒时间戳。
 *
 * 用本地时区（不是 UTC）：用户说的「今日」是他自己日历上的今天。
 */
export function dayStart(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * 桶起点不早于 `since` 的桶计数之和。
 *
 * 「今日告警 / 今日异常」= `sumSince(hourly, dayStart(to))`。桶起点正好等于今天 00:00 的那一桶
 * **算今天**（`>=`）：那是 00:00~01:00 这一小时的数，整点归属当天。
 */
export function sumSince(hourly: StatisticsBucket[], since: number): number {
  return (hourly ?? []).reduce((sum, bucket) => (bucket.at >= since ? sum + bucket.count : sum), 0);
}

/**
 * 每个桶的本地整点标签 `HH:00`。
 *
 * 窗口是 24 个连续整点，每个「几点」正好出现一次，故标签不必带日期也不会重复。
 */
export function hourLabels(hourly: StatisticsBucket[]): string[] {
  return (hourly ?? []).map((bucket) => {
    const hour = new Date(bucket.at).getHours();
    return `${String(hour).padStart(2, '0')}:00`;
  });
}

/**
 * 一份分组直接折成图表数据：键就是片名，**原样显示**。
 *
 * 设备类型分布（按 URN 类型段）与告警类型分布（按告警文本）都用它 —— 两份分组的线格式一样
 * （`{key, count}`），差别只在键的含义，而含义不影响折算。
 */
export function distributionData(rows: StatisticsCount[]): ChartPoint[] {
  return (rows ?? []).map((row) => ({ name: row.key, value: row.count }));
}

/**
 * 服务类型分布：把 `configId` 解成点表的显示名，再折成图表数据。
 *
 * 两件必须做的事：
 * - **合并同名**：后端按 `configId` 分组，而显示名是「厂家 型号」—— 两分量表可能拼出同一个名字，
 *   不合并的话饼上会出现两片一模一样的片，看图的人无从分辨。合并后重新排序（条数降序、
 *   同数按名字升序），与后端给 `byType` / `byText` 的排序口径一致，看板三张饼同规矩。
 * - **空 configId 归到 `undefinedLabel`**：那是「这个服务没配点表」，与「点表叫这个名字」
 *   是两回事（见 {@link modbusConfigLabel}）。至于**查不到的点表**，拼出的是 id 本身
 *   —— 与服务清单页那一列同口径，比一个含糊的「未定义」更能说明问题。
 */
export function serviceTypeData(
  rows: StatisticsCount[],
  configs: ModbusConfig[],
  undefinedLabel: string,
): ChartPoint[] {
  const merged = new Map<string, number>();
  for (const row of rows ?? []) {
    const name = modbusConfigLabel(configs, row.key) || undefinedLabel;
    merged.set(name, (merged.get(name) ?? 0) + row.count);
  }
  return [...merged.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || compareName(a.name, b.name));
}

/** 名字升序：按码位比较（与后端 `String.compareTo` 同口径，不用 localeCompare —— 那会随语言变序） */
function compareName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
