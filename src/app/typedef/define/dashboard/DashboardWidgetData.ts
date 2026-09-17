/**
 * 看板取数的结果（`POST /matrix/v1/dashboard/render/{spaceId}`）。
 *
 * 与「布局」分开是有意的：布局是**用户配置**（存在库里、可编辑、有版本号），取数是**瞬时读数**
 * （算完就丢、下次刷新全换）。放一份类型里会让「哪些字段能保存」变得要靠记忆。
 *
 * 四条纹路：
 * - **一张卡失败不牵连同屏其他人**：每张卡各自 `success` / `message`，外层没有统一的错误码。
 *   被隔离的两种失败是「这张卡的配置指向了不属于本空间的东西」与「这张卡的窗口取数炸了」——
 *   前者是权限、后者是数据，都不是整屏的错。
 * - **`value` 可能**不存在**：按小时累计的指标（如 `alarms.today`）给的是 `hourly`，
 *   由前端折出「今日」那个数（见 `home.folding`）。所以 `value` 是 `number | undefined`，
 *   卡片渲染必须区分「0」与「没有这个数」。
 * - **分组的全量下发**：`groups` 不打上限，「前 N + 其他」的截断只影响渲染（`config.limit`），
 *   后端不替前端决定看多少。
 * - 时间是**毫秒时间戳**；`from` / `to` 是**服务端解析窗口之后**的真实区间，
 *   `last: {hours: 24}` 这种相对窗口的右端因此是服务端的「现在」，必须回显。
 */

import { StatisticsBucket, StatisticsCount } from '../statistics/OverviewStatistics';

/**
 * 一张卡的取数结果。
 *
 * `data` 是 `Record<string, unknown>`（线格式如此），按类型断言成 {@link StatData} 等具体形状
 * 是**这一步**该做的事 —— 用下面三个 `xxxData()` 函数，别在模板里直接取字段：
 * 库里可能存着旧版本写的配置，取数回来的是个空对象，防御性读取总比整页报错好。
 */
export class WidgetDataItem {
  /** 对应 {@link DashboardWidget.id}。**按下标对应是错的** —— 顺序会随保存/拖拽变化 */
  id: string = '';
  /** 这张卡单独失败了。失败时 `data` 为空、`message` 是人话（英文，直接显示即可） */
  success: boolean = false;
  data: Record<string, unknown> = {};
  /** 失败原因。**服务端文案**，原样显示、不翻译（与其他接口的 `message` 同口径） */
  message?: string;
}

/** 一次取数的全部结果 */
export class DashboardWidgetData {
  spaceId: string = '';
  /** 实际生效的区间起点（毫秒） */
  from: number = 0;
  /** 实际生效的区间终点（毫秒） */
  to: number = 0;
  /** 与请求的卡片**同样顺序**，便于前端按 id 建索引后仍能原样遍历 */
  widgets: WidgetDataItem[] = [];
}

/** 统计卡的数字（`type: 'stat'`） */
export class StatData {
  /**
   * 主数字。**可能没有**：按小时累计的指标只给 {@link hourly}（`alarms.today` 就是），
   * 前端把桶折成一个数。`undefined` 与 `0` 是两件事 —— 前者是「这个指标不给直接值」，
   * 后者是「真的是 0」。
   */
  value?: number;
  /** 窗口内的整点桶（没有发生的整点也是 0）。**只有需要折数的卡片才有** */
  hourly: StatisticsBucket[] = [];
  /** 窗口右端（毫秒）。折「今日」时要拿它判断今天是哪一天 —— 不能用浏览器时间：那是**另一个钟** */
  to: number = 0;
}

/** 数据分布的片（`type: 'distribution'`） */
export class DistributionData {
  /** 全量分组，**后端已按条数降序排好**；键名是数据（设备类型段 / 点表 id / 告警文本），原样显示 */
  groups: StatisticsCount[] = [];
}

/** 曲线图的点（`type: 'line'`） */
export class LineData {
  /** 实际区间起点（毫秒）。曲线要按它画横轴，与卡片自己的窗口一致 */
  from: number = 0;
  /** 实际区间终点（毫秒） */
  to: number = 0;
  /** 整点桶，窗口内每个整点都在（缺的给 0），所以直接按序连线即可 */
  points: StatisticsBucket[] = [];
}

