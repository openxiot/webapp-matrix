import {
  DashboardWidget,
  GRID_COLUMNS,
  GRID_GAP,
  GRID_ROW_HEIGHT,
  WidgetSize,
  WIDGET_SIZES,
} from '../../../typedef/define/dashboard/DashboardLayout';

/**
 * 网格排版：档位 → 占格 / 像素高，以及**二维摆放**的那套坐标运算（纯函数，无注入）。
 *
 * 屏幕是「宽 24 格、高无限」的网格。每张卡带 `x` / `y`（左上角起点，网格单位），
 * 占几列几行由 `size` 档位按 {@link WIDGET_SIZES} 算。行高 {@link GRID_ROW_HEIGHT} 挑了 92
 * 就是为了让**高度可以拼接**：两张一行高的卡竖着叠起来（`92 + 16 + 92`）正好等于一张两行高的卡。
 *
 * **这里的函数都是纯的、可重入的**：拖拽时每移动一像素都会重算一次整屏位置，
 * 于是每一次都必须是「从输入算输出」，不能积累状态。
 *
 * ## 改坐标的三条不变量
 *
 * 1. **幂等**：{@link compact} 的输出再进一次 {@link compact}，位置与顺序都不变。
 *    输出**一律按 `(y, x)` 重排** —— 这一条踩过坑：按吸**之前**的顺序处理、又原样返回，
 *    第二次进来就是另一组位置，表现成「每保存一次布局就自己重排一次」。
 * 2. **不重叠、不越界**：任何一次摆放之后，任意两张卡不重叠，且 `x ≥ 0`、`x + w ≤ 24`、`y ≥ 0`。
 * 3. **{@link flowPlace} 复刻旧的流式排版**：给它一串没有坐标的卡片（改造前存下来的布局），
 *    结果与改造前浏览器流式铺出来的**一模一样** —— 这是旧布局打开后长相不变的保证。
 *
 * ## 让位的口径：被拖的那张钉住，被压的往下让，**谁都不再往上吸**
 *
 * 用户要的是「人眼看上去可以占领的空间，那卡片就可以拖过去占领」，所以**拖到哪就落在哪**
 * （{@link placeAt}），不把它自己吸走 —— 否则「纵向占领空间」这件事根本做不到，
 * 而且拖动中那个落点框会骗人：瞄着一个位置松手却落到别处。
 *
 * 被它压到的卡片**往下让**，让出来的位置就留在那儿（{@link placeAt} 不再调 {@link compact}）。
 * 上吸曾经是有的，去掉是因为**用户摆的位置会自己跑**：他明明把卡拖到下面腾出来的空位上，
 * 一松手整屏吸上去，白摆一次。横向的留白也**保留**：那是用户自己摆的，
 * 替他挪等于擅自改版式。
 *
 * {@link compact}（只上吸）仍然留着，但只在**删掉一张卡**时用 —— 那一次不吸就是在版式里
 * 留一个洞，而那个洞只能靠手动拖别的东西过去补。
 */

/**
 * 一张卡在网格里的位置与占格。**这是这一层的通用货币** —— 各函数之间传的都是它，
 * 不是 `DashboardWidget`（那样每层都要重新查一次档位表）。
 */
export interface Placement {
  id: string;
  /** 起始列（0 起） */
  x: number;
  /** 起始行（0 起） */
  y: number;
  /** 占几列 */
  w: number;
  /** 占几行 */
  h: number;
}

/**
 * 卡片按档位占几列几行。
 *
 * 档位不认识时退回 `W6H200`（最小的常规档）：那意味着库里存着一个将来某个版本写的档位，
 * 给个小格子总比给个撑满屏幕的格子好（渲染不出来还能看见，占满一屏则整页都毁了）。
 *
 * **旧档位名（`S1` / `M1` / `S` / `M` / `L` / `XL`）在这里认不出来是对的** ——
 * 它们由 `DashboardLayoutCodec` 在读线格式时翻译成新名，能走到这里说明那个 widget
 * 不是从线格式来的（比如测试里直接造的）。真到了这儿也只是一个小格子，不会炸。
 */
export function sizeOf(widget: DashboardWidget): { w: number; h: number } {
  return WIDGET_SIZES[widget.size as WidgetSize] ?? WIDGET_SIZES.W6H200;
}

