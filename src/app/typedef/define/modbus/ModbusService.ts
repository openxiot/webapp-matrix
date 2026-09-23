/**
 * Modbus 服务：把一条 Modbus 点表映射成一组可直接调用的「方法」（见 service-matrix 的 MODBUS.md）。
 *
 * 本形状对应后端 `cc.openxiot.matrix.db.modbus.service.ModbusService`（集合 `modbus`/`services`），
 * 主键对外一律十六进制字符串。整份定义在**创建时**一次性展开落库（依赖设备坐标 + 请求帧定义 +
 * 应答解析规则），调用时只读这一条记录即可，不再回点表 / 父设备 / 产品实例定义。
 *
 * **v2 起请求帧是结构化的**（见 {@link ModbusFunctionRequest}）：库里不再存算好的 16 进制帧，
 * 帧由后端在 invoke 时按定义现组（含 CRC16），前端要预览就本地按同一算式算一遍（只作展示）。
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
export class ModbusFunctionResponseFieldValue {
  value: number = 0;
  description: string = '';
}

/**
 * 一个出值的阈值告警规则，是**一组**（{@link ModbusFunctionResponseField.alarms}）里的一条
 * （对应后端 `ModbusFunctionResponseFieldAlarm`）。分级配置就靠这个数组表达：
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
export class ModbusFunctionResponseFieldAlarm {
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
export class ModbusFunctionResponseFieldBit {
  offset: number = 0;
  /** 该位的取值名：invoke 返回值里这个位的 key */
  field: string = '';
  /**
   * 该位的一组告警规则（**位是独立的结果键**：parser 逐位把值写进返回值，位自己就能比 0/1）——
   * 只挂父字段的话「位 = 1 就告警」根本够不着。与 {@link ModbusFunctionResponseField.alarms} **各是一组、
   * 各自算**（含条数上限与 `id` 唯一性）。
   */
  alarms?: ModbusFunctionResponseFieldAlarm[];
}

/**
 * 应答帧里的一个字段：描述「从数据区第几段开始、多少字节、怎么解」。
 *
 * 一个方法的应答数据区按 index 升序、以 bytes 依次累加偏移切分，
 * 故各字段 bytes 之和必须等于应答帧的 byteCount（跳过 slave/fc/byteCount 头与 CRC 尾）。
 */
export class ModbusFunctionResponseField {
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
  valueList?: ModbusFunctionResponseFieldValue[];
  /** 线上键名 `bit-list`（01/02 位区逐位取值） */
  bitList?: ModbusFunctionResponseFieldBit[];
  /**
   * 该字段出值的**一组**阈值告警规则，按声明顺序排列（缺省 / 空 = 没配）。同一个出值同时最多
   * 只有一条规则生效 —— 命中多条时只留级别最高的那条（同级取靠后的），其余按「被取代」关闭。
   *
   * 与 {@link ModbusFunctionResponseFieldBit.alarms} 是两处独立的配置：位上的比的是那一位的 0/1，
   * 这里的比的是整段位掩码 / 寄存器值本身。**顺序有意义**（同级并列的裁决依据），
   * 所以增删与重排都算真改动、保存按钮该亮。
   */
  alarms?: ModbusFunctionResponseFieldAlarm[];
}

/**
 * 请求帧里要写入的一个字段：写方法（fc 05/06/0F/10）的数据区由若干这样的字段拼出来
 * （对应后端 `ModbusFunctionRequestField`）。
 *
 * 与 {@link ModbusFunctionResponseField} 是一对：那个描述「从数据区第几段开始、多少字节、怎么解」，
 * 这个描述「写到第几个位置、多少位宽、怎么排」。应答字段是 invoke 返回值的 key，
 * 这里的 {@link field} 是 invoke **入参**取值的 key。
 */
export class ModbusFunctionRequestField {
  /** 字段序号（1 起自然数，同一写请求内唯一）：决定该字段在数据区里的先后位置 */
  index: number = 0;
  /** 字段名称：invoke 请求体里取值的 key，同一写请求内唯一 */
  field: string = '';
  /** 0 基偏移（相对 start）：10 为寄存器偏移、0F 为位偏移；05/06 只有单值、偏移恒为 0，必须不填 */
  offset?: number;
  /** bit（05/0F）/ int16 / uint16 / int32 / uint32 / float32（06/10） */
  format: string = '';
  /** 字节序（跨度 > 1 个寄存器时必填）：ABCD 大端 / DCBA 小端 / BADC 字内字节交换 / CDAB 字交换 */
  byteOrder?: string;
  /**
   * 缺省值（原始值，不做工程量换算）：invoke 没给这个字段时用它；不填则该字段**每次必给**。
   * 位字段为布尔、寄存器字段为数值。
   *
   * **不能用 `||` 判空**：`false`（位 = 关）与 `0` 都是有效缺省值，只有 `== null` 才算没填。
   */
  value?: boolean | number;
}

