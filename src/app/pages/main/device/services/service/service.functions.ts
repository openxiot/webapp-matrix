/**
 * 把一条设备点表展开成 Modbus 服务的方法列表（functions）：**一个功能码动作 → 一个方法**，
 * 序号沿用动作的 index（功能码以序号为关键字），名称沿用动作名。
 *
 * - `request`：完整的 Modbus RTU 帧（含 CRC16），复用点表编辑器那套生成器
 *   （request.frame 的 buildRequestFrame），此处只把展示用的空格去掉；
 * - `response`：读动作（01/02/03/04）按「值的个数」出应答字段（见 responseOf），
 *   字段名取自动作的 fieldNames（留空用默认名）；写动作（05/06/0F/10）的应答是请求回显、
 *   没有读值，给空数组。
 *
 * 纯函数、无 Angular 依赖，供「添加/编辑服务」页在选中点表后即时展开成预览
 * （名称/请求帧/应答字段只读，只有「自动轮询」与「逐字段告警」由用户在预览表里改 ——
 * 这两样都不属于点表，由宿主页各存一份并在此处合进方法定义）。
 */
import {
  ModbusCommand,
  ModbusConfig,
} from '@app/typedef/define/modbus/Modbus';
import {
  ModbusServiceField,
  ModbusServiceFieldAlarm,
  ModbusServiceFieldBit,
  ModbusServiceFunction,
} from '@app/typedef/define/modbus/ModbusService';
import {
  MODBUS_ALARM_LEVELS,
  MODBUS_ALARM_OPERATORS,
  modbusAlarmLevelLabel,
  modbusAlarmOperatorLabel,
  newAlarmId,
} from '@app/typedef/define/modbus/ModbusAlarm';
import { buildRequestFrame } from '../../../modbus/editor/request/request.frame';
import {
  READ_BIT_FCS,
  READ_FCS,
  expectedBitCount,
  expectedFieldCount,
  fieldBaseName,
  fitBitNames,
  fitFieldNames,
  registerSpan,
} from '../../../modbus/command/point.options';

/** 点表数据类型占用的字节数（string 不固定，由数量决定） */
const DATA_TYPE_WIDTH: Record<string, number> = {
  int16: 2,
  uint16: 2,
  int32: 4,
  uint32: 4,
  float32: 4,
};

/** 展开结果 */
export interface ServiceFunctionBuild {
  functions: ModbusServiceFunction[];
  /** 数据不完整、生成不出请求帧或应答规则的动作（如 `#2 读进水温度`），前端提示用 */
  skipped: string[];
}

/**
 * 点表 → 方法列表。点表为空（未选择 / 取不到）时返回空结果。
 */
export function buildServiceFunctions(config: ModbusConfig | undefined): ServiceFunctionBuild {
  const functions: ModbusServiceFunction[] = [];
  const skipped: string[] = [];
  if (!config) {
    return { functions, skipped };
  }

  const slaveId = config.slave?.slaveId;
  for (const command of config.commands ?? []) {
    const label = `#${command.index} ${command.name ?? ''}`.trim();
    const built = buildRequestFrame(command, slaveId);
    if (!built.ok) {
      skipped.push(label);
      continue;
    }
    const response = responseOf(command);
    if (!response) {
      skipped.push(label);
      continue;
    }
    functions.push({
      index: command.index,
      name: command.name,
      request: built.frame.hex.replace(/\s+/g, ''),
      response,
    });
  }

  return { functions, skipped };
}

/**
 * 一个动作的应答解析规则；数量非法（算出 0 字节的数据区）时返回 null，由调用方按「跳过」处理。
 *
 * 字段个数跟「值的个数」走：01/02 与 string 只有一个字段，03/04 非 string 一个值一个字段
 * （每个字段 bytes = 类型跨度 × 2），字段名逐个取 action 的 fieldNames（留空用默认名）。
 * 各字段 bytes 之和 = 应答帧 byteCount，与后端 ModbusResponseParser 的切分口径一致。
 *
 * 01/02 的位区只能是一段连续字节（bytes 之和必须等于 byteCount），故逐位取值不是另开字段，
 * 而是在这个字段上挂 bit-list：后端解析时除给出整段位掩码外，再按位输出每个已命名位的 0/1。
 */
