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

/** 应答字段的展示文案：字段名 类型/字节数 [字节序] [×缩放] [单位] [位: 名称@偏移 …] */
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
  if (field.bitList && field.bitList.length > 0) {
    // 逐位命名（01/02）：整段位掩码之外还会按位出 0/1，这里把位名与偏移一并展示
    parts.push(`位: ${field.bitList.map((bit) => `${bit.field}@${bit.offset}`).join(' ')}`);
  }
  return parts.join(' ');
}

/** 写方法（无 response）的提示文案 i18n key —— 页面自写文案，由调用方走翻译；响应的字段文案来自点表数据，不翻译。 */
export const WRITE_METHOD_REPLY_KEY = '写方法（应答为请求回显，无返回字段）';

/** 一个方法的应答字段文案；写方法（无 response）没有返回字段，返回 null 交给调用方给提示文案 */
export function describeFunctionResponse(func: ModbusServiceFunction): string | null {
  if (!func.response || func.response.length === 0) {
    return null;
  }
  return func.response.map(describeServiceField).join('，');
}