/**
 * 请求帧的结构化定义：一次调用的请求帧由**后端**在 invoke 时现组（含 CRC16），不再由前端算好
 * 一整个 16 进制字符串塞进来（对应后端 `ModbusFunctionRequest`）。
 *
 * 与点表的命令同为 **fc 中心**：读写方向与寄存器区都由 {@link fc} 推出，模型里没有 area / rw 字段。
 * 方向决定另外两个字段谁有效，二者互斥：
 *
 * - **读**（01/02/03/04）：只有 {@link quantity}，{@link fields} 必须为空 —— 读请求里没有「写入字段」；
 * - **写**（05/06/0F/10）：只有 {@link fields}，{@link quantity} 必须不填 ——
 *   帧里的数量由字段偏移与跨度推出来（0F 是位数、10 是寄存器数），再让人填一遍就是第二个真相来源。
 */
export class ModbusFunctionRequest {
  /** 从站地址（帧首字节）；同一服务的各方法必须一致，1..247 */
  slaveId: number = 0;
  /** 功能码：01/02/03/04 读 · 05/06/0F/10 写（两位大写 16 进制，如 `03`） */
  fc: string = '';
  /** 起始地址（0 基线上地址，与点表命令的 start 同口径），0..65535 */
  start: number = 0;
  /**
   * 读方法的数量：**帧里那个数量字段的字面值**（01/02 为位数、03/04 为寄存器数）。
   *
   * 注意与点表口径不同：点表 quantity 是「值的个数」，按命令唯一 dataType 乘跨度换算；
   * 服务里每个应答字段各带自己的 format/bytes，请求侧无从得知每个值占多宽，
   * 故这里直接写线上数字，后端再拿它与 response 的字节数对账。
   */
  quantity?: number;
  /** 写方法的写入字段：决定数据区的内容与排列；读方法为空 */
  fields?: ModbusFunctionRequestField[];
}

/**
 * 一个方法的应答定义：目前只有 {@link fields}（对应后端 `ModbusFunctionResponse`）。
 *
 * 包一层而不是把字段表直接挂在 {@link ModbusFunction} 上，一是与 request 对称，
 * 二是给「应答级」的设定（异常码文案、缺省字节序、期望帧长）留位子。
 * **写方法整段没有这个对象** —— 应答是请求回显，没有读值。
 */
export class ModbusFunctionResponse {
  /** 应答解析规则：按 index 顺序、以 bytes 依次累加偏移切分应答数据区；读方法必须非空 */
  fields: ModbusFunctionResponseField[] = [];
}

/**
 * 服务里的一个方法：一次依赖设备调用 = 一帧请求 + 一条应答解析规则。
 *
 * 读方法（点表 fc 01/02/03/04）有 response；写方法（fc 05/06/0F/10）的应答是请求回显、
 * 没有读值，**response 整段不出现**（undefined，不是空对象）。
 */
export class ModbusFunction {
  /** 方法序号（1 起自然数，服务内唯一；通常取点表功能码动作的 index） */
  index: number = 0;
  /** 方法名称（展示用，如 读蒸发器进水温度） */
  name: string = '';
  /** 请求帧定义：invoke 时由后端按它现组帧（含 CRC16）交给设备发送 */
  request: ModbusFunctionRequest = new ModbusFunctionRequest();
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
  /** 应答定义；**写方法没有这个键**（读方法必须有） */
  response?: ModbusFunctionResponse;
}

/**
 * 当前前端**能读写**的定义版本（与后端 `ModbusService.VERSION` 同步）。
 *
 * v1 的 `request` 是一整串 hex 帧、`response` 是裸数组，前端不再兼容：读到 `version !== 2`
 * 的记录一律只提示（见设备服务详情页 / 编辑页的迁移横幅），编辑与调用都禁用，
 * 等 `scripts/migrate-service-request-v2.sh` 迁完再用。
 */
export const MODBUS_SERVICE_VERSION = 2;

/** Modbus 服务（后端 ModbusServiceResource，/matrix/v1/modbus/service） */
export class ModbusService {
  /** 十六进制字符串主键（后端生成） */
  id?: string;
  /** 服务名称（展示用，如 1 号冷水机组） */
  name: string = '';
  /** 定义格式版本号：functions 内部结构演进时递增（v2 = request 结构化 + response 包一层） */
  version?: number;
  /** 源点表配置 ID（溯源用：本服务由哪条点表映射而来） */
  configId?: string;
  /** 依赖设备的调用坐标 + 所在空间 */
  device: ModbusServiceDevice = new ModbusServiceDevice();
  /** 方法列表 */
  functions: ModbusFunction[] = [];
  creator?: ModbusPerson;
  updater?: ModbusPerson;
}
