/**
 * Modbus 采集历史：服务端按各方法的 interval 周期自动调用依赖设备，把读到的字段值落库，
 * 本文件对应后端 `cc.openxiot.matrix.api.modbus.history.ModbusHistoryResource`
 * （`/matrix/v1/modbus/history`）的三种返回（见 service-matrix 的 Modbus-History.md）。
 *
 * 三个接口的分工：
 * - {@link ModbusHistoryCurrent}：每个方法**最后一次成功采到的值**（服务详情页那种快照，只是多了采集时刻与最近错误）；
 * - {@link ModbusHistoryRange}：**一个方法的某一个字段**在时间窗内的序列（曲线与表格都取这里）；
 * - {@link ModbusHistoryFailures}：采集失败明细 + 按类型/远端码的汇总（失败不进上面两份数据）。
 *
 * 时间一律是**毫秒时间戳**（后端 `Date.getTime()`），没有「最近 N 分钟」这种窗口参数，
 * 取数必须自己算 from/to。
 */

/**
 * 采集到的一个值：数值（含缩放后的浮点）、取值表命中的描述字符串、或位区的 0/1。
 * 后端声明成 `Object`，故这里只能是 unknown，展示前要按类型分支。
 */
export type ModbusValue = unknown;

/**
 * 一个方法的当前状态（`/current` 里的一项）：最后一次**成功**采集的字段值 + 那一刻，
 * 以及最近一次失败（成功过一次后仍是失败态时才有 lastError/errorAt）。
 */
export class ModbusHistoryFunctionState {
  /** 方法序号（对应服务定义里 functions[].index） */
  functionIndex: number = 0;
  /** 字段名 → 最后一次成功采到的值（键即应答字段名，含位区展开出来的位名） */
  fields: Record<string, ModbusValue> = {};
  /** 最后一次成功采集的时刻（毫秒）；一次都没成功过则没有 */
  recordedAt?: number;
  /** 最近一次失败的消息；采集正常则没有 */
  lastError?: string;
  /** 当前这轮失败**首次**发生的时刻（同一条错误只记第一次） */
  errorAt?: number;
}

/** 整个服务的当前值快照（GET /history/current/{spaceId}/{serviceId}） */
export class ModbusHistoryCurrent {
  serviceId: string = '';
  /** 有采集状态的方法；没配轮询或从未采过的方法不在其中 */
  functions: ModbusHistoryFunctionState[] = [];
}

/**
 * 一条原始采样：值相对上一次**变了**（或到了 keep-alive 时限）才落库，
 * 故序列是稀疏的，相邻两点的间隔等于「值保持不变的时长」，不代表没在采集。
 */
export class ModbusHistorySample {
  /** 采样时刻（毫秒） */
  at: number = 0;
  value?: ModbusValue;
  /** true = 值没变、按 keep-alive 时限补记的一条（后端只在为 true 时下发这个键） */
  keepalive?: boolean;
}

/**
 * 降采样后的一个时间桶（原始样本数超过 maxPoints 时，接口改发桶而非原始点）。
 * `first`/`last` 是桶首尾的**状态值**（可能是字符串），`min`/`max`/`avg` 只对数值有意义
 * —— 非数值字段三个统计量都是 null，但键仍然在。
 */
export class ModbusHistoryBucket {
  /** 桶起点（毫秒，含） */
  at: number = 0;
  /** 桶终点（毫秒，不含）：与下一个桶的 at 相接，最后一个桶到 to 为止 */
  until: number = 0;
  /** 桶内原始样本数 */
  count: number = 0;
  first?: ModbusValue;
  last?: ModbusValue;
  min: number | null = null;
  max: number | null = null;
  /** 时间加权平均（min ≤ avg ≤ max） */
  avg: number | null = null;
}

/** 序列上的一点：原始样本或降采样桶，由 {@link ModbusHistoryRange.downsampled} 区分 */
export type ModbusHistoryPoint = ModbusHistorySample | ModbusHistoryBucket;

