import { GraphNode } from '../graph/project.tree.graph';

/*
 * 项目树的**坐标模型**：卡片摆在哪、曲线怎么弯。
 *
 * 与 `project.tree.graph.ts` 是**两层**：那一层管「谁是谁的孩子」（拼树），这一层管「摆在哪儿」
 * （几何）。分开的理由是拖动：拼树的结果在拖动过程中**一次都不该变**（被拖的那张卡正被 CDK
 * 持有着，重排会让它跳），而位置每一像素都要重算。两件事混在一个函数里，就没法只重算后者。
 *
 * 全是纯函数：不认识 Angular、不读信号、不碰 DOM，也**不碰 localStorage** —— 存取那两句在
 * 组件里，序列化与容错解析在这里（做成纯函数才测得到，看板那两个私有方法就一直没测）。
 *
 * ── 一、自动布局：横着长 ─────────────────────────────────────────────────────
 *
 * 这一页上一版是纯 CSS 拼的肘形折线，图形由 DOM 嵌套 + 伪元素边框给出来，位置是**布局引擎
 * 算的**，用户一格都动不了。要让它能拖，位置就得自己算、自己写 —— 于是有了这一层。
 *
 * 默认形状**保持上一版的样子**（根在左、层级往右推）：
 *
 *     x = 深度 × COL_PITCH
 *     y = 该节点分到的**行号** × ROW_PITCH
 *
 * 行号是 DFS 序发下来的：**叶子按顺序各占一行**，内部节点**不占行**，它的 y 取
 * **首尾两个孩子 y 的中点**（`(y₁ + yₙ) / 2`）。
 *
 * 取中点而不是平均值是有讲究的：子节点按行号均匀铺开，首尾中点正好落在**正中间那个孩子**
 * 身上（孩子数是奇数）或**正中间两道缝之间**（偶数），扇出去的曲线左右对称。取平均值在
 * 「每个孩子自己还是一棵大树」时会被行数加权，父节点会被拽向枝繁的那一边，看着是歪的。
 *
 * **收起的节点按叶子算**：它的子树不占行，兄弟会往上收。这是预期的 —— 收起来本来就是
 * 「这一支我现在不关心」。但收起的节点在 `Offsets` 里的偏移**不删**，展开回来还是原样。
 *
 * 一条**不变量**：自动布局下**任意两张卡不重叠**。不是碰巧，两个方向各自成立 ——
 *
 *   同层（x 相同）：两卡 y 的差至少是 **1 行**（挨得最近的是两个相邻的叶子，
 *                   它们拿到的是相邻的行号），而 1 行 = ROW_PITCH = NODE_H + GAP_Y > NODE_H；
 *   异层（y 可能相同）：两卡 x 的差是 COL_PITCH = NODE_W + GAP_X > NODE_W。
 *
 * 也就是说，两个方向上的**余量恰好就是 `GAP_Y` 与 `GAP_X`**：只要这两个间距还大于 0，
 * 自动布局就不可能叠上。同层还有更松的几对（叶子 vs 内部节点至少 1.5 行、内部 vs 内部
 * 至少 2 行 —— 内部节点取中点，它离自己那段行区间的边界至少半行），但**最紧的那一对是叶子**，
 * 所以钉不变量时按 1 行算就够了。
 *
 * `project.tree.layout.spec.ts` 里把这条**钉住了**：这是推出来的结论，下次改常量时用例会替我们重推一遍。
 *
 * ── 二、整支跟着走：偏移按**祖先累加** ───────────────────────────────────────
 *
 * 用户摆过的位置存成一张**稀疏**的偏移表：`{ 节点键: { dx, dy } }`，没摆过的不在表里。
 * 一个节点的最终位置是
 *
 *     自动位置 + Σ( 它自己 + 它所有祖先 的偏移 )
 *
 * 累加的是**祖先链**而不是「自己」—— 这一个公式同时给出两种行为：
 *
 *   拖父卡片 → 父的偏移被它所有子孙各累加一次 ⇒ **整支一起平移**（树形不变）；
 *   拖子卡片 → 别的枝不在它的祖先链上 ⇒ **只有它自己那一支动**。
 *
 * 于是拖动不需要第二套算法，也就不会出现「父卡片挪了、子卡片没挪、曲线对不上」这类错位：
 * 位置和曲线读的是**同一份坐标**。
 *
 * 清空这张表 = 「恢复默认」（回到自动布局）。没有偏移表和有偏移表是同一个函数算的，
 * 所以「摆过又恢复」与「从没摆过」的结果**逐像素相同**。
 *
 * ── 三、曲线 ────────────────────────────────────────────────────────────────
 *
 * 每个「父 → 子」画一条三次贝塞尔：从**父卡片右缘中点**到**子卡片左缘中点**，
 * 两个控制点各自**水平**外推 `k`。水平外推是关键 —— 它让曲线在端点处是**水平**的，
 * 也就是垂直地扎进卡片右缘 / 左缘（而不是斜着插进去）。父卡片右边 5 条线就是 5 条
 * 平行的水平出发线，像一束扇面，而不是 5 条从同一点放射的星芒。
 *
 * 自由摆放之后卡片可能被拖到父卡片**左边**，那时 `k` 仍按 `|Δx|/2` 取，曲线会绕一个
 * 回环 —— 那是「你把它拖到那儿了」的忠实反映，不特殊处理。
 *
 * 曲线**画在卡片之上**（样式表里 `.tree-links` 有 `z-index`）。自动布局里曲线只在两列之间
 * 那 56px 的缝里走，永远不会撞上卡片，压不压在卡上无所谓；**自由摆放之后就不是了** ——
 * 拖远的那张卡，它的曲线会从别的卡身上横穿过去，压在卡下就是「一段线不见了」
 * （实测穿一张卡可以遮掉半条曲线）。连线是这一页的主要信息，被卡片吃掉是说不通的。
 * 卡片之间另有高下（抬起来的那一支），但**连线整条带都在卡片之上**，没有例外 ——
 * 理由（以及「给抬起来的卡留个例外」为什么不行）写在样式表 `.tree-links` 那段里。
 *
 * ── 四、画布原点固定 ────────────────────────────────────────────────────────
 *
 * 卡片坐标可以出现负数（摆到自动布局的左上方），而 CSS 里 `left: -20px` 是被滚动容器
 * **裁掉**的：看不见，也拖不回来。所以画布这一层要有个「把大家挪回正数」的平移量。
 *
 * 关键在那个平移量的**基准**：
 *
 *     平移量 = CANVAS_PAD − min(自动布局的包围盒)
 *
 * 取的是**自动布局**，不是叠加偏移之后的当前位置。这一条是踩出来的，值得写下来 ——
 * 早先的写法拿当前位置量包围盒，于是拖动时基准**跟着被拖的那张卡跑**：拖根卡片往右 100，
 * 最左那张卡也跟着右移 100，`minX` 一起涨 100，平移量正好把位移抵消掉，**卡片原地不动**。
 * 越是靠左靠上的卡越明显，拖最左边那一列横着走，整页纹丝不动。
 *
 * 改成拿自动布局量之后，平移量是**由这张图和收起状态决定的一个常数**，整场拖动里恒定，
 * 卡片老老实实跟着指针走。代价是卡片能被摆到画布原点外面去 —— 所以配了一道
 * {@link clampToVisible}：拖动时不许拖出**看得见的那块板**。夹取放在组件里而不是这里，
 * 是因为它要知道「这张卡原本在哪」；布局这一层只管如实反映「被摆到了哪」。
 *
 * 平移量恒为常数还有个副作用值得知道：`applyOffsets` 的输出**只随偏移变**，
 * 与「谁是最左那张」无关。于是拖动一张卡时，别的卡一格都不会动 —— 这正是想要的。
 *
 * ── 五、画布要包住**曲线**，不只是卡片 ──────────────────────────────────────
 *
 * `<svg>` 和别的替换元素一样**默认裁掉视口之外的内容**，所以画布尺寸少算一点，曲线就少一截。
 * 而曲线会鼓到卡片包围盒外面去：控制点水平外推 `k`，`x2 - k` 完全可以是负数 ——
 * 卡片贴着画布左上角、子卡片在父卡片左边时就是这样（实测拖到夹取极值时曲线最左到 `-6.9`）。
 *
 * 所以 {@link canvasOf} 收的是**两组**包围盒的并集：卡片，以及每条曲线的**控制点凸包**
 * （见 {@link linkBox}）。用凸包而不是精确的曲线极值，是因为三次贝塞尔落在四个控制点的凸包里
 * 是一条**定理**：不用求导、不用迭代，怎么都不会漏，代价只是画布可能宽出几十像素。
 *
 * 两者都由 {@link curvePoints} 一处算出来，于是「画出来的那条曲线」与「算进画布的那条曲线」
 * 不可能对不上 —— 分开算的话哪天调了 `bend`，就会变成「线还在画布外面，画布却没长」。
 */

