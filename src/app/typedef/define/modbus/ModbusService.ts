/**
 * Modbus 服务：把一条 Modbus 点表映射成一组可直接调用的「方法」（见 service-matrix 的 MODBUS.md）。
 *
 * 本形状对应后端 `cc.openxiot.matrix.db.modbus.service.ModbusService`（集合 `modbus`/`services`），
 * 主键对外一律十六进制字符串。整份定义在**创建时**一次性展开落库（依赖设备坐标 + 请求帧 + 应答解析规则），
 * 调用时只读这一条记录即可，不再回点表 / 父设备 / 产品实例定义。
 */
import { SpaceRef } from '../space/SpaceRef';
import { ModbusPerson } from './Modbus';

/**
 * 服务依赖的设备：告诉服务「帧要发给谁、填在哪个入参上」，以及那台设备落在哪个空间。
 *
 * `argument` 是该方法**入参的 piid**：DTU 承载数据的动作只有一个入参，故提到这一级、
 * 对该服务的所有方法共用（不同型号 piid 不同，如 s710ym 是 1/2/2、dtu.json 是 1/1/1）。
 */
export class ModbusServiceDevice {
  /** 设备 ID（承载 Modbus 数据的 DTU） */
  did: string = '';
  /** 该设备服务 ID（siid） */
  siid: number = 0;
  /** 该设备方法 ID（aiid，通常是 DTU 的“发送”） */
  aiid: number = 0;
  /** 该设备方法的入参 piid：16 进制请求帧填在该入参上 */
  argument: number = 0;
  /** 该设备所在的空间（按空间查服务用；不参与校验，缺省的服务只是不出现在按空间的清单里） */
  space: SpaceRef = new SpaceRef();
}

/** 取值表条目：原始值命中 value 时，直接以 description 作为字段值（不再应用 scale） */
export class ModbusServiceFieldValue {
  value: number = 0;
  description: string = '';
}

/**
 * 一个出值的阈值告警规则，是**一组**（{@link ModbusServiceField.alarms}）里的一条
 * （对应后端 `ModbusServiceFieldAlarm`）。分级配置就靠这个数组表达：
 * 温度「低于 20 告警 / 超过 26 提示 / 超过 28 警告 / 超过 30 严重」是同一个出值上的四条规则。
 *
 * **越限判定按边沿**：正常→越限记一条告警，持续越限不重复记，回正常后再越限才是新的一次；
 * 判定比的是**解析后**的值（`scale` 已生效、命中取值表时是那条 `description`），
 * 因为阈值是用户按工程单位填的、曲线画的也是解析值。
 *
 * **同时最多只有一条生效**：一次采样里命中多条时，只留**级别最高**的那条开着，
 * 其余（连同上一轮开着的那条）按「被取代」关闭 —— 一个出值同时两条开着，
 * 用户处理了 A、B 还挂着，未处理计数就永远不对。
 *
 * 字段的取值形态决定能怎么比（后端 `ModbusAlarmPolicy` 与校验器同一口径）：
 * - 数值（含位区的整段掩码）：`compare` 五种都行，比 `threshold`；
 * - 命中取值表：只有 `=` 合法，比 `state`（取值表的某个 `description`，逐字命中）；
 * - 位清单里的一个位：只有 `=` 合法，`threshold` 取 0 / 1；
 * - `format` 为 `string` 的字段：**不能配告警**（无从比较）。
 *
 * 只能配在**读方法**（fc 01/02/03/04）上：写方法的应答是请求回显，没有读值。
 * 一个出值最多 **8 条**（`alarm` 与位各自算）。
 */
export class ModbusServiceFieldAlarm {
  /**
   * 这条规则的**身份**：前端生成、随配置落库（如 `m1a2b3c4d5e`）。
   *
   * 「这条开着的告警是哪条规则开的」全靠它 —— 后端把当前胜者的 `id` 写进告警行的 `ruleId`，
   * 之后拿它比对定义。**绝不能用数组下标当身份**：删掉第 0 条会让第 1 条正开着的告警
   * 静默改嫁到新第 0 条。它也是「改阈值不 churn」的原因（id 不变 ⇒ 胜者不变 ⇒ 不关不重开）。
   *
   * 后端只校验（非空 / ≤64 / 同出值内唯一，且**只在 `enabled == true` 时**），**不下发**回前端。
   * 生成走 `ModbusAlarm.ts` 的 `newAlarmId()`，**不要用 `crypto.randomUUID()`** ——
   * 那个 API 只在安全上下文（https / localhost）存在，局域网 http 部署下是 `undefined`。
   */
  id?: string;
  /** 开关。缺省 / false = 不告警，**配置原样留着**（与 `interval` 配了却暂停轮询同口径） */
  enabled?: boolean;
  /** `>` 超过 / `>=` 达到 / `<` 低于 / `<=` 低于等于 / `=` 等于（符号不翻译，见 ModbusAlarm.ts） */
  compare?: string;
  /** 数值阈值；`=` 且字段带取值表时改用 {@link state} */
  threshold?: number;
  /** `=` 的比较目标：取值表里的 `description` */
  state?: string;
  /** INFO 提示 / WARN 警告 / CRITICAL 严重 */
  level?: string;
  /** 告警文本（用户自己填的，如「温度过高」）—— **用户数据，永不翻译** */
  text?: string;
}