function responseOf(command: ModbusCommand): ModbusServiceField[] | null {
  if (!READ_FCS.has(command.fc)) {
    // 写动作：应答是请求回显，没有读值
    return [];
  }

  const quantity = Math.max(1, Math.floor(command.quantity ?? 1));

  if (READ_BIT_FCS.has(command.fc)) {
    // 读位：整段位打包成一个字节区（bytes = 位数向上取整到字节），故只有一个字段，
    // 字段名用命令名的基名（逐位命名在 bitNames 里，位区本身没有「第几个值」的说法）
    const bytes = Math.ceil(quantity / 8);
    if (bytes < 1) {
      return null;
    }
    const field = buildField(
      1,
      fieldBaseName(command.name),
      bytes,
      formatOf(undefined, bytes),
      command,
    );
    const bits = fitBitNames(command.bitNames, expectedBitCount(command.fc, command.quantity));
    if (bits.length > 0) {
      field.bitList = bits.map((bit) => ({ offset: bit.offset ?? 0, field: bit.name ?? '' }));
    }
    return [field];
  }

  // 应答字段名称（个数即字段数，空位补默认名）
  const names = fitFieldNames(
    command.fieldNames,
    expectedFieldCount(command.fc, command.quantity, command.dataType),
    fieldBaseName(command.name),
  );

  if (command.dataType === 'string') {
    // string：整段字符串算一个值（数量即长度），bytes = 长度 × 2
    return [buildField(1, names[0] ?? '', quantity * 2, 'string', command)];
  }

  // 03/04 非 string：一个值一个字段，字节数 = 类型跨度 × 2（未知类型按 1 个寄存器兜底）
  const bytes = (registerSpan(command.dataType) ?? 1) * 2;
  const format = formatOf(command.dataType, bytes);
  return names.map((name, i) => buildField(i + 1, name, bytes, format, command));
}

/** 组装一个应答字段：字节序/缩放/单位按动作声明填（bytes > 1 时后端要求 byteOrder 必填）。 */
function buildField(
  index: number,
  field: string,
  bytes: number,
  format: string,
  command: ModbusCommand,
): ModbusServiceField {
  const out: ModbusServiceField = { index, field, bytes, format };
  if (bytes > 1) {
    out.byteOrder = command.byteOrder ?? 'ABCD';
  }
  if (command.scale != null) {
    out.scale = command.scale;
  }
  if (command.unit) {
    out.unit = command.unit;
  }
  return out;
}

/**
 * 数据格式：点表声明的类型与占用字节数一致时照用（保住 int16 的符号、float32 的浮点语义），
 * 不一致（如手改过数量）时按字节数退化为无符号整型 —— 后端校验要求「非 string 的 bytes
 * 必须等于该格式的宽度」，宁可退化为能用的解，也不要丢一个被服务端直接拒掉的组合。
 */
function formatOf(dataType: string | undefined, bytes: number): string {
  if (dataType === 'string') {
    // string 长度不固定，bytes 即长度
    return 'string';
  }
  const width = dataType ? DATA_TYPE_WIDTH[dataType] : undefined;
  if (width != null && width === bytes) {
    return dataType as string;
  }
  switch (bytes) {
    case 1:
      return 'uint8';
    case 2:
      return 'uint16';
    case 4:
      return 'uint32';
    default:
      return 'string';
  }
}

/** 应答字段的展示文案：字段名 类型/字节数 [字节序] [×缩放] [单位] [位: 名称@偏移 …] [→ 告警 …] */
export function describeServiceField(field: ModbusServiceField): string {
  const parts = [describeFieldType(field)];
  // 已启用的告警缀在最后：这一行是「这个方法返回什么、越限会不会报」的摘要，
  // 漏掉告警就少说了一件事（字段自身与各位各一份，与展开行里的行序一致）。
  // 一个出值可能配了一组分级规则，这里只缀**级别最高**的那条 —— 与运行期「同时只留最严重的一条」
  // 同口径，也正是用户最该先看到的那句（完整的一组展开就见，故不缀条数）
  for (const alarms of [field.alarms, ...(field.bitList ?? []).map((bit) => bit.alarms)]) {
    const alarm = primaryAlarm(alarms);
    if (alarm != null) {
      parts.push(`→ ${alarmBrief(alarm)}`);
    }
  }
  return parts.join(' ');
}