/**
 * 卡片在屏幕上多高（像素）：`h` 个行高，中间 `h − 1` 道缝。
 *
 * 这两个数**只有一处常量**（`DashboardLayout` 的 `GRID_ROW_HEIGHT` / `GRID_GAP`）。
 * 抄进样式表就是第二处 —— 改了档位表却漏改它，卡片与它占的格子就对不上了。
 *
 * 网格的 `grid-auto-rows` 也能把一格撑到该有的高度，但卡片**自己**仍要一个确切的高度：
 * 卡片内部（ECharts 容器）需要一个有界的父级才知道自己该画多大。
 */
export function cardHeight(h: number): number {
  return h * GRID_ROW_HEIGHT + (h - 1) * GRID_GAP;
}

/** 卡片 + 档位 → Placement。坐标缺失按 `0` 算，故**先问 {@link hasPlacements}** 再用 */
export function placementsOf(widgets: DashboardWidget[]): Placement[] {
  return widgets.map((widget) => {
    const size = sizeOf(widget);
    return { id: widget.id, x: widget.x ?? 0, y: widget.y ?? 0, w: size.w, h: size.h };
  });
}

/**
 * 这份布局的坐标是不是**齐全、在界内、互不重叠**。
 *
 * 三样一起判，是因为三样的补救办法是同一个（整份重铺），而分开判只会让调用方漏掉一种。
 * 重叠也算不合法：改造前的文档没有坐标（走 {@link flowPlace}），
 * 而一份**有坐标却互相压着**的文档只可能是脏数据 —— 照它渲染就是两张卡叠在一起。
 */
export function hasPlacements(widgets: DashboardWidget[]): boolean {
  if (widgets.some((widget) => widget.x === undefined || widget.y === undefined)) {
    return false;
  }
  const items = placementsOf(widgets);
  for (const item of items) {
    if (item.x < 0 || item.y < 0 || item.x + item.w > GRID_COLUMNS) {
      return false;
    }
  }
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (collides(items[i], items[j])) {
        return false;
      }
    }
  }
  return true;
}

/**
 * 按数组顺序贪婪铺一遍，**忽略卡片上已有的坐标** —— 它回答的是「没有坐标时该怎么摆」。
 *
 * 逐张、从 `y = 0` 起逐行、每行从左往右扫第一个放得下的位置。这正是改造前浏览器
 * 用 CSS Grid 流式排布做的那件事（不变量 3），所以拿它去铺一份旧文档，
 * 出来的就是用户上次看到的那个版式。
 */
export function flowPlace(widgets: DashboardWidget[]): Placement[] {
  const placed: Placement[] = [];
  for (const widget of widgets) {
    const size = sizeOf(widget);
    const spot = findSlot(placed, size.w, size.h);
    placed.push({ id: widget.id, x: spot.x, y: spot.y, w: size.w, h: size.h });
  }
  return placed;
}

/**
 * 给一份布局补坐标：坐标齐全就**原样返回**（同一个数组、同一批对象，不白白换引用），
 * 缺就整份 {@link flowPlace} 重铺。
 *
 * 整份重铺而不是「只给缺的那几张找位置」：一份文档里有的有坐标、有的没有，只可能是
 * 写到一半或被手工改过，这时**没有任何一张的位置是可信的**。让它们一起重来，
 * 至少结果自洽。
 */
export function ensurePlacements(widgets: DashboardWidget[]): DashboardWidget[] {
  if (hasPlacements(widgets)) {
    return widgets;
  }
  const items = flowPlace(widgets);
  return widgets.map((widget, i) => ({ ...widget, x: items[i].x, y: items[i].y }));
}

/**
 * 扫第一个放得下的位置（加卡片时用）。从顶上往下、每行从左往右。
 *
 * 所以新卡片会**先填洞里**再往末尾排 —— 这正是「只要空间能放卡片的，就可以放下」：
 * 用户腾出来的空位不该只有手动拖才用得回去。
 */
export function findSlot(items: Placement[], w: number, h: number): { x: number; y: number } {
  // 只要试到「所有已有卡片的下沿」就够了：那一行往下必然是空的，
  // 所以这个上界同时是终止保证 —— 铺满了就在最下面接一行
  const lastRow = items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  for (let y = 0; y <= lastRow; y++) {
    for (let x = 0; x + w <= GRID_COLUMNS; x++) {
      const probe: Placement = { id: '', x, y, w, h };
      if (!items.some((item) => collides(item, probe))) {
        return { x, y };
      }
    }
  }
  return { x: 0, y: lastRow };
}