/**
 * 位区字段里的具名位：除字段自身那份整段位掩码外，把该位单独作为一个 0/1 取值输出（key 即 field）。
 *
 * 偏移是 0 基、从位区起点（请求的起始地址）算起；帧内按 LSB-first 取位，
 * 即第 `offset/8` 个数据字节的第 `offset%8` 位。
 */
export class ModbusServiceFieldBit {
  offset: number = 0;
  /** 该位的取值名：invoke 返回值里这个位的 key */
  field: string = '';
  /**
   * 该位的一组告警规则（**位是独立的结果键**：parser 逐位把值写进返回值，位自己就能比 0/1）——
   * 只挂父字段的话「位 = 1 就告警」根本够不着。与 {@link ModbusServiceField.alarms} **各是一组、
   * 各自算**（含条数上限与 `id` 唯一性）。
   */
  alarms?: ModbusServiceFieldAlarm[];
}

/**
 * 应答帧里的一个字段：描述「从数据区第几段开始、多少字节、怎么解」。
 *
 * 一个方法的应答数据区按 index 升序、以 bytes 依次累加偏移切分，
 * 故各字段 bytes 之和必须等于应答帧的 byteCount（跳过 slave/fc/byteCount 头与 CRC 尾）。
 */
export class ModbusServiceField {
  /** 字段序号（1 起自然数，同一应答内唯一）：决定该字段在数据区里的先后位置 */
  index: number = 0;
  /** 字段名称：invoke 返回值的 key */
  field: string = '';
  /** 该字段占用的字节数 */
  bytes: number = 0;
  /** int8 | uint8 | int16 | uint16 | int32 | uint32 | float32 | string */
  format: string = '';
  /** 字节序（bytes > 1 时必填）：ABCD 大端 / DCBA 小端 / BADC 字内字节交换 / CDAB 字交换 */
  byteOrder?: string;
  /** 缩放系数（未命中 valueList 时对读值生效，缺省 1 不缩放） */
  scale?: number;
  /** 单位（展示用，如 ℃ / %），不影响取值 */
  unit?: string;
  /** 线上键名 `value-list` */
  valueList?: ModbusServiceFieldValue[];
  /** 线上键名 `bit-list`（01/02 位区逐位取值） */
  bitList?: ModbusServiceFieldBit[];
  /**
   * 该字段出值的**一组**阈值告警规则，按声明顺序排列（缺省 / 空 = 没配）。同一个出值同时最多
   * 只有一条规则生效 —— 命中多条时只留级别最高的那条（同级取靠后的），其余按「被取代」关闭。
   *
   * 与 {@link ModbusServiceFieldBit.alarms} 是两处独立的配置：位上的比的是那一位的 0/1，
   * 这里的比的是整段位掩码 / 寄存器值本身。**顺序有意义**（同级并列的裁决依据），
   * 所以增删与重排都算真改动、保存按钮该亮。
   */
  alarms?: ModbusServiceFieldAlarm[];
}

/**
 * 服务里的一个方法：一次依赖设备调用 = 一帧请求 + 一条应答解析规则。
 *
 * 读方法（点表 fc 01/02/03/04）有 response；写方法（fc 05/06/0F/10）的应答是请求回显、
 * 没有读值，response 为空数组。
 */
export class ModbusServiceFunction {
  /** 方法序号（1 起自然数，服务内唯一；通常取点表功能码动作的 index） */
  index: number = 0;
  /** 方法名称（展示用，如 读蒸发器进水温度） */
  name: string = '';
  /** 请求帧：完整的 Modbus RTU 帧 16 进制字符串（含 CRC16），由前端生成，原样交给设备发送 */
  request: string = '';
  /**
   * 服务端自动调用本方法的周期（秒）：到点自动 invoke 一次，再按 response 解出字段值；
   * 缺省（undefined）表示没配周期 —— 后端用 null 表达同一件事，不用 0。
   *
   * 配了周期不等于会跑：跑不跑看 {@link polling}。只对读方法（fc 01/02/03/04）有意义 ——
   * 写方法的应答是请求回显，周期调用等于让服务端周期性地往寄存器里写值，后端校验
   * （ModbusServiceValidator.validateInterval）直接拒，故写方法上不会出现这个字段；
   * 取值 5 ~ 3600 秒（与后端校验同口径）。
   */
  interval?: number;
  /**
   * 是否启用自动轮询：true = 服务端按 interval 周期调用；false = 保留周期但暂停（随时可再开）；
   * 缺省（undefined）= 按 interval 判定，配了周期即启用 —— 与加这个字段之前的定义一致。
   *
   * 只有读方法能启用：true 而没给 interval、或该方法不是读方法，后端都会拒
   * （ModbusServiceValidator.validatePolling / validateInterval）。
   */
  polling?: boolean;
  /** 应答解析规则；空数组表示写方法 */
  response: ModbusServiceField[] = [];
}

/** Modbus 服务（后端 ModbusServiceResource，/matrix/v1/modbus/service） */
export class ModbusService {
  /** 十六进制字符串主键（后端生成） */
  id?: string;
  /** 服务名称（展示用，如 1 号冷水机组） */
  name: string = '';
  /** 定义格式版本号：functions 内部结构演进时递增（新建由后端填 1） */
  version?: number;
  /** 源点表配置 ID（溯源用：本服务由哪条点表映射而来） */
  configId?: string;
  /** 依赖设备的调用坐标 + 所在空间 */
  device: ModbusServiceDevice = new ModbusServiceDevice();
  /** 方法列表 */
  functions: ModbusServiceFunction[] = [];
  creator?: ModbusPerson;
  updater?: ModbusPerson;
}
