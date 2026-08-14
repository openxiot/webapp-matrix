import type {EChartsCoreOption} from 'echarts/core';
import type {AlarmStats, DeviceStats, EnergyStats} from './dashboard.mock';

/**
 * 数据看板图表 option 构造（纯函数）。
 * 传入翻译器 t（i18n 键 -> 当前语言文案），legend/系列名据此本地化。
 */

/** 环形饼图（legend 右侧） */
function pieOption(data: {name: string; value: number}[]): EChartsCoreOption {
  return {
    tooltip: {trigger: 'item', formatter: '{b}: {c}'},
    legend: {orient: 'vertical', right: 8, top: 'middle'},
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['38%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {borderRadius: 6, borderColor: '#fff', borderWidth: 1},
        label: {show: false},
        data,
      },
    ],
  };
}

/** 折线图（面积渐变） */
function lineOption(xData: string[], yData: number[]): EChartsCoreOption {
  return {
    tooltip: {trigger: 'axis'},
    grid: {left: 44, right: 16, top: 24, bottom: 24},
    xAxis: {type: 'category', boundaryGap: false, data: xData, axisLabel: {interval: 4}},
    yAxis: {type: 'value', splitLine: {lineStyle: {type: 'dashed'}}},
    series: [
      {
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: yData,
        lineStyle: {width: 2},
        areaStyle: {opacity: 0.15},
      },
    ],
  };
}

export function deviceTypeOption(s: DeviceStats, t: (key: string) => string): EChartsCoreOption {
  return pieOption(s.byType.map((d) => ({name: t(d.type), value: d.count})));
}

export function energyOption(s: EnergyStats, _t: (key: string) => string): EChartsCoreOption {
  return lineOption(s.daily.map((d) => d.date), s.daily.map((d) => d.value));
}

export function alarmTypeOption(s: AlarmStats, t: (key: string) => string): EChartsCoreOption {
  return pieOption(s.byType.map((d) => ({name: t(d.type), value: d.count})));
}

export function alarmCurveOption(s: AlarmStats, _t: (key: string) => string): EChartsCoreOption {
  return lineOption(s.curve.map((c) => c.time), s.curve.map((c) => c.count));
}
