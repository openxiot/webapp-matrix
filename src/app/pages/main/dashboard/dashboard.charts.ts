import type { EChartsCoreOption } from 'echarts/core';
import type { ModbusConfig } from '../../../typedef/define/modbus/Modbus';
import type { OverviewStatistics } from '../../../typedef/define/statistics/OverviewStatistics';
import type { EnergyStats } from './dashboard.mock';
import { ChartPoint, distributionData, hourLabels, serviceTypeData } from './dashboard.functions';

/**
 * 数据看板图表 option 构造（纯函数）。
 *
 * **没有翻译器参数**：三张饼里的每一片都是**服务端数据**（设备类型段 / 点表厂家型号 / 告警文本），
 * 一律原样显示。可翻译的是卡片标题，那是页面文案，在模板上走 `| translate`。
 *
 * 后端没数据（窗口内没有告警、项目里没有设备）时传入空数据即得空图，模板另用 `nz-empty` 兜着
 * —— 这里的函数不替页面决定「空了显示什么」。
 */

/** 环形饼图（legend 右侧） */
function pieOption(data: ChartPoint[]): EChartsCoreOption {
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c}' },
    legend: { orient: 'vertical', right: 8, top: 'middle' },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['38%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 1 },
        label: { show: false },
        data,
      },
    ],
  };
}

/** 折线图（面积渐变） */
function lineOption(xData: string[], yData: number[]): EChartsCoreOption {
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 44, right: 16, top: 24, bottom: 24 },
    xAxis: { type: 'category', boundaryGap: false, data: xData, axisLabel: { interval: 4 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed' } } },
    series: [
      {
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: yData,
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.15 },
      },
    ],
  };
}

/** 设备类型分布：按 URN 类型段（如 `dtu`）—— 服务端数据，原样显示 */
export function deviceTypeOption(o: OverviewStatistics | null): EChartsCoreOption {
  return pieOption(distributionData(o?.devices.byType ?? []));
}

/** 服务类型分布：按所配点表的「厂家 型号」，同名合并（见 {@link serviceTypeData}） */
export function serviceTypeOption(
  o: OverviewStatistics | null,
  configs: ModbusConfig[],
  undefinedLabel: string,
): EChartsCoreOption {
  return pieOption(serviceTypeData(o?.services.byConfig ?? [], configs, undefinedLabel));
}

/** 告警类型分布：按用户填的告警文本（缺文本的行后端归到 `UNKNOWN`）—— 原样显示 */
export function alarmTypeOption(o: OverviewStatistics | null): EChartsCoreOption {
  return pieOption(distributionData(o?.alarms.byText ?? []));
}

/** 告警曲线：近 24 小时整点桶（后端密集零填充，没发生的整点是 0） */
export function alarmCurveOption(o: OverviewStatistics | null): EChartsCoreOption {
  const hourly = o?.alarms.hourly ?? [];
  return lineOption(
    hourLabels(hourly),
    hourly.map((b) => b.count),
  );
}

/** 日能耗曲线（仍是 mock，见 dashboard.mock.ts） */
export function energyOption(s: EnergyStats): EChartsCoreOption {
  return lineOption(
    s.daily.map((d) => d.date),
    s.daily.map((d) => d.value),
  );
}