/**
 * 一组规则里**真正会生效**的那条：已启用的规则中级别最高的，
 * 与后端 `ModbusAlarmPolicy` 的选举同一条口径（见 {@link ModbusServiceField.alarms}）。
 *
 * 它只是**摘要的取法**，不是判定：值有没有越限要看采样，这里无从得知，
 * 所以取的是「启用规则里最重的那条」而不是「命中的那些里最重的那条」。级别缺省的按最低算。
 * 同级并列取**声明顺序靠后**的那条（`>=` 而不是 `>`），与后端一致。
 */
export function primaryAlarm(
  alarms: ModbusServiceFieldAlarm[] | undefined,
): ModbusServiceFieldAlarm | undefined {
  let winner: ModbusServiceFieldAlarm | undefined;
  for (const alarm of alarms ?? []) {
    if (alarm == null || alarm.enabled !== true) {
      continue;
    }
    if (winner == null || alarmRank(alarm.level) >= alarmRank(winner.level)) {
      winner = alarm;
    }
  }
  return winner;
}

/** 级别次序（由轻到重）里的位次；不认识的级别（含缺省）一律最低，与后端 `rank` 同口径 */
export function alarmRank(level: string | undefined | null): number {
  return level == null ? -1 : (MODBUS_ALARM_LEVELS as readonly string[]).indexOf(level);
}

/**
 * 只看类型的形态（`uint16/2B ABCD ℃ 位: 运行@0`），**不带字段名、不带告警**：
 * 展开行里那一组的组头用它 —— 出值名已经在组头左边（见 {@link ServiceAlarmItem.key}），
 * 让它再当描述的第一个词重复一遍是白说。
 */
export function describeFieldShape(field: ModbusServiceField): string {
  const parts = [`${field.format}/${field.bytes}B`];
  if (field.byteOrder) {
    parts.push(field.byteOrder);
  }
  if (field.scale != null) {
    parts.push(`×${field.scale}`);
  }
  if (field.unit) {
    parts.push(field.unit);
  }
  if (field.bitList && field.bitList.length > 0) {
    // 逐位命名（01/02）：整段位掩码之外还会按位出 0/1，这里把位名与偏移一并展示
    parts.push(`位: ${field.bitList.map((bit) => `${bit.field}@${bit.offset}`).join(' ')}`);
  }
  return parts.join(' ');
}

/**
 * 字段名 + 类型形态，**不带告警**：{@link describeServiceField} 的起始段用它 ——
 * 那一行后面紧挨着就是告警的摘要，再缀一遍「→ 温度过高(>80)」是同一句话说两遍。
 */
export function describeFieldType(field: ModbusServiceField): string {
  return `${field.field} ${describeFieldShape(field)}`;
}

/**
 * 已启用的告警在摘要里的样子：`温度过高(>80)`、`机组运行(=1)`。
 *
 * 用**符号**而不是「超过」那类词：这一行是跟着 `uint16/2B` 一起出现的技术摘要，
 * 符号与定义里存的值逐字对齐，也就不必进词典（见 `ModbusAlarm.ts` 的 `MODBUS_ALARM_OPERATORS`）。
 */
function alarmBrief(alarm: ModbusServiceFieldAlarm): string {
  const target = alarm.threshold != null ? String(alarm.threshold) : (alarm.state ?? '');
  return `${alarm.text ?? ''}(${alarm.compare ?? ''}${target})`;
}

/** 写方法（无 response）的提示文案 i18n key —— 页面自写文案，由调用方走翻译；响应的字段文案来自点表数据，不翻译。 */
export const WRITE_METHOD_REPLY_KEY = '写方法（应答为请求回显，无返回字段）';