/**
 * 服务卡里的一行：一个字段此刻的值（`type: 'service'`）。
 *
 * `unit` / `bit` 是**服务端随数据下发的、不可翻译的结构性元数据**（`unit` 是用户填的点表数据、
 * `bit` 是结构），可翻译的解释仍留在前端 —— 位值说「开/关」由前端决定，见 §D5 与修订（十）。
 * 服务端在判归属时本来就加载了整个服务定义，顺带取这两样几乎免费，换来的是**卡片不用异步、
 * 不用备忘、不发第二个请求**去查产品规格。
 */
export class ServiceFieldRow {
  /** 字段名。**用户填的点表数据**，原样显示、不翻译 */
  field: string = '';
  /**
   * 这一轮的值。**没有这个键 = 这个字段这轮没取到值**（卡片显示 `-`）。
   * `0` 与「没有」是两件事：前者是真实读数。类型是 `unknown` —— 取值表命中时给的是描述串。
   */
  value?: unknown;
  /** 单位。**位恒为空串**（位是 0/1）。同样是用户填的，原样显示 */
  unit: string = '';
  /** 是不是一个位：位值说「开/关」（可翻译的解释，故由前端说） */
  bit: boolean = false;
}

/**
 * 服务卡的读数（`type: 'service'`）。
 *
 * **`recordedAt` 在不在就是「采过没采过」的判据**：这个方法一条影子都没有时，服务端只给
 * `functionIndex` —— 那一态卡片说「尚未采集」，而不是画一行行 `-`（后者看着像「采到了，
 * 恰好都是空值」）。
 *
 * `error` / `errorAt` 与值**可以同时存在**：影子里的 `fields` / `recordedAt` 是最后一次
 * **成功**的采集，失败时服务端一律不动。所以失败态卡片显示的是「最后一次已知读数 + 采集时间
 * + 一个失败标识」，而不是一张空卡 —— 丢掉最后的已知读数对看板来说是净损失。
 *
 * 时间是**毫秒时间戳**，且属于**整个 function**（同一张卡的字段必须来自同一个方法，§5.7），
 * 所以时间角标只有一行。
 */
export class ServiceData {
  /** 这个方法在服务定义里的序号（1 起） */
  functionIndex: number = 0;
  /** 配置的那几个字段，**按 `config.fields` 的顺序**（用户选的就是这个顺序） */
  fields: ServiceFieldRow[] = [];
  /** 最后一次**成功**采集的时刻（毫秒）；**没有就是「尚未采集」** */
  recordedAt?: number;
  /** 该方法的最后一次失败。**服务端原文，原样显示、不翻译** */
  error?: string;
  /** 那次失败发生的时刻（毫秒） */
  errorAt?: number;
}

/**
 * 设备卡的读数（`type: 'device'`）：**一台设备的一个属性**。
 *
 * 三态由两个键各在不在决定（后端就是这么编码的，见 `WidgetDataService.deviceData`）：
 * - 有 `value` —— 正常，读数是设备最后一次上报的值；
 * - 有 `error` —— 读取失败（影子元素是 `{pid, status, description}`，出错时不给值）；
 * - 都没有 —— 尚未上报。
 *
 * `value` 与 `error` **不会同时出现**（与服务卡的 `error` + 值是并存的不同：那边 `error` 说的是
 * 「这个方法的最后一次采集失败」，值仍在，所以两个都要显示）。
 *
 * **没有时间戳**：`/device/shadows` 不给上报时刻，所以卡片不显示「采集时间」——
 * 拿 render 的 `asOf` 冒充更新时刻是编数据（见方案 §5.6 与 P3 清单）。
 */
export class DeviceData {
  /** 属性的完整 pid：`<did>.<siid>.<piid>`。**后端原样回来**，前端靠它去产品规格里查名字 */
  pid: string = '';
  /** 设备型号（DeviceType URN）。**规格查不到时没有这个键**，卡片退回显示 pid 原文 */
  type?: string;
  /** 最后一次上报的值。`0` / `''` / `false` 都是**有效读数**，只有「没有这个键」才是没值 */
  value?: unknown;
  /** 读取失败的原因。**服务端原文，原样显示、不翻译** */
  error?: string;
}

// ===== 防御性读取 =====

/**
 * 从任意 JSON 值里读一个有限数。**不接受字符串数字**：线格式里数字就是数字，
 * 把 `"12"` 收下来只会掩盖后端的一次改动。
 */
