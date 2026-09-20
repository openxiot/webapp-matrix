import {
  ModbusConfig,
  modbusConfigLabel,
} from '@app/typedef/define/modbus/Modbus';
import {
  StatisticsBucket,
  StatisticsCount,
} from '@app/typedef/define/statistics/OverviewStatistics';
import {
  StatData,
  DistributionData,
  LineData,
} from '@app/typedef/define/dashboard/WebDashboardWidgetData';
import { WindowConfig } from '@app/typedef/define/dashboard/WebDashboardLayout';

/**
 * 取数结果的折算（纯函数，无注入、无翻译器）。
 *
 * 这一层只做两件事，**都不重新统计**：服务端给什么数就是什么数。
 * 1. 把「这个指标」翻成一个数字（{@link metricValue}）—— 其中「今日告警」要在 `hourly` 上求和；
 * 2. 把后端的聚合结果折成图表要的 `{name, value}`（{@link distributionPoints} 等）。
 *
 * 三条口径，每条都对应一个**错了不报错、只会显示一个假数字**的坑：
 * - **「今日」用服务端的 `to` 算，不用浏览器时间**：`last: {hours: 24}` 的右端是**服务端**的
 *   「现在」，客户端的钟可能差几分钟、甚至差一个时区。用浏览器时间划「今天 00:00」，
 *   在跨时区或钟不准时会算进不该算的桶，而数字看着完全正常。
 * - **缺数据不等于 0**：`value` 没下发（`alarms.today` 这类只给 `hourly`）与 `value: 0`
 *   是两件事。前者显示 `-`，后者显示 `0`。
 * - **名字一律原样显示**：设备类型段、告警文本是服务端数据。可翻译的只有卡片标题（页面文案），
 *   那在模板层翻；本文件唯一收的翻译输入是**空点表**与**「其他」**两个词的文案，
 *   由调用方传进来（见 §7.5：option 构造函数不接翻译器）。
 */

/** 一小时（毫秒） */
export const HOUR = 3_600_000;

/** 图表的一片。`name` 是**服务端数据**（或拼出来的点表名），原样显示 */
export interface ChartPoint {
  name: string;
  value: number;
}

// ===== 时间 =====

/**
 * 本地当日 00:00 的毫秒时间戳。
 *
 * 用**本地**时区（不是 UTC）：用户说的「今日」是他自己日历上的今天。
 */