/**
 * 请求帧里的功能码（两位大写 16 进制）：帧结构 [slave][fc][...]，即第二个字节。
 * 帧缺失 / 太短 / 不是 16 进制时返回 undefined —— 判不出功能码就当「不是读方法」，
 * 与后端 ModbusFrameCodec 取 fc 的口径一致（后端从请求帧第二字节判定读写）。
 */
export function functionFcOf(request: string | undefined): string | undefined {
  const hex = (request ?? '').replace(/\s+/g, '');
  if (hex.length < 4) {
    return undefined;
  }
  const fc = hex.slice(2, 4).toUpperCase();
  return /^[0-9A-F]{2}$/.test(fc) ? fc : undefined;
}

/**
 * 方法是否读方法（fc 01/02/03/04）。
 *
 * 只有读方法能挂自动调用周期：写方法的应答是请求回显，周期调用等于让服务端周期性地往寄存器里
 * 写值，后端 ModbusServiceValidator 会直接拒（`only read functions (fc 01/02/03/04) can be polled`）。
 */
export function isReadFunction(func: ModbusServiceFunction): boolean {
  return READ_FCS.has(functionFcOf(func.request) ?? '');
}

/**
 * 用户在方法预览表里能改的两样：自动轮询开关与调用周期。
 *
 * 两者是一件事的两面（开关决定跑不跑、周期决定多久跑一次），故一起存、一起合进方法定义，
 * 由宿主页按 `点表ID#方法序号` 存一份（方法列表是拿点表现场重算的，自带不了）。
 */
export interface FunctionPoll {
  /** 调用周期（秒）；undefined = 没配周期（此时开关也无从开起） */
  interval?: number;
  /** 轮询开关：true 启用 / false 暂停（周期保留）；undefined = 未表态，按「有周期即启用」判定 */
  polling?: boolean;
}

/**
 * 编辑页「有没有真正改过」的基线：**只装用户能改的东西**（名称 / 依赖服务 / 依赖方法 / 源点表 /
 * 各方法的轮询配置 / 各出值的告警配置）。
 *
 * 方法列表本体不进来：它是拿所选点表现场重算的，存的那份与算出来的那份在同一次生成口径下必然一致，
 * 而一旦生成器口径演进（字段名、bit-list、格式兜底这些），一进页面就会被判成「已修改」——
 * 那不是用户改的，保存按钮不该亮。
 */
export interface ServiceBaseline {
  /** 名称（trim 后：与保存时落库的口径一致） */
  name: string;
  siid: number | null;
  aiid: number | null;
  configId: string | null;
  /** 轮询配置表的快照（见 {@link pollSignature}） */
  polls: string;
  /** 告警配置表的快照（见 {@link alarmSignature}） */
  alarms: string;
}

/** 当前表单相对基线是否改过（新增页没有原值可比，由调用方直接当「改过」）。 */
export function serviceChanged(base: ServiceBaseline, current: ServiceBaseline): boolean {
  return (
    base.name !== current.name ||
    base.siid !== current.siid ||
    base.aiid !== current.aiid ||
    base.configId !== current.configId ||
    base.polls !== current.polls ||
    base.alarms !== current.alarms
  );
}

/**
 * 轮询配置表的可比较快照：按 key 排序后序列化 —— Map 的遍历顺序是插入顺序，
 * 直接序列化会被「先改哪个方法」影响，同一份配置比出两种结果。
 *
 * 值摊平成 `[周期, 开关]` 再比：开关没表态（undefined）与显式 true 在渲染上是同一件事，
 * 摊平后两者都写成 true，切来切去不会凭空多出一次「已修改」。
 */
export function pollSignature(polls: Map<string, FunctionPoll>): string {
  return JSON.stringify(
    [...polls.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, poll]) => [key, poll.interval ?? null, poll.polling ?? (poll.interval != null)]),
  );
}

/* ----------------------------------------------------------------------------------------------
 * 逐字段告警
 * ----------------------------------------------------------------------------------------------*/

