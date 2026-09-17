/**
 * 字段曲线卡（`line` 的 `source: 'serviceField'` 那一支）的适配：把 render 下发的 data
 * 读成历史页那套 {@link historyFieldOption} 要的输入。
 *
 * **为什么只有这一个文件**：曲线的画法（阶梯线、降采样时的 min/max 虚线、失败竖线、carryIn
 * 补在窗口起点）在历史页已经有一份实现，看板再写一份的代价不是「多几行」，而是同一个字段在
 * 两个页面上画得不一样 —— 而「哪一处才是对的」没有答案。所以这里只做**形状转换**：
 * data → `HistoryFieldSeries` / `HistoryChartContext`，画法一律交给那边。
 *
 * 放在 `widget/line/` 而不是 `typedef/define/dashboard/DashboardWidgetData.ts`：`define/`
 * 目录不许 import `codec/`（分层规则，见 `DashboardWidgetData.ts` 开头），而这里要用
 * `ModbusHistoryCodec.decodeRange` 复用历史页同一份反序列化口径；同时它又要 import 历史页的
 * `historyFieldOption`，那是**页面**之间的横向依赖，`dashboard.charts.ts` 那种「看板自己画的两张图」
 * 不该被拉进来。
 */
import { ModbusHistoryCodec, isBucket } from '../../../../../typedef/codec/modbus/ModbusHistoryCodec';
import {
  ModbusHistoryRange,
  ModbusHistorySample,
} from '../../../../../typedef/define/modbus/ModbusHistory';
import { WidgetDataItem } from '../../../../../typedef/define/dashboard/DashboardWidgetData';
import {
  HistoryChartContext,
  HistoryFieldSeries,
} from '../../../device/services/service/history/device.service.history.charts';
import { readString } from '../../dashboard.config';

/**
 * 字段曲线的 data：`/history/range` 的响应体 + 三样展示元数据。
 *
 * 前一半（`range`）与历史页的取数**是同一个形状、同一个 codec**（后端也是同一个编码器，
 * 见 `ModbusHistoryRangeCodec`）；后三样只有看板这一路有 —— 历史页的元数据来自它自己已经
 * 拿在手上的服务定义，而卡片手里什么都没有，所以服务端随数据一起发下来。
 */
export class ServiceFieldData {
  /** 序列。`from` / `to` 是**服务端解析后的真实区间**，不是卡片 config 里那个语义窗口 */
  range: ModbusHistoryRange = new ModbusHistoryRange();
  /** 单位（y 轴名）。**用户填的点表数据**，原样显示、不翻译；位恒为空串 */
  unit: string = '';
  /** 是不是位：位用阶梯线（0 一直保持到下一次翻转），直连会画出根本不存在的中间值 */
  step: boolean = false;
  /**
   * 该方法在窗口内的采集失败时刻（毫秒），画成竖虚线。
   *
   * **服务端一律取回来，画不画由 `showFailureShadow` 定**：取数层不跟展示开关耦合 ——
   * 否则「关掉竖线」会变成「不发这次查询」，而这个开关只该影响画出来的东西。
   */
  failures: number[] = [];
}

/** 把一张卡的 data 读成 {@link ServiceFieldData}（防御性，坏项丢掉而不是整份作废） */
export function serviceFieldData(item: WidgetDataItem): ServiceFieldData {
  const data = new ServiceFieldData();
  data.range = ModbusHistoryCodec.decodeRange(item.data);
  data.unit = readString(item.data, 'unit') ?? '';
  // 只有真正的 `true` 才算位：脏值按「不是位」走（直连），与 `readBoolean` 同口径 ——
  // 位画成直连只是难看，数值字段画成阶梯却是**错的**，这一侧的错误代价更大
  data.step = item.data['step'] === true;
  data.failures = millisOf(item.data['failures']);
  return data;
}

/**
 * 坐标系：**用 data 里的 `from` / `to`**。
 *
 * 相对窗口（「最近 24 小时」）存的是语义，真实区间要等服务端按它的「现在」解析出来 ——
 * 前端拿浏览器时间算一份，跨时区或刷新慢一拍时会与数据本身对不上（点画在轴外面）。
 * `showTimeAxis` 恒为 true：卡片只有一张图，没有「上面那几张不画刻度」这回事。
 */
export function serviceFieldContext(data: ServiceFieldData): HistoryChartContext {
  return { from: data.range.from, to: data.range.to, showTimeAxis: true };
}

/**
 * 一张图的输入。`field` 只作标题用（`historyFieldOption` 自己不读它），仍是**用户填的字段名**，
 * 原样给、不翻译。
 */
export function serviceFieldSeries(
  data: ServiceFieldData,
  field: string,
  showFailureShadow: boolean,
): HistoryFieldSeries {
  return {
    field,
    unit: data.unit,
    step: data.step,
    range: data.range,
    // 关掉竖线 = 传一个空清单，而不是在图上把 markLine 抹掉：画不画是这一个判断
    failures: showFailureShadow ? data.failures : [],
  };
}

/**
 * 窗口里有没有一个画得出来的读数。
 *
 * **非数值点位整条线都是断点**：取值表命中的字段值直接是描述串，`historyFieldOption` 只把数值
 * 塞进序列，其余留空。那种曲线画出来是一个空坐标系 —— 比一句「暂无数据」更让人以为图坏了。
 * 降采样桶同理：非数值字段的 `avg` / `min` / `max` 全是 null（后端明说），只有 `first` / `last`
 * 有值，而那两样不该拿来连线。
 *
 * `carryIn` 算一个点：它是窗口起点那一刻的真实读数（窗口内一条样本都没有、值却一直没变时，
 * 画面上就是这一个点）。
 */
export function hasDrawablePoints(range: ModbusHistoryRange): boolean {
  if (numeric(range.carryIn)) {
    return true;
  }
  for (const point of range.points) {
    if (isBucket(point) ? point.avg !== null : typeof point.value === 'number') {
      return true;
    }
  }
  return false;
}

/**
 * 窗口里**一个点都没有**（连窗口之前那条 `carryIn` 也没有）。
 *
 * 这一态与「有样本、但画不出来」是两件事，卡片也要说两句不同的话：前者是这个点位还没采过
 * （或那段窗口里没采），说 `尚未采集`；后者是字段非数值（`hasDrawablePoints` 为假），
 * 样本就在眼前，说「暂无数据」就够 —— 硬说「尚未采集」是错的。
 *
 * `carryIn` 在时不算「一个点都没有」：窗口之前那条样本是真实的读数，只是窗口内没有再变过。
 */
export function hasNoPoints(range: ModbusHistoryRange): boolean {
  return range.points.length === 0 && !range.carryIn;
}

/** 一个样本的值是不是数值（`carryIn` 缺失时给它 `undefined`，这里一并挡掉） */
function numeric(sample: ModbusHistorySample | undefined): boolean {
  return typeof sample?.value === 'number';
}

/**
 * 读失败时刻清单（毫秒）。
 *
 * 坏项逐个丢：一条脏数据不该让整排竖线消失 —— 那种表现是「这段时间没失败过」，是**说反了**。
 */
function millisOf(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((at): at is number => typeof at === 'number' && Number.isFinite(at));
}
