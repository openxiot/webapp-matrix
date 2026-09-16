/**
 * Modbus 阈值告警：读方法的出值越过阈值时服务端记下的一条事件
 * （对应后端 `cc.openxiot.matrix.api.modbus.alarm.ModbusAlarmResource`，
 * `/matrix/v1/modbus/alarm`；见 service-matrix 的 Modbus-Alarm.md）。
 *
 * 与采集历史（`ModbusHistory.ts`）的分工：那边记的是**采到什么**，这边记的是**值不对**。
 * 与采集失败（`ModbusHistoryFailure`）也不同：那是「没采到」，这是「采到了但越限」。
 *
 * 三条与其他接口不同的口径：
 * - 每条告警带自己的 `id` —— 它有**逐行动作**（点「处理」写回执），历史行没有；
 * - 一条告警带**触发那一刻的定义快照**（`compare` / `threshold` / `state` / `level` / `text` / `unit`）：
 *   定义是活的、行是不可变的历史，列表里的「触发条件」直接读快照而不是当前点表；
 * - `text` / `field` / `state` / `unit` / `sample` 都是**数据**（用户填的或点表里的），
 *   页面**原样显示、永不翻译**（见 AGENTS.md 的 i18n 一节）。
 *
 * 时间一律是**毫秒时间戳**（后端 `Date.getTime()`），与其他 Modbus 接口同口径。
 */
import { ModbusPerson } from './Modbus';
import { ModbusValue } from './ModbusHistory';

/**
 * 告警级别（后端 `ModbusAlarmPolicy.LEVELS`，线上就是这些字符串）。
 *
 * 三级 + 分级汇总：列表可按级别筛，汇总卡按级别分布。取值顺序即「由轻到重」，
 * 页面的下拉与汇总卡按这个顺序排，不另排一遍。
 */
export const MODBUS_ALARM_LEVELS = ['INFO', 'WARN', 'CRITICAL'] as const;

/**
 * 级别 → 界面标签，标签同时就是词典里的键（本仓库的键即中文原文），页面再翻成当前语言。
 *
 * 用的是「提示 / 警告 / 严重」而不是「信息 / 警告 / 错误」：这三个词描述的是**要不要人管**，
 * 而不是技术上的严重度分级 —— 看告警页的人要的正是这个判断。
 */
export const MODBUS_ALARM_LEVEL_LABELS: Record<string, string> = {
  INFO: '提示',
  WARN: '警告',
  CRITICAL: '严重',
};

/**
 * 比较方式（后端 `ModbusAlarmPolicy.OPERATORS`，线上是**符号**）：`>` `>=` `<` `<=` `=`。
 *
 * 白名单用符号而不是 `GT`/`GTE` 之类的名字：符号语言中立、与需求原话一致、日志与响应里回显无歧义；
 * 「超过 / 达到」那些**词**是页面自己的文案，进词典（见下面那份对照），符号本身不翻译。
 */
export const MODBUS_ALARM_OPERATORS = ['>', '>=', '<', '<=', '='] as const;

/**
 * 比较符号 → 界面标签（词典键）。这份对照**是中文原文**，因为词典的键就是中文原文；
 * 翻译时按当前语言取，符号本身在各语言的译文里都是同一个词（`大于`/`大于等于` 之类）。
 *
 * 五种比较方式里 `=` 单独说一句：它是给「取值表命名的状态」与「位 0/1」用的，
 * 数值字段也能配（比一个确定的数），只是那种用法少见。
 */
export const MODBUS_ALARM_OPERATOR_LABELS: Record<string, string> = {
  '>': '超过',
  '>=': '达到',
  '<': '低于',
  '<=': '低于等于',
  '=': '等于',
};

/**
 * 比较方式的界面标签：没收录的符号**原样给出**（后端加了新的比较方式时不至于空白，
 * 与 `modbusFailureLabel` 同一条兜底）。
 *
 * 翻译函数由调用方传入：本文件是纯类型定义、不认识 i18n 服务，而「标签怎么拼」这件事
 * 告警页与服务详情页必须一致 —— 各写一套迟早会走样。又因为 ngx-translate 的 `instant`
 * 不是响应式的，页面还得各自把它挂在语言变化信号上触发重算（与 `modbusFailureLabel` 同契约）。
 */