/**
 * 一个出值能怎么比 —— 与后端 `ModbusAlarmPolicy` / `ModbusServiceValidator` 同一口径：
 * - `state`：命中取值表，值的形态是那条 `description` 字符串 ⇒ 只有 `=` 合法，比某条状态；
 * - `bit`：位清单里的一位，值是 0 / 1 ⇒ 只有 `=` 合法，阈值取 0 / 1；
 * - `numeric`：数值（含位区的整段掩码）⇒ 五种比较都比阈值；
 * - `none`：`format` 为 `string` 的字段 ⇒ 无从比较，**不能配告警**（后端直接拒）。
 */
export type AlarmTargetKind = 'state' | 'bit' | 'numeric' | 'none';

/**
 * 展开行里的一个出值：一个应答字段，或位清单里的一位。
 *
 * 位是**独立的结果键** —— 后端 parser 逐位把 0/1 写进返回值，所以它与父字段各占一行、
 * 各配各的告警；只挂父字段的话「位 = 1 就告警」根本够不着。
 */
export interface ServiceAlarmItem {
  /** 出值名：invoke 返回值里的 key，也是告警行里的 `field`（**数据、不翻译**） */
  key: string;
  /** 载着这个出值的字段：单位 / 取值表这些属性都看它 */
  field: ModbusServiceField;
  /** 位清单里的一位；字段自身那一行为 undefined */
  bit?: ModbusServiceFieldBit;
  /** 这个出值能怎么比（见 {@link AlarmTargetKind}） */
  kind: AlarmTargetKind;
}

/** 一个方法的所有出值（应答字段 + 各自的位），展开行按这个顺序逐行列出 */
export function alarmItems(func: ModbusServiceFunction): ServiceAlarmItem[] {
  const items: ServiceAlarmItem[] = [];
  for (const field of func.response ?? []) {
    items.push({ key: field.field, field, kind: alarmTargetKind(field) });
    for (const bit of field.bitList ?? []) {
      items.push({ key: bit.field, field, bit, kind: alarmTargetKind(field, bit) });
    }
  }
  return items;
}

/**
 * 出值能怎么比。位恒为 `bit`（位区只能是 01/02 的整段掩码，格式不会是 string）；
 * 其余看字段自身的形态：string 不能配，带取值表只能比状态，剩下的都是数值。
 */
export function alarmTargetKind(
  field: ModbusServiceField,
  bit?: ModbusServiceFieldBit,
): AlarmTargetKind {
  if (bit) {
    return 'bit';
  }
  if (field.format === 'string') {
    return 'none';
  }
  return (field.valueList ?? []).length > 0 ? 'state' : 'numeric';
}

/**
 * 该出值此刻比的是「取值表的状态」还是「数值阈值」。后端校验器把这两个字段做成互斥的
 * （同时给或都不给都报错），所以「选了 = 且带取值表」之外的任何情形都走 threshold。
 */
export function alarmUsesState(kind: AlarmTargetKind, compare: string | undefined): boolean {
  return kind === 'state' && compare === '=';
}

/** 该出值能选的比较方式：数值五种，取值表与位只有 `=`，string 一个都没有 */
export function alarmOperatorsOf(kind: AlarmTargetKind): string[] {
  if (kind === 'none') {
    return [];
  }
  return kind === 'numeric' ? [...MODBUS_ALARM_OPERATORS] : ['='];
}

/**
 * 一个出值最多能配几条规则：与后端 `ModbusServiceValidator` 的上限同口径（两边改动要同步）。
 *
 * 它**不是安全边界**（多几条规则只是多几次纯内存比较），是给「界面上误加了一堆规则」一个明确的上限，
 * 故到顶时只是把「添加规则」按钮禁掉，不弹错。
 */
export const MAX_ALARM_RULES = 8;