function numberOf(source: Record<string, unknown>, key: string): number | undefined {
  const raw = source[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

/** 读一个字符串字段。空串**留下**（字段名/单位就是可能是空串，与「没读到」不同） */
function stringOf(source: Record<string, unknown>, key: string): string | undefined {
  const raw = source[key];
  return typeof raw === 'string' ? raw : undefined;
}

/** 读一个 `{at, count}` 数组，逐项校验 —— 一个坏点不该让整条曲线消失 */
function bucketsOf(source: Record<string, unknown>, key: string): StatisticsBucket[] {
  const raw = source[key];
  if (!Array.isArray(raw)) {
    return [];
  }
  const buckets: StatisticsBucket[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const at = numberOf(entry as Record<string, unknown>, 'at');
    const count = numberOf(entry as Record<string, unknown>, 'count');
    if (at !== undefined && count !== undefined) {
      buckets.push({ at, count });
    }
  }
  return buckets;
}

/** 把一张卡的结果读成 {@link StatData} */
export function statData(item: WidgetDataItem): StatData {
  const data = new StatData();
  data.value = numberOf(item.data, 'value');
  data.hourly = bucketsOf(item.data, 'hourly');
  data.to = numberOf(item.data, 'to') ?? 0;
  return data;
}

/** 把一张卡的结果读成 {@link DistributionData} */
export function distributionData(item: WidgetDataItem): DistributionData {
  const data = new DistributionData();
  const raw = item.data['groups'];
  if (!Array.isArray(raw)) {
    return data;
  }
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const key = record['key'];
    const count = numberOf(record, 'count');
    // 空串键是合法的（「没配点表的服务」就落在空串上），所以只挡非字符串
    if (typeof key === 'string' && count !== undefined) {
      data.groups.push({ key, count });
    }
  }
  return data;
}

/** 把一张卡的结果读成 {@link LineData} */
export function lineData(item: WidgetDataItem): LineData {
  const data = new LineData();
  data.from = numberOf(item.data, 'from') ?? 0;
  data.to = numberOf(item.data, 'to') ?? 0;
  data.points = bucketsOf(item.data, 'points');
  return data;
}

/**
 * 把一张卡的结果读成 {@link DeviceData}。
 *
 * `type` 只在**非空**时才留下：空串与「没有这个键」在用途上是同一件事
 * （都查不到产品规格），留一个空串只会让卡片多一条「要不要判空」的分支。
 */
export function deviceData(item: WidgetDataItem): DeviceData {
  const data = new DeviceData();
  data.pid = stringOf(item.data, 'pid') ?? '';
  const type = stringOf(item.data, 'type');
  if (type) {
    data.type = type;
  }
  const value = item.data['value'];
  if (value !== null && value !== undefined) {
    data.value = value;
  }
  data.error = stringOf(item.data, 'error');
  return data;
}

/** 把一张卡的结果读成 {@link ServiceData} */
export function serviceData(item: WidgetDataItem): ServiceData {
  const data = new ServiceData();
  data.functionIndex = numberOf(item.data, 'functionIndex') ?? 0;
  data.recordedAt = numberOf(item.data, 'recordedAt');
  data.error = stringOf(item.data, 'error');
  data.errorAt = numberOf(item.data, 'errorAt');
  data.fields = fieldRowsOf(item.data['fields']);
  return data;
}

/**
 * 读 `fields` 数组，逐项校验。
 *
 * `value` 那一栏**只在真有值时才赋**：服务端这一轮没取到这个字段就不带这个键，
 * 而 `null` 也归到「没有」—— {@link ServiceFieldRow.value} 的 `undefined` 是
 * 「显示 `-`」这一个意思，不该有两种写法。`0` / `''` / `false` 都是**有效读数**，
 * 一律留下（`in` 判断只看键在不在，不看真假）。
 */
function fieldRowsOf(raw: unknown): ServiceFieldRow[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const rows: ServiceFieldRow[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const field = record['field'];
    // 没有字段名的一行渲染不出任何东西（一个没有名字的数不是读数）
    if (typeof field !== 'string' || field.length === 0) {
      continue;
    }
    const row = new ServiceFieldRow();
    row.field = field;
    const value = record['value'];
    if (value !== null && value !== undefined) {
      row.value = value;
    }
    row.unit = stringOf(record, 'unit') ?? '';
    row.bit = record['bit'] === true;
    rows.push(row);
  }
  return rows;
}