/** 卡片宽度。与样式表里的 `--node-w` **必须同值**，贝塞尔的端点按它算 */
export const NODE_W = 200;

/**
 * 卡片高度。与样式表里的 `--node-h` **必须同值**。
 *
 * 高度**定死**而不是由内容撑开，是因为曲线端点要落在卡片右缘**中点**上：高度不一，
 * 同一行卡片的中点就参差，扇面看着是散的。三种节点（空间 / 设备 / 服务）用同一个高度，
 * 内容少了就在卡片里居中（见样式表的 `justify-content`）。
 */
export const NODE_H = 92;

/** 层与层之间的横向空隙（父卡片右缘 → 子卡片左缘） */
export const GAP_X = 56;

/** 相邻两行卡片之间的纵向空隙 */
export const GAP_Y = 16;

/** 一层占多宽 */
export const COL_PITCH = NODE_W + GAP_X;

/** 一行的间距。自动布局里叶子的行号乘以它得到 y */
export const ROW_PITCH = NODE_H + GAP_Y;

/** 画布四周留的空白。拖到负坐标时靠它把卡片兜住，也用来给曲线留出拐弯的余地 */
export const CANVAS_PAD = 24;

/** 选中卡片之后那张信息框的宽度。与样式表里的 `--panel-w` **必须同值**，左右翻边按它算 */
export const PANEL_W = 320;