export function modbusAlarmOperatorLabel(
  compare: string | undefined | null,
  translate: (key: string) => string,
): string {
  if (!compare) {
    return '';
  }
  const key = MODBUS_ALARM_OPERATOR_LABELS[compare];
  return key ? translate(key) : compare;
}

/** 级别标签：没收录的枚举名原样给出（老数据 / 后端加了新级别时不至于空白）。 */
export function modbusAlarmLevelLabel(
  level: string | undefined | null,
  translate: (key: string) => string,
): string {
  if (!level) {
    return '';
  }
  const key = MODBUS_ALARM_LEVEL_LABELS[level];
  return key ? translate(key) : level;
}

/**
 * 一条告警**是怎么关掉的**（后端 `ModbusServiceAlarm` 的 `CLOSE_*` 常量，线上就是这些字符串）。
 *
 * 四个值互斥且覆盖完整，一条开着的行只可能从其中一条路出去：
 * - `VALUE` 值回到了不命中任何规则的地方（真·恢复正常）；
 * - `DEFINITION` 定义不再覆盖这个键：出值被删、规则被删、或该出值所有规则都被停用；
 * - `SUPERSEDED` 同一个出值上换了一条规则生效 —— **升级与降级都算**。
 *   降级（严重那条关了、警告那条接管）尤其不能用 `VALUE` 表达：值仍然越限，记「值恢复」是谎话。
 * - `HANDLED` 这条已经被人**处理过**、而那条规则**还在命中**：处理的意思是「我知道了，以后还有
 *   越线再提醒我」，所以关掉它、同时另开一条未处理的新行。值恢复正常时走的是 `VALUE`（那才是实情），
 *   换了规则时走的是 `SUPERSEDED`（更具体的原因），两者都轮不到它。
 *
 * 它与 {@link MODBUS_ALARM_LEVELS} / {@link MODBUS_ALARM_OPERATORS} 一样是**闭集枚举**，
 * 故照那两份的口径给译文；原始的枚举名仍留在页面的 `title` 上（排查时拿它搜后端日志）。
 */
export const MODBUS_ALARM_CLOSE_LABELS: Record<string, string> = {
  VALUE: '值恢复',
  DEFINITION: '定义变更',
  SUPERSEDED: '被取代',
  HANDLED: '处理后再报',
};

/** 关闭原因标签：没收录的枚举名原样给出（老数据 / 后端加了新原因时不至于空白）。 */
export function modbusAlarmCloseLabel(
  closeType: string | undefined | null,
  translate: (key: string) => string,
): string {
  if (!closeType) {
    return '';
  }
  const key = MODBUS_ALARM_CLOSE_LABELS[closeType];
  return key ? translate(key) : closeType;
}

/**
 * 「触发条件」那一列的文字：比较方式 + 阈值/状态 + 单位，如 `超过 80℃`、`等于 制冷`。
 *
 * 入参是**行的形状**而不是某个具体类：告警行把快照摊在顶层（`compare`/`threshold`/`state`/`unit`），
 * 而服务定义里的配置挂在字段上、没有 `unit`（单位是字段的属性）—— 两处都要能算这个串。
 *
 * 单位原样缀在数值后面（**不翻译**，它是点表里的数据）；`=` 比状态时不缀单位（状态是取值表的描述、
 * 与单位无关）。`compare` 缺失（老数据）时只给阈值，不硬编一个比较方式上去。
 */
export function modbusAlarmCondition(
  alarm: {
    compare?: string | null;
    threshold?: number | null;
    state?: string | null;
    unit?: string | null;
  },
  translate: (key: string) => string,
): string {
  const operator = modbusAlarmOperatorLabel(alarm?.compare, translate);
  const target =
    alarm?.threshold != null
      ? `${alarm.threshold}${alarm.unit ? alarm.unit : ''}`
      : (alarm?.state ?? '');

  return [operator, target].filter((part) => part !== '').join(' ');
}

/**
 * 生成一条告警规则的 `id`（见 `ModbusService.ts` 的 `ModbusServiceFieldAlarm.id`）。
 *
 * **刻意不用 `crypto.randomUUID()`**：那个 API 只在安全上下文（https / localhost）存在，
 * 局域网 http 部署下 `crypto.randomUUID` 是 `undefined`，一开告警开关就抛异常。
 * 这里要的只是「同一个出值的那几条规则里不重名」，而规则条数上限是 8 ——
 * 时间戳（36 进制）加 6 位随机（36 进制，约 20 亿种）绰绰有余，长度约 15、远低于后端 64 的上限。
 *
 * 只保证「够用」，不保证全局唯一：它的作用域本来就是**一组规则**（后端也只在这个范围内查重）。
 */
