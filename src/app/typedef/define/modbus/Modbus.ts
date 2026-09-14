/**
 * Modbus 设备点表（以功能码为中心）。
 *
 * 一行 = 一个功能码动作：读（01/02 读一个位区，逐位命名见 bitNames；03/04 读 quantity 个值，
 * 每个值的应答字段名见 fieldNames）或写（05 单线圈 / 06 单寄存器 / 0F 多线圈 / 10 多寄存器）。
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

/** 01/02 读位的单个位名称（位区按位打包，逐位取值靠它命名） */
export interface ModbusBitName {
  /** 位偏移（0 基，从起始地址起、< 位/线圈个数；与 0F 的线圈 offset 同口径） */
  offset?: number;
  /** 位名称（生成服务时作为该位的应答字段名，取值 0/1） */
  name?: string;
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
 * 字段按功能码分组出现：
 * - 01/02 读位：quantity（位/线圈个数）/ bitNames
 * - 03/04 读寄存器：quantity（值的个数）/ fieldNames / dataType / byteOrder / scale / unit
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
  /**
   * 数量：03/04 为**值的个数**（每个值占数据格式的寄存器跨度 int16/uint16→1、int32/uint32/float32→2；
   * string 时即字符串长度、整段算一个值，故恒为 1 个字段）；01/02 为位/线圈个数。
   * 请求帧里的数量 = 03/04 非 string 时 数量×跨度、其余即本值（见 readRegisterCount）。
   */
  quantity?: number;
  /**
   * 应答字段名称（03/04 读寄存器）：个数即应答字段数 —— 非 string 为 quantity 个、string 为 1 个；
   * 01/02 读位改用 {@link bitNames}，写操作没有应答字段。生成服务时逐个填进 response[].field。
   */
  fieldNames?: string[];
  /**
   * 位名称（01/02 读位）：给读回的位区里的若干位各自命名，生成服务时逐位填进应答字段的位清单
   * （bit-list），取值 0/1；缺省表示只按整段位掩码出一个字段。
   */
  bitNames?: ModbusBitName[];
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
 * 从站设备信息（厂家/型号/从站地址/描述）——Modbus 点表配置在服务端统一收拢为 slave 子对象
 * （`ModbusConfig#slave` / 请求体 `slave` / 响应 `slave` 回显同一形状），与线上 JSON 对齐。
 */
export interface ModbusSlave {
  /** 厂家/品牌，如 特灵/开利/麦克维尔 */
  manufacturer: string;
  /** 设备型号，如 19XRV/CVHG */
  model: string;
  /** Modbus 从站地址 0-247 */
  slaveId?: number;
  description?: string;
}

/**
 * 设备点表的基础信息：= slave 子对象（厂家/型号/从站地址/描述）+ 顶层可见度。
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
export interface ModbusConfig {
  id?: string;
  orgId?: string;
  /** 从站设备信息（厂家/型号/从站地址/描述） */
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

/**
 * 从站显示名：厂家 + 型号（如 `特灵 19XRV`）。
 *
 * 收成一份纯函数是因为这个拼法原先在**三个地方各写了一遍**（服务清单页的「点表名称」列、
 * 服务详情页的「源点表」、编辑页的点表下拉），三处必须逐字一致 ——
 * 首页「服务类型分布」那一饼的片名也用它，与服务清单页那一列因此天然同源。
 *
 * 两者都空（或 slave 整个缺失）时给**空串**：「没有名字该显示什么」是各页自己的事
 * （清单页与详情页显示 `-`，首页归到词典里的 `未定义`，编辑页退回 id）。
 * 厂家 / 型号是点表里的**数据**，原样给出、不进词典（见 AGENTS.md 的 i18n 一节）。
 */
export function modbusSlaveLabel(slave: ModbusSlave | undefined | null): string {
  return `${slave?.manufacturer?.trim() ?? ''} ${slave?.model?.trim() ?? ''}`.trim();
}

/**
 * 点表显示名：{@link modbusSlaveLabel}，拼不出来时**退回 id**（连 id 都没有才给空串）。
 *
 * `configs` 是页面上那份可见点表清单（点表可能已被删或不可见，故查不到是常态而不是错误）；
 * `configId` 为空 = 这个服务压根没配点表，直接给空串 —— 调用方据此显示 `-`，
 * 而不是把一个空 id 当成点表名。
 */
export function modbusConfigLabel(configs: ModbusConfig[], configId?: string | null): string {
  if (!configId) {
    return '';
  }
  const config = configs?.find((c) => c.id === configId);
  if (!config) {
    return configId;
  }
  return modbusSlaveLabel(config.slave) || configId;
}