/** 信息框与卡片之间的空隙 */
export const PANEL_GAP = 12;

/**
 * 信息框还没开出内容高度时，先按它摆。见 `panelSpot` 的 `panelH` 参数与组件里 `panelHeight`：
 * 框是**内容撑高的**（三种节点行数不同），但摆在哪儿需要先知道它有多高 ——
 * 于是组件在渲染后量一把真实高度再回填。回填前这一帧就按下这个估计值摆，
 * 猜得太矮首帧会在窄画布里弹一下，猜得略高则首帧偏稳。
 *
 * **没有「高度上界」这条**：`maxH` 恒等于内容高度 `panelH`，框永远不内部滚（这是本页
 * 「信息框不出现滚动条」那一轮的头号口径）。内容比画布还高时让画布往下长来兜住它
 * （`canvasWithPanel`），而不是把框截短去迁就画布。
 */
export const PANEL_EST_H = 300;

/** 控制点水平外推量的上下限。下限保证「父子几乎同 x」时曲线还是鼓的，上限免得长距离拉成直线 */
const MIN_BEND = 24;
const MAX_BEND = 80;

/** 画布坐标里的一个点（卡片**左上角**） */
export interface Point {
  x: number;
  y: number;
}

/** 画布坐标里的一个矩形。左/上、右/下都**算在内**，用来做「装得下吗」这类判断 */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * 「量不出可视区」时用的那一份：只认画布原点，右/下不设限。
 *
 * 这就是本轮之前的口径（{@link clampToVisible} 的前身只管左边和上边）。真机上量不出可视区是
 * 不该发生的，但**规格套件跑在 jsdom 里**，那里 `getBoundingClientRect()` 一律返回 0×0，
 * 于是每一次挂载用例都会走到这条路上来。把「量不出来就别夹」写成显式的常量，
 * 好过让夹取在 jsdom 下把每一次拖动都钉死在原点。
 */
export const UNBOUNDED: Bounds = { minX: 0, minY: 0, maxX: Infinity, maxY: Infinity };

/** 一个可见节点 + 它在画布上的位置 */
export interface NodePos extends Point {
  key: string;
  node: GraphNode;
}

/** 一条连线：`d` 直接喂给 `<path>`，`box` 用来让画布把它一起包住（见文件头「画布要包住曲线」） */
export interface Edge {
  key: string;
  d: string;
  box: Bounds;
}

/** 用户摆出来的位移。键是 `GraphNode.key` */
export interface Offset {
  dx: number;
  dy: number;
}

/** 整张偏移表。**稀疏**：没摆过的节点不在里面 */
export type Offsets = Record<string, Offset>;

/** 一次布局的完整结果：卡片、连线、画布尺寸，三者**同一个坐标系** */
export interface TreeLayout {
  nodes: NodePos[];
  edges: Edge[];
  w: number;
  h: number;
}

/**
 * 自动布局（没有用户偏移时的那一份形状）。返回**键 → 左上角**的表。
 *
 * 只有可见节点在表里：收起的节点自己还在（它是叶子），它的子孙不在。
 */
