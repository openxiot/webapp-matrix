/**
 * 单个采集点
 */
export interface ModbusPoint {
  name: string;
  /** input 输入寄存器 | holding 保持寄存器 | coil 线圈 | discrete_input 离散输入 */
  area?: string;
  address?: number;
  logicalAddress?: number;
  /** int16 | uint16 | int32 | uint32 | float32 | string */
  dataType: string;
  /** 由 area 固定：r 只读 / rw 读写（coil/holding→rw，discrete_input/input→r） */
  rw?: string;
  scale?: number;
  unit?: string;
  description?: string;
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
 * 设备点表配置（厂家 + 型号 + 描述 + 点位列表；服务端 Java 公有字段，可选字段后端可能缺省）
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
  points: ModbusPoint[];
  /** 创建者/创建时间 */
  creator?: ModbusPerson;
  /** 最后更新者/更新时间 */
  updater?: ModbusPerson;
}

