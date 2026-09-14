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
 * 一条采集失败。同一条消息（message 相同）**只记第一次**，故这列的是「错误首次出现的时刻」，
 * 不是每次失败都有一行 —— 与曲线上的竖线含义一致。
 */
export class ModbusHistoryFailure {
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
 */
export class ModbusHistoryFailures {
  serviceId: string = '';
  from: number = 0;
  to: number = 0;
  limit: number = 0;
  /** true = 窗口内还有更早的失败没取回来（items 只有最近 limit 条） */
  truncated: boolean = false;
  /** 时间**倒序**（最新的在前） */
  items: ModbusHistoryFailure[] = [];
  summary: ModbusFailureSummary = new ModbusFailureSummary();
}
