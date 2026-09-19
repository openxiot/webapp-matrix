import {
  WebDashboardWidgetData,
  WebDashboardWidgetDataItem,
} from '../../define/dashboard/WebDashboardWidgetData';

/**
 * 取数结果与 JSON 的互转。**只解不编**：这份数据是后端算出来的，前端没有回写它的请求体
 * （编辑器的预览也是走同一个 POST，发的仍是布局而不是取数结果）。
 *
 * 与 `OverviewStatisticsCodec` 不同，这里**不把 `data` 拆成具体类型**：一张卡的 `data`
 * 长什么样由它的 `type` 决定，而 codec 手里只有一份 `data`。按类型解是渲染侧的事，
 * 那里才知道这张卡是什么 —— 见 `statData()` / `distributionData()` / `lineData()`。
 *
 * `success: false` 的卡片**照样解出来**（`data` 收成空对象、`message` 原样留着）：
 * 一屏里有一张卡失败是常态（它的点位不属于本空间、或那个窗口取数炸了），
 * 把失败项过滤掉会让「卡片数对不上」变成一件要查的事。
 */
export class WebDashboardWidgetDataCodec {
  static decode(o: any): WebDashboardWidgetData {
    const x = new WebDashboardWidgetData();
    x.spaceId = o?.spaceId ?? '';
    x.from = o?.from ?? 0;
    x.to = o?.to ?? 0;
    x.widgets = WebDashboardWidgetDataCodec.decodeItems(o?.widgets);
    return x;
  }

  static decodeItems(rows: any): WebDashboardWidgetDataItem[] {
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows.map((row) => WebDashboardWidgetDataCodec.decodeItem(row));
  }

  static decodeItem(o: any): WebDashboardWidgetDataItem {
    const x = new WebDashboardWidgetDataItem();
    x.id = o?.id ?? '';
    x.success = o?.success === true;
    x.data = o?.data && typeof o.data === 'object' ? o.data : {};
    x.message = typeof o?.message === 'string' ? o.message : undefined;
    return x;
  }
}
