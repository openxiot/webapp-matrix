import type { EChartsCoreOption } from 'echarts/core';
import type { StatisticsBucket } from '../../../typedef/define/statistics/OverviewStatistics';
import { ChartPoint, hourLabels } from './dashboard.folding';

/**
 * 看板 schema 的两张图（纯函数，无注入）。
 *
 * **本文件只画 P1 这两种**：告警曲线（`line(alarmCount)`）与分布饼图（`distribution(pie)`）。
 * `bar` / `gauge` 排在 P3，届时要在 `echarts.directive.ts` 补注册组件（见 doc §5.5）——
 * 那之前校验器也不接受它们，所以这里没有对应函数不是遗漏。
 *
 * **没有翻译器参数**：图上每一个字都是服务端/用户数据（设备类型段、点表厂家型号、告警文本、
 * 字段名、单位），一律原样显示。可翻译的只有卡片标题，那是页面文案，在模板上走 `| translate`
 * （§7.5）。饼里那片「其他」的名字也一样 —— 由调用方翻译好再折进 `points`。
 *
 * 版式**刻意与被删掉的那张老首页一致**（同款环形饼、同款面积渐变折线）：§6.5 定的口径是
 * 「预置布局 = 当时那张首页」，好让这一屏接替上去时用户看到的是同一屏，只是从此可以改。
 * （老首页已于 2026-09-17 删除，这一屏就是首页 —— 见 doc §7.6。）
 */

/** 环形饼图（legend 在右）。片名过长时 legend 会自动换行，不额外截断 */
function pieOption(data: ChartPoint[]): EChartsCoreOption {
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c}' },
    legend: { orient: 'vertical', right: 8, top: 'middle', type: 'scroll' },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['38%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 1 },
        // 片名在 legend 里，扇区上不再标一遍：`S` / `M` 档的卡片放不下扇区标签
        label: { show: false },
        data,
      },
    ],
  };
}

/** 折线图（面积渐变）。`interval` 按横向空间给：24 个整点标签全画出来会糊成一片 */
function lineOption(xData: string[], yData: number[], labelInterval: number): EChartsCoreOption {
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 44, right: 16, top: 24, bottom: 24 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xData,
      axisLabel: { interval: labelInterval, hideOverlap: true },
    },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { type: 'dashed' } } },
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

/**
 * 告警曲线：整点桶。
 *
 * `bucket` 只有 `hour` 一种（`line(alarmCount)` 的校验器只认它），所以横轴就是整点标签。
 * 曲线用的是**后端密集零填充**的桶：没有告警的整点是 0 且在数组里，直接连线即可 ——
 * 前端不必猜「这段是没有告警还是没有数据」。
 *
 * 标签间隔取「让轴上有 6 个左右的刻度」：24 个桶每 4 个标一个，168 个桶（一周）每 28 个标一个
 * —— 固定间隔会让长窗口的轴糊掉、短窗口的轴过疏。
 */
export function alarmCurveOption(buckets: StatisticsBucket[]): EChartsCoreOption {
  const rows = buckets ?? [];
  return lineOption(
    hourLabels(rows),
    rows.map((bucket) => bucket.count),
    Math.max(0, Math.round(rows.length / 6) - 1),
  );
}

/**
 * 分布饼图。
 *
 * 传进来的 `points` **应当已经过「前 N + 其他」的截断**（`truncatePoints`）：截断是显示决策，
 * 放在折算那一层，切 `limit` 不必重新请求。这里不管片数多少、也不管空不空 ——
 * 空数据即得空图，页面另用 `nz-empty` 兜着，本函数不替页面决定「空了显示什么」。
 */
export function distributionOption(points: ChartPoint[]): EChartsCoreOption {
  return pieOption(points ?? []);
}
