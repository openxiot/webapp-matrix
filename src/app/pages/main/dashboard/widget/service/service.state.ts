/**
 * 服务卡的**状态判定与逐行渲染**（纯函数，无注入，无 Angular 依赖）。
 *
 * 抽出来的理由不是「组件里少写几行」，而是这两件事都是**判断**：卡片有四种状态、值有三种说法
 * （数值 / 位 / 没取到），写在模板里就得靠 `@if` 叠 `@if`，而这几种组合恰恰是最需要被
 * 一个一个钉住的东西。放在这里就能用纯 JUnit 式的 spec 穷举，不必 TestBed。
 *
 * 翻译函数由调用方传进来：本文件不认识 i18n 服务，与 `service.functions.ts` /
 * `modbusFailureLabel` 同一条做法。
 */
import { modbusValueText } from '../../../../../typedef/define/modbus/ModbusHistory';
import {
  ServiceData,
  ServiceFieldRow,
  WebDashboardWidgetDataItem,
} from '../../../../../typedef/define/dashboard/WebDashboardWidgetData';
import { readBoolean } from '../../dashboard.config';

/**
 * 卡片这一刻处于哪一态。四态互斥，按**优先级**从上到下判：
 *
 * - `loading`：**还没取到**（`item` 是 `undefined`）。首屏那几百毫秒、两次自动刷新之间都是它。
 *   卡片留白而不是画四行 `-` —— 后者看着像「采到了，恰好都是空值」。
 * - `failed`：**这张卡的取数整个失败了**（`success: false`）。服务端那句话就是原因
 *   （服务被删了、不属于本空间、取数炸了），由 `dashboard-widget-note` 原样显示。
 * - `notCollected`：取数成功，但**这个方法一条影子都没有** —— 服务端只回了 `functionIndex`。
 *   这是「还没采过」，不是「采到了空值」。
 * - `ok`：有东西可显示（可能一行行的值都是 `-`，那是「采过，但这几个字段这轮没值」，
 *   与 `notCollected` 是两回事）。
 */
export type ServiceCardState = 'loading' | 'failed' | 'notCollected' | 'ok';

export function serviceState(
  item: WebDashboardWidgetDataItem | undefined,
  data: ServiceData,
): ServiceCardState {
  if (!item) {
    return 'loading';
  }
  if (!item.success) {
    return 'failed';
  }
  // 两者都没有 = 服务端除了方法序号什么都没说 = 这个方法还没有影子。
  // **不只看 `recordedAt`**：影子在、但一次都没成功采过时，服务端给的是「一行行没值的字段
  // + lastError」，那种情况该显示那些字段（配上失败标识），而不是一句「尚未采集」把
  // 「哪几个字段配上了」也一并藏掉。
  return data.fields.length === 0 && data.recordedAt === undefined ? 'notCollected' : 'ok';
}

/** 卡片身子里的一行 */
export interface ServiceLine {
  /** 字段名（键）。**用户填的点表数据**，原样显示、不翻译 */
  field: string;
  /** 值那一栏的文案：数值、`开`/`关`（位）、或 `-`（这一轮没值） */
  text: string;
  /** 单位那一栏的文案；空串 = 不显示 */
  unit: string;
}

/**
 * 把读数摊成一行行 `字段: 值 单位`。
 *
 * 行的**顺序来自服务端**（它按 `config.fields` 的配置顺序产出）：用户选的就是这个顺序，
 * 这里再排一次只会多一处可能与配置不一致的地方。
 *
 * 三条文案口径：
 * - **没值说 `-`**（`0` 是有效读数，说 `0`）；
 * - **位说「开/关」**：这是可翻译的解释，故落在这里而不是服务端（§D5 与修订（十））——
 *   服务端只说「这是个位」，怎么说由前端决定；
 * - **单位按 `showUnit` 缀**，缺省显示。单位是用户自己填的点表数据，不是文案。
 */
export function serviceLines(
  data: ServiceData,
  config: Record<string, unknown> | undefined,
  t: (key: string) => string,
): ServiceLine[] {
  const showUnit = readBoolean(config, 'showUnit', true);
  return data.fields.map((row) => ({
    field: row.field,
    text: rowText(row, t),
    unit: showUnit ? row.unit : '',
  }));
}

/** 一个字段这一轮的文案 */
function rowText(row: ServiceFieldRow, t: (key: string) => string): string {
  const value = row.value;
  if (value === undefined) {
    return '-';
  }
  if (row.bit) {
    // 位恒是 0/1；给出别的东西（后端改了返回类型）时按原样显示，
    // 总比把它硬说成「开」或「关」好 —— 那会凭空造出一个不存在的读数
    if (value === 1 || value === true) {
      return t('开');
    }
    if (value === 0 || value === false) {
      return t('关');
    }
  }
  return modbusValueText(value);
}