/**
 * 一张卡摆在 `(x, y)` 是不是**放得下**：不越出上边与左边，也不越出右边那 24 列。
 *
 * 只判界内，**不判重叠** —— 压在别的卡身上不算放不下，那是「让位」要处理的事。
 * 换句话说这里回答的是「这个位置合法吗」，重叠与否是第二步的问题。
 *
 * 行没有下界：网格往下是无限的，`y` 多大都成立。
 */
export function fitsAt(x: number, y: number, w: number): boolean {
  return x >= 0 && y >= 0 && x + w <= GRID_COLUMNS;
}

/**
 * 把一张卡挪到 `(x, y)`：**它自己钉在那儿**，被压到的往下让，**让完就停、不再上吸**。
 *
 * 详见文件头那段让位口径。传进来的 `(x, y)` 按说已经过 {@link fitsAt}（拖拽路径会先判界），
 * 这一层仍然**夹一次边界**当兜底：`placeAt` 别处也在调（编辑器改档位、改完提交），
 * 那些路径没做界内判定，夹住总比摆出一张越界的卡好。
 *
 * 找不到这张卡（id 对不上）时原样返回 —— 拖拽与草稿之间短暂错位时不要炸。
 * 传进来的 `items` 不会被改：返回的是新数组、新对象（信号才能看出变化）。
 */
export function placeAt(items: Placement[], id: string, x: number, y: number): Placement[] {
  const target = items.find((item) => item.id === id);
  if (!target) {
    return items;
  }
  const pinned: Placement = {
    ...target,
    x: Math.min(Math.max(x, 0), GRID_COLUMNS - target.w),
    y: Math.max(y, 0),
  };

  // 让位：其余卡片按 (y, x) 序各自**往下**找第一个放得下的行。
  // 只有真正被压到的会动 —— 原位本来就空着的原地不动
  const settled: Placement[] = [pinned];
  for (const other of items.filter((item) => item.id !== id).sort(compareYX)) {
    settled.push(pushClear(other, settled));
  }

  // 让完就停：**不调 compact**。上吸会让用户刚摆好的位置自己往上跑（见文件头）
  return settled.sort(compareYX);
}

/**
 * 上吸：**只往上吸、不左右挪**。今天只有一处调用（删除一张卡之后收掉它留下的洞）。
 *
 * 按 `(y, x)` 序逐张往上顶，顶到「再上一格就会压到已经安顿好的某张」为止。
 * 输出**按 `(y, x)` 重排**，这是幂等的前提（见文件头的不变量 1）。
 *
 * 曾经还有一个 `pinned` 参数（钉住刚被拖的那张、别吸它）—— 拖拽那条路现在整个不吸了，
 * 参数就没了调用方，一并删掉。
 */
export function compact(items: Placement[]): Placement[] {
  const settled: Placement[] = [];
  for (const item of [...items].sort(compareYX)) {
    let y = item.y;
    while (y > 0 && !settled.some((other) => collides(other, { ...item, y: y - 1 }))) {
      y -= 1;
    }
    settled.push({ ...item, y });
  }
  return settled.sort(compareYX);
}

/**
 * 指针从起点走了 `(dx, dy)` 像素，跨了几列几行（拖拽落点换算）。
 *
 * `colUnit` 是**一格宽 + 一道缝**：24 列的网格里，相邻两格的起点间距就是这么多。
 * 由调用方量一次容器宽度算出来（`(boardWidth + GRID_GAP) / GRID_COLUMNS`），
 * 因为它要读 DOM，而这一层是纯函数。
 */
export function cellDelta(dx: number, dy: number, colUnit: number): { dc: number; dr: number } {
  return {
    dc: colUnit > 0 ? Math.round(dx / colUnit) : 0,
    dr: Math.round(dy / (GRID_ROW_HEIGHT + GRID_GAP)),
  };
}

/** 两张卡是否重叠。**半开区间**：边界相接（一张的下沿正好是另一张的上沿）不算重叠 */
function collides(a: Placement, b: Placement): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** 原位往下找到第一个不与 `settled` 相撞的行。往下走必然能找到，故**一定终止** */
function pushClear(item: Placement, settled: Placement[]): Placement {
  let y = item.y;
  while (settled.some((other) => collides(other, { ...item, y }))) {
    y += 1;
  }
  return { ...item, y };
}

/** 阅读顺序：先上后下、同行先左后右。**处处用它排序**，顺序不一致就会漏掉重叠 */
function compareYX(a: Placement, b: Placement): number {
  return a.y - b.y || a.x - b.x;
}
