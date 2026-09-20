/**
 * Modbus 服务定义的**字段展开**：把一份方法列表摊成一张「能取到数的字段」清单 ——
 * 每个应答字段占一行，**位区里每一个命名位再各占一行**。
 *
 * 位为什么要单独成行：后端解析 01/02 时除整段位掩码外，还会按位把 0/1 写进返回值，
 * 所以每一个位都是**独立的结果键**（`invoke` 的返回值、历史的字段名、告警的 `field`
 * 用的都是位名）。整段掩码是一个数，位是另一个数，两者都得列出来。
 *
 * 本文件是**纯函数、无 Angular 依赖**，因为这三处的口径必须逐字一致：
 * - **历史页**（`device.service.history`）：表格列出全部字段、曲线图只用数值的；
 * - **看板编辑器**的服务卡片表单：服务 → 方法 → 字段三级级联的第三级；
 * - **看板的字段曲线**（P2 第 3 步）：同一个三元组。
 *
 * 各写一套的代价不是「多几行」而是**悄悄地不一致** —— 历史页列出某一个字段、编辑器却选不到，
 * 或者反过来：编辑器存进去了、卡片上永远显示 `-`。
 */
import {
  ModbusServiceField,
  ModbusServiceFunction,
} from '@app/typedef/define/modbus/ModbusService';

/** 一个能取数的字段（应答字段本身，或位区展开出来的某一位） */
export interface ServiceFieldRef {
  /** 同一个字段名可以出现在不同方法里，故键带上方法序号（见 {@link serviceFieldKey}） */
  key: string;
  functionIndex: number;
  /** 方法名。**用户填的点表数据**，原样显示、不翻译（空方法名就是空串） */
  functionName: string;
  /** 字段名。同样是用户填的点表数据 */
  field: string;
  /** 单位。**位恒为空串** —— 位是 0/1，没有「单位的」说法 */
  unit: string;
  /** 开关量（位区逐位展开出来的 0/1）：曲线走阶梯，不走直连 */
  step: boolean;
  /**
   * 数值才画得出来曲线：取值表命中时字段值直接是描述串、`format: 'string'` 同理，
   * **但表格照样列** —— 「这一轮读到的是哪个状态」是历史页要说的事之一。
   */
  numeric: boolean;
}

/**
 * 字段的缓存键 / 身份：`方法序号#字段名`。
 *
 * 字段名在方法之间可能重名（两个方法各有一个「温度」是完全正常的），只按字段名去重会把
 * 其中一个悄悄吃掉 —— 曲线少画一条、勾选列表里少一项，而界面上看不出少了什么。
 */
export function serviceFieldKey(functionIndex: number, field: string): string {
  return `${functionIndex}#${field}`;
}

/**
 * 展开字段清单。
 *
 * `functionIndex` 为 `0`（或省略）= 全部方法；给具体序号 = 只要那个方法。
 * **序号从 1 起**，0 是空位 —— 与 `ModbusServiceFunction.index` 一致，
 * 调用方就不必为了「全部」再传一个 `null`。
 *
 * 方法列表为空（服务未选 / 取不到）时给空数组，不抛。
 */
export function serviceFieldsOf(
  functions: ModbusServiceFunction[] | undefined,
  functionIndex: number = 0,
): ServiceFieldRef[] {
  const refs: ServiceFieldRef[] = [];
  for (const func of functions ?? []) {
    if (func == null || (functionIndex > 0 && func.index !== functionIndex)) {
      continue;
    }
    for (const field of func.response ?? []) {
      if (field == null) {
        continue;
      }
      refs.push(serviceFieldRef(func, field));
      for (const bit of field.bitList ?? []) {
        if (bit == null) {
          continue;
        }
        refs.push({
          key: serviceFieldKey(func.index, bit.field),
          functionIndex: func.index,
          functionName: func.name,
          field: bit.field,
          unit: '',
          step: true,
          numeric: true,
        });
      }
    }
  }
  return refs;
}

/** 应答字段本身那一行 */
function serviceFieldRef(func: ModbusServiceFunction, field: ModbusServiceField): ServiceFieldRef {
  return {
    key: serviceFieldKey(func.index, field.field),
    functionIndex: func.index,
    functionName: func.name,
    field: field.field,
    unit: field.unit ?? '',
    step: false,
    // 取值表命中时字段值直接是描述串（不再缩放），画不成曲线；string 同理
    numeric: field.format !== 'string' && (field.valueList ?? []).length === 0,
  };
}