/**
 * 新加一条规则时补齐的起步配置 —— 与自动轮询的 `DEFAULT_INTERVAL_SECONDS` 同一个用意：
 * 后端要求「开了告警就得填齐」，总不能因为用户刚点「添加规则」、还没来得及填就被拒。
 *
 * `id` 在这里就生成：它是规则的身份（见 {@link ModbusServiceFieldAlarm.id}），
 * 后补的话在补之前那一段里这条规则就没有身份可用。
 *
 * `text` 取该出值的名字（用户随即能改）：后端也不接受空文本，而「进水温度」这种默认值
 * 恰恰是绝大多数人要填的那个 —— 与服务名称默认取点表描述（`applyAutoName`）同一条做法。
 *
 * 阈值的默认值只有位给得起（0 / 1 两个候选里取「置位就告警」那个）；数值阈值没有合理缺省，
 * 留给用户填 —— 后端会明确拒掉空值，比这里猜一个 0（那会立刻置起一条告警）诚实。
 */
export function defaultAlarm(kind: AlarmTargetKind, text: string): ModbusServiceFieldAlarm {
  const alarm: ModbusServiceFieldAlarm = {
    id: newAlarmId(),
    enabled: true,
    compare: kind === 'numeric' ? '>' : '=',
    level: 'WARN',
    text,
  };
  if (kind === 'bit') {
    alarm.threshold = 1;
  }
  return alarm;
}

/**
 * 告警配置在编辑页那张侧表里的 key：`点表ID#方法序号#出值名`。
 *
 * 与 {@link pollSignature} 那边带上点表 ID 的理由相同：换了源点表，不能把 A 点表的告警
 * 带到 B 点表序号相同的方法里名字相同的字段上。
 */
export function alarmKey(configId: string | null, functionIndex: number, field: string): string {
  return `${configId ?? ''}#${functionIndex}#${field}`;
}

/**
 * 告警配置表的可比较快照：按 key 排序后序列化。理由同 {@link pollSignature}（Map 的遍历顺序
 * 是插入顺序，直接序列化会被「先改哪一行」影响）。
 *
 * 一个 key 下是**一组规则**，组内**按声明顺序**摊平、一个字节都不排序：顺序参与同级并列的裁决
 * （后端取靠后的那条），所以重排是一次真改动、保存按钮该亮。
 * 每条规则**逐字段摊平成固定顺序的数组**而不是直接塞对象：对象里键的顺序跟着改动路径走
 * （先改级别还是先改文本），同一个配置会序列化出两种字符串，保存按钮就白白亮一次。
 * `id` 也在快照里：它不变（改阈值不动它），但删掉一条再加一条是另一次改动，快照该不同。
 */
export function alarmSignature(alarms: Map<string, ModbusServiceFieldAlarm[]>): string {
  return JSON.stringify(
    [...alarms.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, rules]) => [
        key,
        rules.map((alarm) => [
          alarm.id ?? null,
          alarm.enabled ?? false,
          alarm.compare ?? null,
          alarm.threshold ?? null,
          alarm.state ?? null,
          alarm.level ?? null,
          alarm.text ?? null,
        ]),
      ]),
  );
}

/**
 * 加一条规则后的新表；到 {@link MAX_ALARM_RULES} 就原样返回。
 *
 * 下面三个改动函数都返回**新 Map**（不原地改）：调用方是编辑页与告警对话框，两边都是信号更新，
 * 原地改 Map 信号不会变、界面也不会动。
 *
 * 上限在这里也兜一次：按钮禁用了是给人看的，真正不该越界的是这份数据（与 `onAlarmAdd` 同一条）。
 * `text` 是新规则的告警文本，调用方一律先填出值名（见 {@link defaultAlarm}）。
 */
export function withAlarmAdded(
  alarms: Map<string, ModbusServiceFieldAlarm[]>,
  key: string,
  kind: AlarmTargetKind,
  text: string,
): Map<string, ModbusServiceFieldAlarm[]> {
  const next = new Map(alarms);
  const rules = next.get(key) ?? [];
  if (rules.length >= MAX_ALARM_RULES) {
    return next;
  }
  next.set(key, [...rules, defaultAlarm(kind, text)]);
  return next;
}