/**
 * 一个方法的某一个字段在时间窗内的序列
 * （GET /history/range/{spaceId}?serviceId&functionIndex&field&from&to&maxPoints）。
 */
export class ModbusHistoryRange {
  serviceId: string = '';
  functionIndex: number = 0;
  field: string = '';
  /** 实际生效的窗口（毫秒，左闭右开） */
  from: number = 0;
  to: number = 0;
  /** 实际生效的最大点数（请求值被后端夹到 [1, 2000]） */
  maxPoints: number = 0;
  /** true = points 是降采样桶；false = 原始样本 */
  downsampled: boolean = false;
  /** 窗口内的原始样本总数（两种模式下都有，降采样时大于 points.length） */
  total: number = 0;
  points: ModbusHistoryPoint[] = [];
  /**
   * 窗口**之前**最近的一条样本：窗口内第一条的变化基准，用来把曲线从 from 那一刻接上
   * （没有更早的样本时后端整个键都不下发，故这里是 undefined）。原始样本形态。
   */
  carryIn?: ModbusHistorySample;
}

/** 采集失败的类型（后端 ModbusFailureType 的枚举名，线上就是这些字符串） */
export const MODBUS_FAILURE_TYPES = [
  'NO_RESPONSE',
  'SLAVE_EXCEPTION',
  'DEVICE_ERROR',
  'CRC_MISMATCH',
  'FRAME_MISMATCH',
  'INVALID_FRAME',
  'FIELD_DEFINITION_ERROR',
  'CONFIG_ERROR',
  'TRANSPORT_ERROR',
  'UNKNOWN',
] as const;

/**
 * 枚举名 → 界面标签，标签同时就是词典里的键（本仓库的键即中文原文），页面再翻成当前语言。
 *
 * <p>能复用既有键的就复用（`异常应答` / `方法调用失败` 都已经在别的页面上翻过一遍），
 * 只给缺的几个补新键 —— 同一件事在两种语境下用两个词，是最容易翻岔的地方。</p>
 *
 * <p>兜底那类用的是 `未知失败` 而不是词典里现成的 `未定义`：后者会让人以为「少配了一处定义」
 * 而去翻服务定义，可它其实只是「没归入以上任何一类」。宁可说不知道，也不给一个把人引偏的分类。</p>
 *
 * <p>{@code remoteCode} 不在这里翻：只有从站异常应答那个码是 Modbus 异常码（1/2/3/4…，
 * 词典里已有一条 <code>01 非法功能码 / 02 非法数据地址 …</code> 的对照），依赖设备报错的
 * 远端码是 DTU 厂商自己的状态码，我们并不知道它的含义，猜着翻反而会误导排查。</p>
 */
export const MODBUS_FAILURE_LABELS: Record<string, string> = {
  NO_RESPONSE: '设备无应答',
  SLAVE_EXCEPTION: '异常应答',
  DEVICE_ERROR: '依赖设备报错',
  CRC_MISMATCH: 'CRC 校验失败',
  FRAME_MISMATCH: '报文长度不符',
  INVALID_FRAME: '报文非法',
  FIELD_DEFINITION_ERROR: '字段定义错误',
  CONFIG_ERROR: '服务配置错误',
  TRANSPORT_ERROR: '方法调用失败',
  UNKNOWN: '未知失败',
};

/**
 * 失败类型（+ 远端码）→ 界面标签：先按 {@link MODBUS_FAILURE_LABELS} 翻成当前语言，
 * 有远端码就缀在后面（`异常应答 (2)`）。枚举名本身不在这里露脸，页面各按各的位置附上
 * —— 排查时要拿它去搜后端日志，得留在明面上，但那是版式的事。
 *
 * <p>`type` 缺失（老数据可能没有）给 `-`；没收录的枚举名原样给出，后端加新类型时不至于空白。</p>
 *
 * <p>翻译函数由调用方传进来：本文件是纯类型定义、不认识 i18n 服务，而「标签怎么拼」这件事
 * 服务级（device.service.history）与项目级（history）两个页面必须一致 —— 各写一套迟早会走样。
 * 又因为 ngx-translate 的 instant 不是响应式的，页面还得各自把它挂在语言变化信号上触发重算。</p>
 */
