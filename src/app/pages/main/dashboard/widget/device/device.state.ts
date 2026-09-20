/**
 * 设备卡的**状态判定与那一行读数**（纯函数，无注入，无 Angular 依赖）。
 *
 * 与 `../service/service.state.ts` 同一个理由抽出来：这里是判断（三态、名字与单位各来自哪里），
 * 写在模板里就得靠 `@if` 叠 `@if`，而这几种组合恰恰最需要被一个一个钉住。
 */
import { modbusValueText } from '../../../../../typedef/define/modbus/ModbusHistory';
import { DeviceData, WebDashboardWidgetDataItem } from '../../../../../typedef/define/dashboard/WebDashboardWidgetData';
import { DeviceProperty } from '@app/service/device.spec.service';
import { readBoolean } from '../../dashboard.config';

/**
 * 卡片这一刻处于哪一态。三态互斥，按优先级从上到下判：
 *
 * - `loading`：**还没取到**（`item` 是 `undefined`）。卡片留白。
 * - `failed`：**这张卡整个失败了**（`success: false`）。服务端那句话就是原因。
 * - `ok`：取到了。**包括「这个属性还没有读数」**——那种情况卡片显示 `名字: -`
 *   （见 {@link deviceLine}）。
 *
 * **没有「尚未上报」这一态**（服务卡有 `notCollected`）：那是一张卡整段换成一句提示的写法，
 * 而设备卡身子里只有**一行**，那一行里的属性名是这张卡唯一说明「我在看什么」的地方 ——
 * 把它换成一句「尚未采集」，卡片就看不出配的是温度还是压力了。`-` 已经把「没有读数」说清楚了。
 */
export type DeviceCardState = 'loading' | 'failed' | 'ok';

export function deviceState(item: WebDashboardWidgetDataItem | undefined): DeviceCardState {
  if (!item) {
    return 'loading';
  }
  return item.success ? 'ok' : 'failed';
}

/** 卡片身子里那一行 */
export interface DeviceLine {
  /** 属性名。规格里查得到就用规格的名字，查不到退回 pid 原文（见 {@link deviceLine}） */
  name: string;
  /** 值那一栏的文案：读数，或 `-`（还没有上报过 / 这一轮没值） */
  text: string;
  /** 单位那一栏的文案；空串 = 不显示 */
  unit: string;
}

/**
 * 摊成那一行 `属性名: 值 单位`。
 *
 * 三条文案口径：
 * - **没值说 `-`**（`0` 是有效读数，说 `0`）—— 与 `serviceLines` 同一句；
 * - **名字查不到规格就用 pid 原文**：显示一串 `abc.1.1` 看着糙，但它说明了「这个 pid 在产品
 *   规格里找不到」，而空白只说明了「这里没东西」；编一个名字是最坏的（无从排查）；
 * - **单位按 `showUnit` 缀**，缺省显示。单位是产品规格里的数据，不是文案。
 */
export function deviceLine(
  data: DeviceData,
  property: DeviceProperty | undefined,
  config: Record<string, unknown> | undefined,
): DeviceLine {
  return {
    name: property?.name || data.pid || '-',
    text: modbusValueText(data.value),
    unit: readBoolean(config, 'showUnit', true) ? (property?.unit ?? '') : '',
  };
}
