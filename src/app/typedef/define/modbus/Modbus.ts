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
  /** 序号（1 起自然数）：功能码动作在点表内的顺序。前端行排序依赖它；后端生成虚拟设备实例时 action 的 iid = 该 index。 */
  index: number;
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
 * 设备类型：品类 DeviceType + 产品规范/产品类型的多语文案快照。
 *
 * 与后端 {@code ModbusDeviceType} 对齐：选择设备类型时把「产品规范（名字空间）」与「产品类型」的
 * 多语文案一并随 {@code type} 落库，详情/列表直接展示文案，无需再回产品服务目录查询。
 * 存量旧配置仅迁出 {@code type} URN，两个描述 Map 可能为空（展示回退到按 URN 解析）。
 */
export interface ModbusDeviceType {
  /** 品类 DeviceType（完整 URN），如 urn:xiot-spec:device:chiller:0000A005 */
  type: string;
  /** 产品规范（名字空间）多语文案，如 { 'zh-CN': '智能楼宇', 'en-US': 'Smart Building' } */
  specDescription?: Record<string, string>;
  /** 产品类型多语文案，如 { 'zh-CN': '冷水机组', 'en-US': 'Chiller' } */
  typeDescription?: Record<string, string>;
}

/**
 * 从站设备信息（厂家/型号/设备类型/描述）——Modbus 点表配置在服务端统一收拢为 slave 子对象
 * （`ModbusConfig#slave` / 请求体 `slave` / 响应 `slave` 回显同一形状），与线上 JSON 对齐。
 */
export interface ModbusSlave {
  /** 厂家/品牌，如 特灵/开利/麦克维尔 */
  manufacturer: string;
  /** 设备型号，如 19XRV/CVHG */
  model: string;
  /** 设备类型：品类 DeviceType + 多语文案快照（产品规范两级选择写入；新建必填） */
  type?: ModbusDeviceType;
  /** Modbus 从站地址 0-247 */
  slaveId?: number;
  description?: string;
}

/**
 * 设备点表的基础信息：= slave 子对象（厂家/型号/设备类型/从站地址/描述）+ 顶层可见度。
 * 供「设备信息」只读展示与编辑对话框共用的界面内部形状（非线上 JSON）。
 */
export interface ModbusDeviceInfo extends ModbusSlave {
  /** 可见度：private 私有 / public 公开 */
  visibility?: 'private' | 'public';
}

/**
 * 设备点表配置（服务端 Java 公有字段，可选字段后端可能缺省）：
 * 从站信息收拢在 slave 子对象下，可见度与功能码动作与 slave 平级。
 */
export interface ModbusDeviceConfig {
  id?: string;
  orgId?: string;
  /** 从站设备信息（厂家/型号/设备类型/从站地址/描述） */
  slave: ModbusSlave;
  /** 可见度：private 私有 / public 公开 */
  visibility?: 'private' | 'public';
  /** 生命周期（服务端存储串，与 xiot-spec Lifecycle 对齐）：development 开发 / preview 预览 / released 已发布。
   *  新建默认 development；仅 development 态允许修改，preview/released 锁定。缺省按 development 展示。 */
  lifecycle?: string;
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