export function autoLayout(root: GraphNode, collapsed: Set<string>): Map<string, Point> {
  const out = new Map<string, Point>();
  /** 下一个可用的行号。只有叶子会消耗它 */
  let row = 0;

  const walk = (node: GraphNode, depth: number): void => {
    const x = depth * COL_PITCH;
    const kids = collapsed.has(node.key) ? [] : node.children;

    if (!kids.length) {
      out.set(node.key, { x, y: row * ROW_PITCH });
      row += 1;
      return;
    }

    for (const child of kids) {
      walk(child, depth + 1);
    }

    // 首尾孩子的**中点**（不是平均），理由见文件头。孩子按行号均匀铺开，所以这一定落在
    // 第一个与最后一个的中点高度上，扇出去的曲线左右对称。
    const first = out.get(kids[0].key);
    const last = out.get(kids[kids.length - 1].key);
    out.set(node.key, { x, y: ((first?.y ?? 0) + (last?.y ?? 0)) / 2 });
  };

  walk(root, 0);
  return out;
}

/**
 * 把用户偏移叠上去，得到画布坐标（**已经带上 `CANVAS_PAD`，可以直接写进 `left`/`top`**）。
 *
 * 偏移按祖先链累加（理由见文件头「整支跟着走」）。返回的数组就是**可见节点的全集**，
 * 顺序是 DFS 序 —— 模板那份 `@for` 直接用它，于是拖动时集合与顺序都不变，只有坐标在动。
 */
export function applyOffsets(
  root: GraphNode,
  base: Map<string, Point>,
  offsets: Offsets,
  collapsed: Set<string>,
): NodePos[] {
  const raw: NodePos[] = [];

  const walk = (node: GraphNode, dx: number, dy: number): void => {
    const own = offsets[node.key];
    const ax = dx + (own ? own.dx : 0);
    const ay = dy + (own ? own.dy : 0);
    const spot = base.get(node.key);

    if (spot) {
      raw.push({ key: node.key, x: spot.x + ax, y: spot.y + ay, node });
    }

    if (collapsed.has(node.key)) {
      return;
    }
    for (const child of node.children) {
      walk(child, ax, ay);
    }
  };

  walk(root, 0, 0);

  /*
   * 统一平移：把**自动布局**的左上角挪到 (PAD, PAD)。
   *
   * 量的是 `base` 而不是 `raw`（叠加偏移之后的结果）—— 这一条是踩出来的，理由见文件头
   * 「画布原点固定」：拿 `raw` 量的话，拖动时基准跟着被拖的那张卡跑，平移量把位移抵消掉，
   * 拖最左边那一列横着走会整页纹丝不动。
   *
   * 量 `base` 也让平移量成了一个**常数**，于是拖动一张卡时别的卡一格都不动。
   *
   * `base` 与 `raw` 覆盖的是同一批键（两边用的是同一套收起规则、同一个起点），
   * 所以这里的 min 就是可见节点的 min，不会把收起的子孙算进来。
   */
  let minX = Infinity;
  let minY = Infinity;
  for (const p of base.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
  }
  const shiftX = CANVAS_PAD - (Number.isFinite(minX) ? minX : 0);
  const shiftY = CANVAS_PAD - (Number.isFinite(minY) ? minY : 0);

  return raw.map((p) => ({ ...p, x: p.x + shiftX, y: p.y + shiftY }));
}

/**
 * 把一次拖动**夹在看得见的那块板里**。
 *
 * `branch` 与 `self` 都是这张卡**不计自己这份偏移**时的画布坐标包围盒：前者是**整支**
 * （它自己 + 所有可见子孙），后者只有它自己。`visible` 是可视区（也是画布坐标）。
 *
 * 优先夹整支：拖动是「整支跟着走」（见文件头），只夹被拖的那张卡的话，它的子孙会照样飞出去。
 * 但整支可能**比可视区还大**（拖根卡片时整棵树都要装进一屏），那时候约束无解 ——
 * 退一步只夹被拖的那张卡，至少保证手里这张**永远看得见**。约束在「自己这张卡」上一定
 * 有解：可视区的宽高不可能小于一张卡（真小于的话页面本来也没法用了）。
 *
 * 为什么非夹不可：卡片出了 `.tree-scroll` 就是被**裁掉**，看不见也拖不回来。
 * 夹住之后手感是「卡片顶到边上就不动了」，一眼看得懂；不夹就是「拖着拖着卡没了」——
 * 那是这一轮用户实际报上来的那两个症状之一，也是最难自己诊断的一类故障。
 * 夹取放在组件里而不是 {@link applyOffsets} 里，是因为它需要知道**这张卡原本在哪**；
 * 布局这一层只管如实反映「被摆到了哪」。
 */