export function modbusFailureLabel(
  type: string | undefined | null,
  remoteCode: number | null | undefined,
  translate: (key: string) => string,
): string {
  if (!type) {
    return '-';
  }
  const key = MODBUS_FAILURE_LABELS[type];
  const label = key ? translate(key) : type;
  return remoteCode != null ? `${label} (${remoteCode})` : label;
}

/**
 * 采集到的一个值的展示文案。
 *
 * **值可能不是数字**：取值表命中时字段值直接是描述串，位是 0/1，某些点表给的是字符串。
 * 所以这不是「格式化数字」而是一次类型分派：数值收一收浮点误差、对象退化成 JSON、
 * `null` / `undefined` 给 `-`。
 *
 * 「`null` 说 `-`」与「`0` 说 `0`」必须分得开 —— 后者是真实读数，前者是这一轮没采到。
 *
 * 放在本文件（而不是某个页面里）：历史表格、服务卡片、将来的字段曲线都要说同一种话，
 * 各写一套迟早会走样 —— 与 {@link modbusFailureLabel} 同一个理由。
 */
export function modbusValueText(value: ModbusValue): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'number') {
    return modbusNumberText(value);
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** 数值文案：整数不带小数点，浮点收到 4 位（`0.30000000000000004` → `0.3`） */
export function modbusNumberText(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

/**
 * 一条采集失败。同一条消息（message 相同）**只记第一次**，故这列的是「错误首次出现的时刻」，
 * 不是每次失败都有一行 —— 与曲线上的竖线含义一致。
 */
export class ModbusHistoryFailure {
  /**
   * 这条失败属于哪个服务。按服务查时与响应顶层的 `serviceId` 重复；**空间级查询（不传 serviceId）
   * 时是唯一的归属依据** —— 那种查法回来的清单里混着多个服务的失败，表格的 track 与名称列都得靠它。
   */
  serviceId?: string;
  functionIndex: number = 0;
  /** {@link MODBUS_FAILURE_TYPES} 之一；老数据可能没有 */
  type?: string;
  /** 从站异常码 / 依赖设备返回的远端码；只有这两类失败有 */
  remoteCode?: number;
  message: string = '';
  /** 首次出现的时刻（毫秒） */
  at: number = 0;
}

/** 按类型汇总的一项 */
export class ModbusFailureTypeCount {
  type: string = '';
  count: number = 0;
  /** 该类型最近一次出现的时刻 */
  lastAt: number = 0;
}

/** 按远端码汇总的一项 */
export class ModbusFailureCodeCount {
  remoteCode: number = 0;
  count: number = 0;
  lastAt: number = 0;
}

/** 失败汇总：只统计**本次返回的这批 items**，要连着 truncated 一起读 */
export class ModbusFailureSummary {
  total: number = 0;
  byType: ModbusFailureTypeCount[] = [];
  byRemoteCode: ModbusFailureCodeCount[] = [];
}

/**
 * 采集失败清单
 * （GET /history/failures/{spaceId}?serviceId&functionIndex&type&from&to&limit）。
 *
 * <p>`serviceId` 不传 = **整个空间**：后端把空间下所有服务的失败合成一条时间倒序的清单，
 * 响应里就没有顶层 `serviceId` 这个键（每条 item 自带一个，见 {@link ModbusHistoryFailure.serviceId}），
 * 故这里它是可选的。`limit` 与 `truncated` 也跟着变成**整份清单**的口径，而不是某个服务的。</p>
 */
export class ModbusHistoryFailures {
  /** 查的是哪个服务；空间级查询时没有这个键 */
  serviceId?: string;
  from: number = 0;
  to: number = 0;
  limit: number = 0;
  /** true = 窗口内还有更早的失败没取回来（items 只有最近 limit 条） */
  truncated: boolean = false;
  /** 时间**倒序**（最新的在前） */
  items: ModbusHistoryFailure[] = [];
  summary: ModbusFailureSummary = new ModbusFailureSummary();
}
