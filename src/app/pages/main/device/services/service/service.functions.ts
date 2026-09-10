/**
 * 把一条设备点表展开成 Modbus 服务的方法列表（functions）：**一个功能码动作 → 一个方法**，
 * 序号沿用动作的 index（功能码以序号为关键字），名称沿用动作名。
 *
 * - `request`：完整的 Modbus RTU 帧（含 CRC16），复用点表编辑器那套生成器
 *   （request.frame 的 buildRequestFrame），此处只把展示用的空格去掉；
 * - `response`：读动作（01/02/03/04）出一个应答字段（一个动作就是一个参数），
 *   写动作（05/06/0F/10）的应答是请求回显、没有读值，给空数组。
 *
 * 纯函数、无 Angular 依赖，供「添加/编辑服务」页在选中点表后即时展开成只读预览。
 */
import {
  ModbusCommand,
  ModbusConfig,
} from '../../../../../typedef/define/modbus/Modbus';
import {
  ModbusServiceField,
  ModbusServiceFunction,
} from '../../../../../typedef/define/modbus/ModbusService';
import { buildRequestFrame } from '../../../modbus/editor/request/request.frame';

/** 读功能码（01–04）；写功能码 05/06/0F/10 不产生应答字段 */
const READ_FCS = new Set(['01', '02', '03', '04']);
/** 读位功能码：数量是位数，不是寄存器数 */
const BIT_FCS = new Set(['01', '02']);

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
 */
function responseOf(command: ModbusCommand): ModbusServiceField[] | null {
  if (!READ_FCS.has(command.fc)) {
    // 写动作：应答是请求回显，没有读值
    return [];
  }

  const quantity = command.quantity ?? 1;
  // 读寄存器按每个寄存器 2 字节；读位按位数向上取整到字节
  const bytes = BIT_FCS.has(command.fc) ? Math.ceil(quantity / 8) : quantity * 2;
  if (bytes < 1) {
    return null;
  }

  const field: ModbusServiceField = {
    index: 1,
    field: command.name,
    bytes,
    format: formatOf(command.dataType, bytes),
  };
  if (bytes > 1) {
    field.byteOrder = command.byteOrder ?? 'ABCD';
  }
  if (command.scale != null) {
    field.scale = command.scale;
  }
  if (command.unit) {
    field.unit = command.unit;
  }
  return [field];
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

/** 应答字段的展示文案：字段名 类型/字节数 [字节序] [×缩放] [单位] */
export function describeServiceField(field: ModbusServiceField): string {
  const parts = [`${field.field}`, `${field.format}/${field.bytes}B`];
  if (field.byteOrder) {
    parts.push(field.byteOrder);
  }
  if (field.scale != null) {
    parts.push(`×${field.scale}`);
  }
  if (field.unit) {
    parts.push(field.unit);
  }
  return parts.join(' ');
}

/** 一个方法的应答字段文案；写方法（无 response）返回提示文案 */
export function describeFunctionResponse(func: ModbusServiceFunction): string {
  if (!func.response || func.response.length === 0) {
    return '写方法（应答为请求回显，无返回字段）';
  }
  return func.response.map(describeServiceField).join('，');
}