export function clampToVisible(
  branch: Bounds | null,
  self: Bounds | null,
  visible: Bounds,
  dx: number,
  dy: number,
): Offset {
  // 量不出来就不夹（`+ 0` 照旧把 `Math.round` 可能吐出来的 `-0` 归一成 `0`，理由见 `axis`）
  if (!branch || !self) {
    return { dx: dx + 0, dy: dy + 0 };
  }
  return {
    dx: axis(dx, branch.minX, branch.maxX, self.minX, self.maxX, visible.minX, visible.maxX),
    dy: axis(dy, branch.minY, branch.maxY, self.minY, self.maxY, visible.minY, visible.maxY),
  };
}

/**
 * 一个方向上的夹取：先按整支夹，整支装不下就退成按被拖的那张卡夹。
 *
 * `+ 0` 是把 `-0` 归一成 `0`。卡片正好贴边时上界是 `-0`，而 `Math.max(-10, -0)` 挑出来的
 * 就是 `-0`：它 `=== 0` 成立，但 `Object.is` 与 `toEqual` 都当它是另一个值，
 * 存进 `localStorage` 又变回 `0` —— 一种「写进去和读出来不一样」的小别扭，在这里掐掉最省事。
 */
function axis(
  value: number,
  branchMin: number,
  branchMax: number,
  selfMin: number,
  selfMax: number,
  viewMin: number,
  viewMax: number,
): number {
  const lo = viewMin - branchMin;
  const hi = viewMax - branchMax;
  if (lo <= hi) {
    return Math.min(Math.max(value, lo), hi) + 0;
  }
  return Math.min(Math.max(value, viewMin - selfMin), viewMax - selfMax) + 0;
}

/**
 * 一条曲线的四个关键点：起点、两个控制点、终点。
 *
 * `linkPath`（画出来）与 `linkBox`（算进画布）**都只读它**。分开各算一遍的话，
 * 哪天调了 `bend` 就会变成「线还在画布外面、画布却没长」，被 `<svg>` 悄悄裁掉一截 ——
 * 那正是本轮用户报上来的症状之一，所以这一层不给自己留第二次机会。
 *
 * 两个控制点都只做**水平**外推（y 分别等于起点 / 终点的 y），所以曲线在两端是水平的 ——
 * 垂直地扎进卡片边缘，见文件头「曲线」。
 */
function curvePoints(from: Point, to: Point): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx1: number;
  cx2: number;
} {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const bend = Math.min(MAX_BEND, Math.max(MIN_BEND, Math.abs(x2 - x1) / 2));

  /*
   * 左边那个控制点**不许伸到画布原点左边**。子卡片被拖到父卡片左边时 `x2 - k` 会是负数，
   * 整条曲线跟着鼓到画布外面去 —— 而画布的原点就是 `<svg>` 视口的左上角，鼓出去的那一截
   * **画不出来**（实测拖到夹取极值时曲线最左到 `-6.9`，那一段线就是断的，正是用户报的症状）。
   * 夹住之后四个控制点的凸包整个落在 `x >= 0` 里，曲线按定理也在里面，于是**怎么摆都不会被裁**。
   *
   * 夹控制点而不是「把画布往左撑」：曲线端点在画布坐标里，往左撑并不会把 `x = -6.9` 那个点
   * 搬回来（原点就在画布左上角），只会让右边多出一片空白。也不靠「拖动时夹住曲线」：
   * 坐标可能是**别处存进来的**（localStorage 里的旧偏移、另一个标签页），在画法这一层兜住
   * 才是无论坐标怎么来都成立的那一道。
   *
   * 右侧不用管：`x1 + k` 会被 {@link canvasOf} 算进画布宽度，画布跟着长。
   */
  return { x1, y1, x2, y2, cx1: x1 + bend, cx2: Math.max(x2 - bend, 0) };
}

