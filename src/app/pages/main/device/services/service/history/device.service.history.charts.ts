import type { EChartsCoreOption } from 'echarts/core';
import {
  ModbusHistoryRange,
  ModbusHistorySample,
} from '@app/typedef/define/modbus/ModbusHistory';
import { isBucket } from '@app/typedef/codec/modbus/ModbusHistoryCodec';

/**
 * 采集历史曲线图的 option 构造（纯函数，供 history 页与将来别的页面复用）。
 *
 * 一个字段一张小图、竖向排列、**共享同一条时间轴**：所有图的 xAxis 都钉在同一个 [from, to] 上，
 * 只有最下面一张画时间刻度（上面的画了也是重复，还白占高度）。
 */

/** 画一张图需要的全部输入 */
export interface HistoryFieldSeries {
  /** 字段名（图的标题） */
  field: string;
  /** 单位（y 轴名）；取值表命中的字符串字段没有单位 */
  unit: string;
  /** true = 开关量（位区展开出来的 0/1），用阶梯线而不是直连 */
  step: boolean;
  /** 该字段在窗口内的序列 */
  range: ModbusHistoryRange;
  /** 该方法在窗口内的采集失败时刻（毫秒），在图上画成竖虚线 */
  failures: number[];
}

/** 一张图的公共参数（时间窗与是否画时间刻度） */
export interface HistoryChartContext {
  from: number;
  to: number;
  /** 只给最下面那张图开时间刻度 */
  showTimeAxis: boolean;
}

/** 失败竖线的颜色（antd 的 error 红） */
const FAILURE_COLOR = '#ff4d4f';
/** 数值型才画得出来：字符串（取值表命中）与 null 都跳过，留成断点 */
const LINE_COLOR = '#1677ff';

/**
 * 一个字段的曲线 option。
 *
 * 序列有两种形态，取决于窗口内的原始样本是否超过 maxPoints：
 * - 原始样本：一条线，点即读数；
 * - 降采样桶：一条均值线 + 两条虚线（每桶的最小 / 最大），如实表达「这一段是这么走的」，
 *   而不是拿均值假装成采样点。
 *
 * 另外把 `carryIn`（窗口之前最近的一条样本）补在 from 那一刻：不补的话曲线会从窗口内第一条
 * 采样点才开始，窗口左边缘凭空缺一截，看起来像「那段时间没采到」。
 */
export function historyFieldOption(
  series: HistoryFieldSeries,
  ctx: HistoryChartContext,
): EChartsCoreOption {
  const { range } = series;
  const avg: [number, number][] = [];
  const min: [number, number][] = [];
  const max: [number, number][] = [];

  const carry = range.carryIn ? numeric(range.carryIn.value) : null;
  if (carry != null) {
    avg.push([ctx.from, carry]);
    min.push([ctx.from, carry]);
    max.push([ctx.from, carry]);
  }

  for (const point of range.points) {
    if (isBucket(point)) {
      // 桶：三个统计量各自成线；非数值字段全是 null，那这一桶就不画
      push(avg, point.at, point.avg);
      push(min, point.at, point.min);
      push(max, point.at, point.max);
      continue;
    }
    push(avg, point.at, sampleValue(point));
  }

  const data: any[] = [line(avg, series.step, LINE_COLOR, 2)];
  if (range.downsampled) {
    // 最值用同色细虚线：一眼能看出这一段的范围，又不至于和均值线抢注意力
    data.push(line(max, series.step, LINE_COLOR, 1, 'dashed', 0.45));
    data.push(line(min, series.step, LINE_COLOR, 1, 'dashed', 0.45));
  }
  if (series.failures.length > 0) {
    data[0].markLine = failureMarkLine(series.failures);
  }

  return {
    animation: false,
    // 小图没有图例的位置：标题（字段名）在图表外，单位在 y 轴上
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      valueFormatter: (value: unknown) => (value == null ? '-' : String(value)),
    },
    grid: { left: 64, right: 16, top: 12, bottom: ctx.showTimeAxis ? 28 : 8 },
    xAxis: {
      type: 'time',
      min: ctx.from,
      max: ctx.to,
      axisLabel: { show: ctx.showTimeAxis, formatter: (value: number) => axisTime(value, ctx) },
      axisTick: { show: ctx.showTimeAxis },
    },
    yAxis: {
      type: 'value',
      name: series.unit,
      nameGap: 8,
      scale: true,
      splitLine: { lineStyle: { type: 'dashed' } },
    },
    series: data,
  };
}

/** 一条线的 series 定义；透明度只对最值那两条虚线用 */
function line(
  points: [number, number][],
  step: boolean,
  color: string,
  width: number,
  type: 'solid' | 'dashed' = 'solid',
  opacity = 1,
): any {
  return {
    type: 'line',
    data: points,
    showSymbol: false,
    // 开关量是阶梯变化（0 一直保持到下一次翻转），直连会画出根本不存在的中间值
    step: step ? 'end' : false,
    lineStyle: { width, type, color, opacity },
    itemStyle: { color, opacity },
    // 采样点多时按 LTTB 抽稀，保留转折点
    sampling: 'lttb',
    emphasis: { focus: 'series' },
  };
}

/** 采集失败画成竖虚线：失败是「某一刻没采到」，不是一段持续的值 */
function failureMarkLine(times: number[]): any {
  return {
    silent: true,
    symbol: 'none',
    label: { show: false },
    lineStyle: { color: FAILURE_COLOR, type: 'dashed', width: 1 },
    data: times.map((at) => ({ xAxis: at })),
  };
}

/** 只有有限的数值才画得出来（字符串取值、null 都留成断点） */
function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 原始样本的取值：数值才收，其余（取值表命中的描述串）跳过 */
function sampleValue(sample: ModbusHistorySample): number | null {
  return numeric(sample.value);
}

function push(target: [number, number][], at: number, value: number | null): void {
  if (value != null) {
    target.push([at, value]);
  }
}

/**
 * 时间刻度的粒度按窗口跨度选：一小时内给时分秒，一天内给时分，再长给月日时分。
 * （刻度是给「这几张图对齐着看」用的，粒度太细只会挤成一团。）
 */
function axisTime(value: number, ctx: HistoryChartContext): string {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const span = ctx.to - ctx.from;
  if (span <= 6 * 3600 * 1000) {
    return `${hm}:${pad(d.getSeconds())}`;
  }
  if (span <= 3 * 24 * 3600 * 1000) {
    return hm;
  }
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`;
}