/**
 * 改一条规则后的新表：按**对象身份**定位这条规则，不拿下标。
 *
 * 下标不能当身份：删掉第 0 条之后，原本第 1 条的规则会被当成第 0 条改掉。让每条规则自己带 `id`
 * 是同一个理由的另一半（见 {@link ModbusServiceFieldAlarm.id}）。
 */
export function withAlarmPatched(
  alarms: Map<string, ModbusServiceFieldAlarm[]>,
  key: string,
  rule: ModbusServiceFieldAlarm,
  patch: Partial<ModbusServiceFieldAlarm>,
): Map<string, ModbusServiceFieldAlarm[]> {
  const next = new Map(alarms);
  const rules = next.get(key) ?? [];
  const at = rules.indexOf(rule);
  if (at < 0) {
    return next;
  }
  const updated = [...rules];
  updated[at] = { ...rule, ...patch };
  next.set(key, updated);
  return next;
}

/**
 * 删一条规则后的新表。**整组删空时把 key 也去掉**（而不是留一个空数组）：空数组会被编辑器原样
 * 写进服务定义（`withAlarms`），而 codec 与后端都读作「没配」，白白在库里留个噪音。
 */
export function withAlarmRemoved(
  alarms: Map<string, ModbusServiceFieldAlarm[]>,
  key: string,
  rule: ModbusServiceFieldAlarm,
): Map<string, ModbusServiceFieldAlarm[]> {
  const next = new Map(alarms);
  const rules = [...(next.get(key) ?? [])];
  const at = rules.indexOf(rule);
  if (at < 0) {
    return next;
  }
  rules.splice(at, 1);
  if (rules.length > 0) {
    next.set(key, rules);
  } else {
    next.delete(key);
  }
  return next;
}

/**
 * 把一条规则挪到组内新位置的**新表**（对话框里按住手柄拖出来的顺序）。
 *
 * 顺序不是排给人看的：后端在同级并列时取**靠后**的那条（`ModbusAlarmPolicy` 的裁决），
 * 所以拖动是一次真改动 —— `alarmSignature` 组内按声明顺序摊平，保存按钮会亮。
 *
 * `moveItemInArray` 在 `@angular/cdk/drag-drop` 里就有，这里不引它：本文件是纯数据函数、
 * 只认 typedef，引一个 UI 库进来只为挪一个元素不值当（四个下标判断而已）。
 * 越界的 from / to 一律原样返回：cdk 不传这种值，但真传了也不该把整组规则弄丢。
 */
export function withAlarmMoved(
  alarms: Map<string, ModbusServiceFieldAlarm[]>,
  key: string,
  from: number,
  to: number,
): Map<string, ModbusServiceFieldAlarm[]> {
  const next = new Map(alarms);
  const rules = next.get(key) ?? [];
  if (from === to || from < 0 || to < 0 || from >= rules.length || to >= rules.length) {
    return next;
  }
  const moved = [...rules];
  const [rule] = moved.splice(from, 1);
  moved.splice(to, 0, rule);
  next.set(key, moved);
  return next;
}

/**
 * 一个方法配了多少条告警规则：全部出值（应答字段 + 各自的位）加起来的条数 ——
 * 方法预览表「告警配置」列上那个数字就是它，点它开告警对话框。
 *
 * **停用的规则也算**：这一列数的是「配了几条」，不是「此刻有几条生效」—— 后者随值上下起伏，
 * 不该出现在配置页上。写方法没有出值，恒为 0。
 */
export function alarmCount(
  func: ModbusServiceFunction,
  configId: string | null,
  alarms: Map<string, ModbusServiceFieldAlarm[]>,
): number {
  return alarmItems(func).reduce(
    (count, item) => count + (alarms.get(alarmKey(configId, func.index, item.key))?.length ?? 0),
    0,
  );
}