export function dayStart(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * 桶起点不早于 `since` 的桶计数之和。
 *
 * 桶起点**正好等于** 00:00 的那一桶算今天（`>=`）：它是 00:00~01:00 这一小时的数，
 * 整点归属当天。写成 `>` 会每天少算第一个小时的告警。
 */
export function sumSince(hourly: StatisticsBucket[], since: number): number {
  return (hourly ?? []).reduce((sum, bucket) => (bucket.at >= since ? sum + bucket.count : sum), 0);
}

/**
 * 整点桶的坐标轴标签。
 *
 * 窗口只有一个自然日的跨度时是 `HH:00`（24 个连续整点里每个「几点」正好出现一次，
 * 不重复）；**跨天时补上日期** `MM-DD HH:00` —— 一周的告警曲线用 `HH:00` 会出现七个
 * 一模一样的「08:00」，看图的人分不清哪个是哪天。
 */
export function hourLabels(buckets: StatisticsBucket[]): string[] {
  const rows = buckets ?? [];
  if (rows.length === 0) {
    return [];
  }
  const spansDays = dayStart(rows[rows.length - 1].at) !== dayStart(rows[0].at);
  return rows.map((bucket) => {
    const at = new Date(bucket.at);
    const hour = `${String(at.getHours()).padStart(2, '0')}:00`;
    if (!spansDays) {
      return hour;
    }
    const month = String(at.getMonth() + 1).padStart(2, '0');
    const day = String(at.getDate()).padStart(2, '0');
    return `${month}-${day} ${hour}`;
  });
}

/**
 * 窗口的显示口径。
 *
 * 相对窗口是一条**词条 + 参数**（「最近 24 小时」），交给调用方翻译（key 就是词典里的中文原文，
 * 与其他页面同口径）；绝对窗口给两个**毫秒时间戳**，由模板的 `date` 管道格式化 ——
 * 本函数不认识 i18n，也不该替模板决定日期怎么写（那是 `DATE_PIPE_DEFAULT_OPTIONS` 的事）。
 */
export type WindowLabel =
  | { kind: 'last'; key: string; hours: number }
  | { kind: 'range'; from: number; to: number };

/** 无窗口的卡片（`devices.total` 这类）返回 `undefined`：卡片副标题就不显示窗口 */
export function windowLabel(window?: WindowConfig): WindowLabel | undefined {
  if (!window) {
    return undefined;
  }
  if (window.kind === 'last') {
    return { kind: 'last', key: '最近 {{hours}} 小时', hours: window.hours };
  }
  return { kind: 'range', from: window.from, to: window.to };
}

/**
 * 把一个窗口算成绝对区间。
 *
 * **看板渲染不经过这里**：相对窗口（`kind: 'last'`）由**服务端**在 render 时按它的「现在」
 * 解析，`from` / `to` 从响应里读（见 `WebDashboardWidgetData`）。本函数只有一个用途：
 * 编辑器里用户从「最近 N 小时」切到「绝对区间」时，给一对合理的初值，
 * 免得他面对两个空输入框。
 */
export function absoluteWindow(window: WindowConfig | undefined, now: number): { from: number; to: number } {
  if (!window) {
    return { from: now - 24 * HOUR, to: now };
  }
  if (window.kind === 'range') {
    return { from: window.from, to: window.to };
  }
  return { from: now - window.hours * HOUR, to: now };
}

// ===== 统计卡 =====

/** 不需要窗口的指标：直接取服务端算好的 `value` */
const DIRECT_METRICS = new Set([
  'devices.total',
  'devices.online',
  'services.total',
  'alarms.window',
  'failures.total',
]);

/**
 * 一个 metric 的数字。**算不出来时返回 `undefined`，绝不返回 0**。
 *
 * 只有 `alarms.today` 是前端折出来的（在 `hourly` 上求和）：服务端按小时下发，
 * 它不知道用户的「今天」从几点开始（见 `dayStart`）。其余指标服务端已经算好。
 *
 * `to` 为 0 说明后端没给窗口（`alarms.today` 恒带窗口），此时给 `undefined` ——
 * 一份没有 `hourly`、没有 `to` 的响应折出「今日告警：0」会是一个彻头彻尾的假数字。
 */
export function metricValue(metric: string | undefined, data: StatData): number | undefined {
  if (!metric) {
    return undefined;
  }
  if (metric === 'alarms.today') {
    if (!data.to) {
      return undefined;
    }
    return sumSince(data.hourly, dayStart(data.to));
  }
  if (DIRECT_METRICS.has(metric)) {
    return data.value;
  }
  return undefined;
}

/** 曲线的点与两端（`line` 卡片用，`alarmCount` 走 `overview.alarms.hourly`） */
export function linePoints(data: LineData): { labels: string[]; counts: number[] } {
  return {
    labels: hourLabels(data.points),
    counts: (data.points ?? []).map((bucket) => bucket.count),
  };
}

// ===== 分布 =====

/**
 * 一份分组折成图表数据：键就是片名，**原样显示**。
 *
 * 设备类型分布（按 URN 类型段）与告警类型分布（按告警文本）都用它 —— 两份分组的线格式一样，
 * 差别只在键的含义，而含义不影响折算。`failureType` 同此。
 */
export function distributionPoints(rows: StatisticsCount[]): ChartPoint[] {
  return (rows ?? []).map((row) => ({ name: row.key, value: row.count }));
}

/**
 * 服务类型分布：把 `configId` 解成点表的显示名，再折成图表数据。
 *
 * 两件必须做的事：
 * - **合并同名**：后端按 `configId` 分组，而显示名是「厂家 型号」—— 两分量表可能拼出同一个名字，
 *   不合并的话饼上会出现两片一模一样的片，看图的人无从分辨。合并后重新排序（条数降序、
 *   同数按名字升序），与后端给 `byType` / `byText` 的排序口径一致，看板几张饼同规矩。
 * - **空 `configId` 归到 `undefinedLabel`**：那是「这个服务没配点表」，与「点表叫这个名字」
 *   是两回事（见 {@link modbusConfigLabel}）。至于**查不到的点表**，`modbusConfigLabel`
 *   拼出的是 id 本身 —— 与服务清单页那一列同口径，比一个含糊的「未定义」更能说明问题。
 */
export function serviceTypePoints(
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

/** 名字升序：按码位比较（与后端 `String.compareTo` 同口径，不用 `localeCompare` —— 那会随语言变序） */
function compareName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 按 `dimension` 折出图表数据。`serviceType` 要一份点表清单，其余三份直接折。
 *
 * 注意 `dimension` 不认识时给**空数组**而不是把 `rows` 原样折出去：那意味着库里存着一个
 * 将来某版本写的维度，而它对应的 `groups` 键是什么这里无从知道 —— 空饼比一张片名是
 * `undefined` 的饼容易解释。
 */
export function distributionFor(
  dimension: string | undefined,
  data: DistributionData,
  configs: ModbusConfig[],
  undefinedLabel: string,
): ChartPoint[] {
  switch (dimension) {
    case 'serviceType':
      return serviceTypePoints(data.groups, configs, undefinedLabel);
    case 'deviceType':
    case 'alarmType':
    case 'failureType':
      return distributionPoints(data.groups);
    default:
      return [];
  }
}

/**
 * 「前 N + 其他」：显示层截断。
 *
 * 后端**全量下发**、不打上限，所以切 `limit` 不必重新请求（§5.5）。`otherLabel`
 * 由调用方翻译后传进来 —— 本文件不认识 i18n。
 *
 * 边界：`limit` 未设或 ≥ 片数时原样返回（**不补一片空的「其他」**）；正好等于片数时也一样
 * ——「前 3 + 其他 0」那种片是纯噪音。
 */
export function truncatePoints(points: ChartPoint[], limit: number | undefined, otherLabel: string): ChartPoint[] {
  const rows = points ?? [];
  if (!limit || limit <= 0 || rows.length <= limit) {
    return rows;
  }
  const head = rows.slice(0, limit);
  const rest = rows.slice(limit).reduce((sum, row) => sum + row.value, 0);
  return [...head, { name: otherLabel, value: rest }];
}
