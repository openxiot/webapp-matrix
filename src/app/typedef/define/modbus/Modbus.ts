/**
 * Modbus 设备点表（以功能码为中心）。
 *
 * 一行 = 一个功能码动作：读（读一个参数，quantity = 该参数占用的寄存器/位个数）
 * 或写（05 单线圈 / 06 单寄存器 / 0F 多线圈 / 10 多寄存器）。
 * 读写方向与“寄存器区”由功能码决定，不再单独存 area/rw；
 * 逻辑地址不落库，由 fc + start 经 logicalAddressOf(fc,start) 实时换算。
 */

/** 功能码（十六进制大写） */
export type ModbusFc = '01' | '02' | '03' | '04' | '05' | '06' | '0F' | '10';

/** 字节序（32 位跨两个寄存器的四种排布；16 位只用 ABCD/DCBA） */
export type ModbusByteOrder = 'ABCD' | 'DCBA' | 'BADC' | 'CDAB';

/** 0F 写多线圈的单个线圈 */
export interface ModbusCoilItem {
  /** 相对偏移（0 基，< 线圈数量） */
  offset?: number;
  /** true=ON 打开 / false=OFF 关闭 */
  on?: boolean;
}

/** 10 写多寄存器的单个寄存器条目 */
export interface ModbusRegisterItem {
  /** 数据地址（0 基；须按类型跨度连续） */
  address?: number;
  /** int16 | uint16 | int32 | uint32 | float32 */
  dataType?: string;
  byteOrder?: ModbusByteOrder;
  /** 原始数值（按 dataType 取值；uint32/float32 可为 0..0xFFFFFFFF 位模式） */
  value?: number;
}

/**
 * 单个功能码动作。
 * 字段按功能码分组出现（见 command.options 的 FC_META）：
 * - 01/02 读位：quantity
 * - 03/04 读寄存器：quantity / dataType / byteOrder / scale / unit
 * - 05 写单线圈：coilState(on/off)
 * - 06 写单寄存器：registerValue
 * - 0F 写多线圈：coils[]
 * - 10 写多寄存器：registers[]
 */
export interface ModbusCommand {
  name: string;
  fc: ModbusFc;
  /** 起始地址 = 0 基数据地址（线上值） */
  start?: number;
  quantity?: number;
  dataType?: string;
  byteOrder?: ModbusByteOrder;
  scale?: number;
  unit?: string;
  coilState?: 'on' | 'off';
  registerValue?: number;
  coils?: ModbusCoilItem[];
  registers?: ModbusRegisterItem[];
}

/**
 * 设备点表的基础信息（厂家/型号/从站地址/可见度/描述）。
 * 与 ModbusDeviceConfig 前 5 个字段一致，供「设备信息」只读展示与编辑对话框共用。
 */
export interface ModbusDeviceInfo {
  /** 厂家/品牌，如 特灵/开利/麦克维尔 */
  manufacturer: string;
  /** 设备型号，如 19XRV/CVHG */
  model: string;
  /** Modbus 从站地址 0-247 */
  slaveId?: number;
  /** 可见度：private 私有 / public 公开 */
  visibility?: 'private' | 'public';
  description?: string;
}

/**
 * 设备点表配置（厂家 + 型号 + 描述 + 功能码动作列表；服务端 Java 公有字段，可选字段后端可能缺省）
 */
export interface ModbusDeviceConfig {
  id?: string;
  orgId?: string;
  /** 厂家/品牌，如 特灵/开利/麦克维尔 */
  manufacturer: string;
  /** 设备型号，如 19XRV/CVHG */
  model: string;
  /** Modbus 从站地址 0-247 */
  slaveId?: number;
  /** 可见度：private 私有 / public 公开 */
  visibility?: 'private' | 'public';
  description?: string;
  /** 功能码动作列表 */
  commands: ModbusCommand[];
  /** 创建者/创建时间 */
  creator?: ModbusPerson;
  /** 最后更新者/更新时间 */
  updater?: ModbusPerson;
}

/**
 * 操作人记录：创建者(creator)/最后更新者(updater)
 */
export interface ModbusPerson {
  id?: string;
  name?: string;
  /** epoch 毫秒时间戳 */
  timestamp?: number;
}
