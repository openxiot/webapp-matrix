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
 * 位区字段里的具名位：除字段自身那份整段位掩码外，把该位单独作为一个 0/1 取值输出（key 即 field）。
 *
 * 偏移是 0 基、从位区起点（请求的起始地址）算起；帧内按 LSB-first 取位，
 * 即第 `offset/8` 个数据字节的第 `offset%8` 位。
 */
export class ModbusServiceFieldBit {
  offset: number = 0;
  /** 该位的取值名：invoke 返回值里这个位的 key */
  field: string = '';
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
  /** 应答解析规则；空数组表示写方法 */
  response: ModbusServiceField[] = [];
}

/** Modbus 服务（后端 ModbusServiceResource，/matrix/v1/modbus/service） */
export class ModbusService {
  /** 十六进制字符串主键（后端生成） */
  id?: string;
  /** 所属组织（取 X-Org-Id，不由请求体决定） */
  orgId?: string;
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