/**
 * 一个方法配了多少条告警规则 —— 数的是**定义本身**（`field.alarms` / `bit.alarms`），
 * 不是侧表：服务详情页手上只有从服务端读回来的那份定义（它没有、也不该有编辑页那份侧表），
 * 「告警配置」列上那个数字就是它。
 *
 * 与 {@link alarmCount} 的分工只有一处：**读哪儿**。编辑页读侧表（用户可能刚在对话框里改过、
 * 还没保存，数字得跟着变），详情页读定义（它展示的就是服务端现在这一份）。
 * 口径本身是同一条：全部出值（应答字段 + 各自的位）加起来、**停用的也算**、写方法恒为 0。
 */
export function definedAlarmCount(func: ModbusServiceFunction): number {
  return alarmItems(func).reduce(
    (count, item) => count + ((item.bit ? item.bit.alarms : item.field.alarms)?.length ?? 0),
    0,
  );
}

/**
 * 把按出值名分好组的规则组并进应答字段的**新方法**：字段自身一组、位清单里每一位各一组
 * （位是独立的结果键，见 {@link ServiceAlarmItem}）。组内顺序原样带出去 —— 它参与运行期的裁决。
 *
 * 没配的出值**不出 `alarms` 键** —— 定义里绝大多数字段都没配告警，过一趟不该在每个字段上
 * 多出一个空数组（codec 与后端都把空数组读作「没配」，但空键终究是白带出去的噪音）。
 * 写方法没有 response，这个循环自然什么也不做。
 *
 * 编辑页的 `withAlarms` 是它的**取数**版：那边从侧表按 `点表ID#序号#出值名` 取，
 * 取出来交给这里合并 —— 合并规则（空组不出键、位各算一组）只有这一份实现。
 */
export function withAlarmsOf(
  func: ModbusServiceFunction,
  groups: Map<string, ModbusServiceFieldAlarm[]>,
): ModbusServiceFunction {
  const groupOf = (name: string): ModbusServiceFieldAlarm[] | undefined => {
    const rules = groups.get(name);
    return rules != null && rules.length > 0 ? rules : undefined;
  };
  const response = (func.response ?? []).map((field: ModbusServiceField) => ({
    ...field,
    alarms: groupOf(field.field),
    bitList: field.bitList?.map((bit) => ({ ...bit, alarms: groupOf(bit.field) })),
  }));
  return { ...func, response };
}

/** 告警那几个下拉的一个选项：值（落库的就是它）+ 界面标签 */
export interface AlarmOption {
  value: string;
  label: string;
}

/**
 * 比较方式下拉：「文案 + 符号」两样都给 —— 词是给不看符号的人，符号与定义里存的值逐字对齐。
 *
 * 标签要翻，故翻译函数由调用方传入（本文件是纯函数、不认识 i18n 服务，与
 * `modbusAlarmOperatorLabel` 同一条做法）；调用方那个 `t` 顺带读一下当前语言的信号，
 * 语言切换时下拉跟着重算。
 */
export function alarmCompareOptions(
  item: ServiceAlarmItem,
  t: (key: string) => string,
): AlarmOption[] {
  return alarmOperatorsOf(item.kind).map((operator) => ({
    value: operator,
    label: `${modbusAlarmOperatorLabel(operator, t)} ${operator}`,
  }));
}

/** 级别下拉：顺序即「由轻到重」，与告警列表页的筛选同一个顺序 */
export function alarmLevelOptions(t: (key: string) => string): AlarmOption[] {
  return MODBUS_ALARM_LEVELS.map((level) => ({
    value: level,
    label: modbusAlarmLevelLabel(level, t),
  }));
}

/**
 * `=` 的比较目标：该字段取值表里的描述，**原样显示、不翻译** —— 它是点表里的数据，
 * 与后端逐字比对的就是这个串，翻了保存就会被拒（见 AGENTS.md 的 i18n 一节）。
 */
export function alarmStateOptions(field: ModbusServiceField): AlarmOption[] {
  return (field.valueList ?? []).map((v) => ({ value: v.description, label: v.description }));
}

/** 一个方法的应答字段文案；写方法（无 response）没有返回字段，返回 null 交给调用方给提示文案 */
export function describeFunctionResponse(func: ModbusServiceFunction): string | null {
  if (!func.response || func.response.length === 0) {
    return null;
  }
  return func.response.map(describeServiceField).join('，');
}