/** 一条连线的 `d`：父卡片右缘中点 → 子卡片左缘中点，三次贝塞尔 */
export function linkPath(from: Point, to: Point): string {
  const { x1, y1, x2, y2, cx1, cx2 } = curvePoints(from, to);
  return `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
}

/**
 * 一条曲线**画出来会占到的**范围：四个控制点的包围盒。
 *
 * 三次贝塞尔落在自己四个控制点的**凸包**里，所以这是曲线的**上界** —— 怎么都不会漏，
 * 不需要求导也不需要迭代。代价是可能多算几十像素（控制点伸出去、曲线本身没到那儿），
 * 对画布尺寸来说无所谓。理由见文件头「画布要包住曲线」。
 */
export function linkBox(from: Point, to: Point): Bounds {
  const { x1, y1, x2, y2, cx1, cx2 } = curvePoints(from, to);
  return {
    minX: Math.min(x1, cx1, cx2, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, cx1, cx2, x2),
    maxY: Math.max(y1, y2),
  };
}

/** 每个「父 → 子」一条边。收起的节点不出边，端点缺席（理论上不会）也不出 */
export function edgesOf(root: GraphNode, positions: NodePos[], collapsed: Set<string>): Edge[] {
  const at = new Map<string, Point>();
  for (const p of positions) {
    at.set(p.key, p);
  }

  const out: Edge[] = [];
  const walk = (node: GraphNode): void => {
    if (collapsed.has(node.key)) {
      return;
    }
    const from = at.get(node.key);
    for (const child of node.children) {
      const to = at.get(child.key);
      if (from && to) {
        out.push({ key: `${node.key}>${child.key}`, d: linkPath(from, to), box: linkBox(from, to) });
      }
      walk(child);
    }
  };

  walk(root);
  return out;
}

/**
 * 一批卡片（左上角坐标）的包围盒。**空数组给 `null`** —— 「一张卡都没有」与「量不出来」
 * 是两件事，调用方要能分开处理（画布那边当空画布，夹取那边当「跳过」）。
 */
export function boxOf(spots: Point[]): Bounds | null {
  if (!spots.length) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of spots) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + NODE_W);
    maxY = Math.max(maxY, p.y + NODE_H);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * 画布尺寸：包住**卡片与曲线**的包围盒，四周各留 `CANVAS_PAD`。
 *
 * 只算卡片是不够的：`<svg>` 会把视口之外的内容裁掉，而曲线的控制点会鼓到卡片包围盒外面。
 * 往右、往下画布得跟着长（否则曲线上鼓出去的那一段就没了）；往左、往上不用管 ——
 * 卡片那边由 {@link clampToVisible} 夹住，控制点那边由 `curvePoints` 夹住，
 * 两者都保证不会小于 0。
 */
export function canvasOf(positions: NodePos[], edges: Edge[]): { w: number; h: number } {
  const cards = boxOf(positions);
  if (!cards) {
    return { w: CANVAS_PAD * 2, h: CANVAS_PAD * 2 };
  }

  let maxX = cards.maxX;
  let maxY = cards.maxY;
  for (const e of edges) {
    maxX = Math.max(maxX, e.box.maxX);
    maxY = Math.max(maxY, e.box.maxY);
  }
  return { w: maxX + CANVAS_PAD, h: maxY + CANVAS_PAD };
}

/**
 * 一步到位：自动布局 + 叠加偏移 + 出连线 + 量画布。**组件只调这一个**。
 *
 * 摊成四步放在这里而不是拆给组件，是为了让「卡片坐标」与「曲线端点」**一定读同一份数**：
 * 分两处算的话，哪天顺手给其中一处加个 1px 的微调，线就从卡片边缘脱开了。
 */
export function layoutTree(root: GraphNode, offsets: Offsets, collapsed: Set<string>): TreeLayout {
  const nodes = applyOffsets(root, autoLayout(root, collapsed), offsets, collapsed);
  const edges = edgesOf(root, nodes, collapsed);
  const { w, h } = canvasOf(nodes, edges);
  return { nodes, edges, w, h };
}

/**
 * 选中一张卡之后，那张信息框贴在卡片的哪一侧。坐标同样是**画布坐标**，与卡片同一份 ——
 * 于是拖动卡片时框跟着走，不必再为它单独接一套屏幕坐标。
 */
export interface PanelSpot {
  /** 信息框左上角 */
  x: number;
  y: number;
  /**
   * 框多高。**恒等于 `panelSpot` 传进来的 `panelH`**（就是内容高度的实测值，见 `panelH` 参数），
   * 模板把它绑到 `max-height` 上；因为它恰好是内容高度，内容绝不会产生内部滚动条 ——
   * 「完整显示、不藏滚动条」是本页的头号口径，就看这一条。
   *
   * **没有例外、没有上限**（早期版本有 `min(panelH, 上界)` 和「上下都挤就收成可用的那点、
   * 内容内部滚」两条退路，那一轮的滚动条就是这么漏进来的）：内容多高框就多高，
   * 框比画布还高时，由 `canvasWithPanel` 把画布往下长来兜住，而不是把框截短。
   */
  maxH: number;
  /** 翻到卡片左边了没有。只给样式表调圆角 / 小尖角用，不参与布局 */
  flipped: boolean;
}

/**
 * 信息框摆哪儿：横向贴卡片**右侧**（放不下、且左边放得下时翻到左侧），纵向看 `panelH` 多大的地方
 * 能装下整只框，就放哪边。
 *
 * ── 横向 ────────────────────────────────────────────────────────────────────
 *
 * 两个条件缺一不可，只判「右边放不下」会踩一个具体的坑：`x` 为 0 的树顶卡片（这是常态，
 * 根永远在第一列）翻过去就是 `-PANEL_GAP - PANEL_W`，框有一整条被滚动壳的左边缘吃掉，而且
 * **滚不回来** —— LTR 下横向滚动区不会往负方向长。所以左边放不下时宁可让它往右顶出去：
 * 那一边是**能滚的**。
 *
 * `boardW` 传的是**没有信息框时**的画布宽度（`layoutTree` 算的那个），不然就成了循环定义。
 * 这个口径同时保证了「没翻边时框一定落在画布内」：右边的条件就是照它写的。
 *
 * ── 纵向 ────────────────────────────────────────────────────────────────────
 *
 * 这一条是后补的，成因与横向**不一样**，别照抄上面的理由：横向是「滚出去还能滚回来」，
 * 纵向是**真的会被裁掉**。早期版本想让框收进画布（不麻烦画布），于是「上下都挤就
 * 把框截短、内容内部滚」—— 那一轮用户看到的滚动条就是这么漏进来的。
 *
 * 现在反过来：**框永远按内容高度，一条都不许截**。为了「完整显示」，先要知道框到底有多高 ——
 * 这是 `panelH` 参数的来意：**先在比高度无关的横轴上摆好，再把「按下 / 往上」哪个省事**
 * 决定出来。两条分支，用 `maxH = panelH`（内容高度）：
 *
 *   1. 下面放得下整只框（`boardH - card.y >= panelH`）→ 贴卡片上缘往下长：最省事，框外是空画布；
 *   2. 下面不够但**上面**放得下（`card.y + NODE_H >= panelH`）→ 贴卡片下缘往上长，
 *      框底与卡片底齐平（不盖住它自己那张卡）。
 *   3. 上下都挤（画布矮到一只框也装不下）→ 贴卡片上缘往下长，框底伸出画布 —— 那一点由
 *      `canvasWithPanel` 把画布往下长来兜住，框本身**不缩、不滚**。
 *
 * `maxH` 三支恒为 `panelH`。第 1、2 支下 `y + maxH ≤ boardH` 成立；第 3 支是唯一画布太矮的
 * 情形，靠画布长高补，不在这一层削足适履。
 */
export function panelSpot(card: Point, boardW: number, boardH: number, panelH: number): PanelSpot {
  const right = card.x + NODE_W + PANEL_GAP;
  const left = card.x - PANEL_GAP - PANEL_W;
  const flipped = right + PANEL_W > boardW && left >= 0;
  const x = flipped ? left : right;

  const below = boardH - card.y;
  const above = card.y + NODE_H;

  if (below >= panelH) {
    return { x, y: card.y, maxH: panelH, flipped };
  }
  if (above >= panelH) {
    return { x, y: card.y + NODE_H - panelH, maxH: panelH, flipped };
  }
  return { x, y: card.y, maxH: panelH, flipped };
}

/** 把值收进 `[lo, hi]`。`+ 0` 与 {@link axis} 同一个理由：别把 `-0` 漏出去 */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi) + 0;
}

/**
 * 用户把框拖走之后落在哪儿。`drag` 是**画布坐标系里的位移增量**（与卡片偏移同一套），
 * 换一张卡就归零 —— 它不落盘，只活在这张卡被选中的这段时间里。
 *
 * 两件事在这里做掉：
 *
 * 1. **横向上夹 `x ≥ 0`、放开右界**。框的宽度与 `canvasWithPanel`（会自动把画布加宽）配合，
 *    所以拖到画布右缘之外**没有理由挡住** —— 左边不行（LTR 下横滚不往负方向长），右边行。
 *    于是上界是 `max(board.w, spot.x)`：框的**左缘**最远到画布右缘（整只框探到原画布右侧）。
 *    这正是上一版卡壳的地方 —— 旧上界是 `board.w - PANEL_W`，框右缘顶到画布右缘就拖不动了，
 *    用户说「距离还有一个卡片宽就过不去」，说的就是那条界。
 * 2. **纵向上夹 `board.h - spot.maxH`**。框已经按内容高度定好了（`maxH = panelH`），拖动
 *    也**不再把它压扁** —— 它始终是一整只框，只会整体滑到画布内、底边顶住画布下缘为止。
 *
 * 两条夹取合起来，保证：拖完之后 `x ≥ 0`、`y ≥ 0`、`y + maxH ≤ board.h`，框**完整可见不内部滚**。
 * 唯一的例外是 `maxH` 本来就比画布矮（`panelSpot` 第 3 支「上下都挤、画布太矮」），
 * 画布会被 `canvasWithPanel` 往下长补足，不是这次拖出来的。
 *
 * **零位移时这条函数是恒等的**（有两条用例钉着）：横向上界 `max(board.w, spot.x) ≥ spot.x ≥ 0`、
 * 纵向上界 `board.h - spot.maxH ≥ spot.y`（`panelSpot` 前两支保证 `y + maxH ≤ board.h`）、
 * `maxH` 原样保留 —— 三样都对上，输入什么就输出什么。
 */
export function shiftPanel(spot: PanelSpot, drag: Offset, board: { w: number; h: number }): PanelSpot {
  const x = clamp(spot.x + drag.dx, 0, Math.max(board.w, spot.x));
  // 画布会在 `canvasWithPanel` 里长到包住整只框（`spot.y + maxH + CANVAS_PAD`），所以纵向的
  // 上界按**长过之后**的高度算 —— 否则自动落位本来就探出画布（`panelSpot` 第 3 支）的画布
  // 会被 zero-drag 拽回，`零位移恒等` 就破了。普通情形画布已经装得下，`hEff === board.h`。
  const hEff = Math.max(0, board.h, spot.y + spot.maxH + CANVAS_PAD);
  const y = clamp(spot.y + drag.dy, 0, Math.max(0, hEff - spot.maxH));
  return { ...spot, x, y, maxH: spot.maxH };
}

/**
 * 信息框也要算进画布尺寸（宽**和**高）。
 *
 * 宽必须算：`panelSpot` 那条「右边放不下一律往右顶」允许框伸出画布（左边伸不得、右边伸得），
 * 伸出多少得由画布补回来，否则横向滚动条的长度对不上内容。
 *
 * 高也要算，但口径和早期不同：现在 `maxH` **恒等于内容高度**，框标签绝不内部滚 —— 那意味着
 * 框的底边**可以（也必须被允许）**伸到画布下缘之下（`panelSpot` 第 3 支「上下都挤」）。
 * 于是画布高按「框底 + 留白」补足。只有框底真的超出画布下缘时才长；框整只落在画布内时
 * 高度不动（用例钉着）。
 *
 * 曲线那条算高度是因为 `<svg>` 会自裁、算漏了就真看不见；框这边是**画布补足**，两种解法，别混。
 */
export function canvasWithPanel(
  size: { w: number; h: number },
  spot: PanelSpot | null,
): { w: number; h: number } {
  if (!spot) {
    return size;
  }
  const bottom = spot.y + spot.maxH;
  return {
    w: Math.max(size.w, spot.x + PANEL_W + CANVAS_PAD),
    h: bottom <= size.h ? size.h : bottom + CANVAS_PAD,
  };
}

/**
 * 偏移表 → 存进 `localStorage` 的字符串。
 *
 * 就一句 `JSON.stringify`，不压缩、不改名。**不**为了省几个字节去编码成
 * `[x1,y1,x2,y2]` 那种定长数组：这张表的键是调试时唯一能看懂的东西，省下的字节
 * 在几十个节点的量级上毫无意义，而看不懂的字符串会让人下次宁愿删掉重摆。
 */
export function encodeOffsets(offsets: Offsets): string {
  return JSON.stringify(offsets);
}

/**
 * 字符串 → 偏移表。**认不出来就当没摆过**（返回空表），与看板读自动刷新间隔那条口径一致。
 *
 * 拦四种情况：不是合法 JSON、不是对象（`null` / 数组 / 标量）、键是空的、
 * `dx`/`dy` 不是有限数（`NaN` / `Infinity` / 字符串 / 缺字段）。
 *
 * 「不是有限数」那一条不是洁癖：`JSON.parse` 出来的 `Infinity` 只能是字符串，
 * 而一个 `NaN` 坐标会让卡片**整个从画布上消失**（`left: NaNpx` 是无效值）——
 * 那种「打开页面东西没了、也不知道该删哪个键」的故障，宁可在这里变成「回到默认布局」。
 * 单条坏记录只丢它自己，其余照常生效。
 */
export function decodeOffsets(raw: string | null): Offsets {
  if (!raw) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  const out: Offsets = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!key || !value || typeof value !== 'object') {
      continue;
    }
    const { dx, dy } = value as { dx?: unknown; dy?: unknown };
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      continue;
    }
    out[key] = { dx: dx as number, dy: dy as number };
  }
  return out;
}

/** 两张偏移表是不是同一份。用来判「改过没有」（保存按钮 / 退出确认都看它） */
export function sameOffsets(a: Offsets, b: Offsets): boolean {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) {
    return false;
  }
  return keysA.every((key) => {
    const x = a[key];
    const y = b[key];
    return !!y && x.dx === y.dx && x.dy === y.dy;
  });
}