export function newAlarmId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * 一条阈值告警（对应后端 `ModbusServiceAlarm`，集合 `modbus`/`service-alarms`）。
 *
 * 三个时间键的分工：`at` 是**越限首次出现**的时刻（不是每条样本都记），`recoveredAt` 是值回到
 * 正常（或定义不再覆盖这个键）的时刻，`handledBy.timestamp` 是**用户点处理**的时刻。
 * 判定按边沿：持续越限不重复记，回正常后再越限才是新的一条。
 */
export class ModbusAlarm {
  /** 十六进制主键：点「处理」时要把它发回去 */
  id?: string;
  /**
   * 这条告警属于哪个服务。按服务查时与响应顶层的 `serviceId` 重复；**空间级查询（不传 `serviceId`）
   * 时是唯一的归属依据** —— 那种查法回来的清单里混着多个服务的告警，表格的名称列得靠它。
   */
  serviceId?: string;
  /** 方法序号（对应服务定义里 functions[].index） */
  functionIndex: number = 0;
  /**
   * 出值名（字段名，或位清单里那一位的名字）。**数据、不翻译** —— 它与服务定义里的字段名
   * 逐字相同，翻了就对不上了。
   */
  field: string = '';
  // —— 触发那一刻的定义快照（不是当前点表：定义改了不该改写历史告警的含义）——
  /** 比较方式（{@link MODBUS_ALARM_OPERATORS} 之一） */
  compare?: string;
  threshold?: number;
  /** `=` 的比较目标：取值表的 description */
  state?: string;
  /** {@link MODBUS_ALARM_LEVELS} 之一 */
  level?: string;
  /** 告警文本（用户自己填的，如「温度过高」）—— **用户数据，原样显示、永不翻译** */
  text?: string;
  /** 单位（点表里的数据、不翻译）；位上的告警没有单位 */
  unit?: string;
  // —— 边沿 ——
  /** 越限首次出现的时刻（毫秒） */
  at: number = 0;
  /** 值回到正常的时刻（毫秒）；**没有这个键 = 仍在越限**（这就是状态本身） */
  recoveredAt?: number;
  /**
   * 怎么关掉的（{@link MODBUS_ALARM_CLOSE_LABELS} 的四个值之一，页面照级别那样翻）。
   *
   * 它存在的意义是让「一条没有恢复样本的关闭」可解释 —— 否则用户只会看到一条告警莫名其妙地
   * 变成了「已恢复」。而四条路径必须都露脸：只显示其中一种，另外三种的行就说了半句话。
   */
  closeType?: string;
  // —— 处理 ——
  /** true = 已处理（用户点过「处理」）；缺省 / false 都是未处理 */
  handled?: boolean;
  /** 处理人与处理时刻（取 `timestamp`）；重复点击不会把第一个处理的人顶掉 */
  handledBy?: ModbusPerson;
  // —— 触发时的样本 ——
  /**
   * 越限那一刻的值（数值，或取值表的 description 字符串）；**开着期间不刷新**，
   * 所以它是「当时为什么报」而不是「现在多少」。**数据、不翻译。**
   */
  sample?: ModbusValue;
}

/** 按级别汇总的一项（`level` 是后端枚举名，页面用 {@link modbusAlarmLevelLabel} 翻） */
export class ModbusAlarmLevelCount {
  level: string = '';
  count: number = 0;
  /** 该级别最近一次告警的时刻（毫秒）；没有可用的时刻时后端不下发这个键 */
  lastAt?: number;
}

/** 按告警文本汇总的一项：`text` 是**用户数据**，原样显示 */
export class ModbusAlarmTextCount {
  text: string = '';
  count: number = 0;
  lastAt?: number;
}

/**
 * 告警汇总：只统计**本次返回的这批 items**，要连着 `truncated` 一起读。
 *
 * `open` 按 `recoveredAt` 有没有来数，`unhandled` 按 `handled` 是不是 true 来数 ——
 * 两个都是「页面同一批行上数得出来」的口径，故此处的数字与表格里看到的一致。
 *
 * `level` / `text` 缺失的行归到一个 `UNKNOWN` 桶里（后端的行为）：那只可能是更早的口径或脏数据，
 * 归桶是为了让计数与 `total` 对得上，**不是替用户编一个告警文本**。
 */
