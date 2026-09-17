import {
  DashboardWidget,
  GRID_GAP,
  GRID_ROW_HEIGHT,
  WidgetSize,
  WIDGET_SIZES,
} from '../../../typedef/define/dashboard/DashboardLayout';

/**
 * 网格排版（纯函数，无注入）。
 *
 * **顺序即位置**：卡片没有坐标，`DashboardLayout.widgets` 的**数组顺序**就是屏幕顺序。
 * 排版是**流式**的 —— 从左上往右下铺，一行放不下就换行（浏览器按 24 列网格自己算，
 * 见 `home.component.html` 的 `.board`），所以这一层只剩下「档位 → 占格 / 像素高」这一件事。
 *
 * 这里原来有一整套坐标运算（`compactLayout` 上吸消洞、`findSlot` 扫空位、`moveInOrder`
 * 换位置、`boardRows` 按 `y` 分行），随坐标一起删掉了：空档与「架在别人下面的卡」在流式
 * 排布里根本不存在，而顺序由拖拽直接给出 —— 那套运算做的其实就是「用顺序重算坐标」，
 * 现在顺序本身就是真值，不必再算一遍。
 */

/**
 * 卡片按档位占几列几行。
 *
 * 档位不认识时退回 `S`：那意味着库里存着一个将来某个版本写的档位，给个小格子总比给个
 * 撑满屏幕的格子好（渲染不出来还能看见，占满一屏则整页都毁了）。
 */
export function sizeOf(widget: DashboardWidget): { w: number; h: number } {
  return WIDGET_SIZES[widget.size as WidgetSize] ?? WIDGET_SIZES.S;
}

/**
 * 卡片在屏幕上多高（像素）：`h` 个行高，中间 `h − 1` 道缝。
 *
 * 这两个数**只有一处常量**（`DashboardLayout` 的 `GRID_ROW_HEIGHT` / `GRID_GAP`）。
 * 抄进样式表就是第二处 —— 改了档位表却漏改它，卡片与它占的格子就对不上了。
 *
 * 网格的自动行高本来就能把一行拉到最高的那张卡那么高，但卡片**自己**仍要一个确切的高度：
 * 不拉伸（`align-items: start`）是排版的决定，而卡片内部（ECharts 容器）需要一个有界的父级
 * 才知道自己该画多大。
 */
export function cardHeight(h: number): number {
  return h * GRID_ROW_HEIGHT + (h - 1) * GRID_GAP;
}