export class ModbusAlarmSummary {
  /** 本次聚合了多少条（= items.length，方便与 truncated 一起读） */
  total: number = 0;
  /** 其中仍未恢复的条数 */
  open: number = 0;
  /** 其中仍未处理的条数 */
  unhandled: number = 0;
  /** 按级别分布（**按条数降序、同数按级别名升序**，后端已排好） */
  byLevel: ModbusAlarmLevelCount[] = [];
  /** 按告警文本分布（「告警类型分布」，同上排序口径） */
  byText: ModbusAlarmTextCount[] = [];
}

/**
 * 告警清单（GET /alarm/many/{spaceId}?serviceId&functionIndex&field&level&open&handled&from&to&limit）。
 *
 * `serviceId` 不传 = **整个空间（含子空间）**：后端把空间下所有服务的告警合成一条时间倒序的清单，
 * 响应里就没有顶层 `serviceId` 这个键（每条 item 自带一个，见 {@link ModbusAlarm.serviceId}），
 * 故这里它是可选的。`limit` 与 `truncated` 也跟着变成**整份清单**的口径，而不是某个服务的。
 */
export class ModbusAlarmList {
  /** 查的是哪个服务；空间级查询时没有这个键 */
  serviceId?: string;
  from: number = 0;
  to: number = 0;
  /** 实际生效的条数上限（后端夹到 [1, 1000]，缺省 200） */
  limit: number = 0;
  /** true = 窗口内还有更早的告警没取回来（items 只有最近 limit 条），页面该提示缩小时间范围 */
  truncated: boolean = false;
  /** 时间**倒序**（最新的在前） */
  items: ModbusAlarm[] = [];
  summary: ModbusAlarmSummary = new ModbusAlarmSummary();
}

/**
 * 把「处理」成功后回来的那一条替进清单（**就地替换，不整页刷新**），并按「刚处理掉一条」修正计数。
 *
 * <p>两个地方容易错，故收成一个纯函数、单测钉住：**计数不能减两次**（后端把重复处理当成功，
 * 一条本来就已经处理过的行再点一次不该让「未处理」变成负数），以及**只动会变的那一格** ——
 * 处理既不改级别也不改告警文本，`byLevel` / `byText` 两份分布原样留着，仍以后端给的那一份为准。</p>
 *
 * <p>注意列表当前的筛选条件不被重新施加：筛「只看未处理」时，刚处理掉的那一行**仍留在表里**
 * （显示成「已处理」）。这是有意的 —— 用户刚点过的那条要能看见结果，而不是点完就从眼前消失。</p>
 */
export function applyHandledAlarm(list: ModbusAlarmList, updated: ModbusAlarm): ModbusAlarmList {
  const before = list.items.find((item) => item.id === updated.id);
  // `before != null` 这一半不能省：清单里根本没有这一条时（筛选刚换过）什么都没变，
  // 而 `before?.handled !== true` 在 before 为 undefined 时是**成立**的，会把计数白减一次
  const justHandled = before != null && before.handled !== true && updated.handled === true;
  return {
    ...list,
    items: list.items.map((item) => (item.id === updated.id ? updated : item)),
    summary: {
      ...list.summary,
      unhandled: justHandled ? Math.max(0, list.summary.unhandled - 1) : list.summary.unhandled,
    },
  };
}

/**
 * 告警清单的筛选条件，与接口的查询参数一一对应（**不传 = 不限**）。
 *
 * `open` / `handled` 用 `boolean | null | undefined` 而不是 `boolean`：它们的「不传」与 `false`
 * 必须区分开 —— 「只看已恢复」不等于「不限」，用 `false` 表达「不传」就永远查不了已恢复的那些。
 */
export interface ModbusAlarmQuery {
  /** 不传 = 整个空间（含子空间） */
  serviceId?: string | null;
  functionIndex?: number | null;
  field?: string | null;
  /** {@link MODBUS_ALARM_LEVELS} 之一；不传 = 所有级别 */
  level?: string | null;
  /** true 只看未恢复 / false 只看已恢复 / 不传 = 不限 */
  open?: boolean | null;
  /** true 只看未处理 / false 只看已处理 / 不传 = 不限 */
  handled?: boolean | null;
  /** 条数上限；不传 = 后端缺省（200），上不封顶到 1000 */
  limit?: number | null;
}
