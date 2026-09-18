import { GraphNode } from './project1.graph';
import {
  Bounds,
  CANVAS_PAD,
  COL_PITCH,
  GAP_Y,
  NODE_H,
  NODE_W,
  Offsets,
  PANEL_EST_H,
  PANEL_GAP,
  PANEL_W,
  ROW_PITCH,
  UNBOUNDED,
  applyOffsets,
  autoLayout,
  boxOf,
  canvasOf,
  canvasWithPanel,
  clampToVisible,
  decodeOffsets,
  edgesOf,
  encodeOffsets,
  layoutTree,
  linkBox,
  linkPath,
  panelSpot,
  sameOffsets,
  shiftPanel,
} from './project1.layout';

/*
 * 坐标模型这批用例。**它们钉的不是「大概长这样」，是几条会被改坏的结论**：
 *
 *   - 自动布局**不重叠**（文件头那段「1.5 行 / 256px」的推导，改常量时这里会替我们重推）；
 *   - 父节点的 y 取**首尾孩子中点**（改成平均值不会崩，只会让树看着歪 —— 最难发现的那种错）；
 *   - 偏移走**祖先累加**（这是「拖父卡片整支跟着走」的全部实现，改错就整支不跟）；
 *   - 容错解析**认不出来就当没摆过**（不拦的话一个 NaN 会让卡片整个消失）。
 *
 * `project1.graph.ts` 那批用例管「谁是谁的孩子」，这批管「摆在哪儿」，两边不重叠。
 */

/**
 * 造一个只有形状的节点。这一层只读 `key` 与 `children`，所以 `space`/`device`/`service`
 * 全给 `null` —— 造真实体反而会让用例里混进与坐标无关的字段。
 */
function n(key: string, children: GraphNode[] = []): GraphNode {
  return { key, kind: 'space', space: null, device: null, service: null, children };
}

/*
 * 一棵**故意挑过的**树：既有纯叶子的枝（b），也有「一层套一层」的枝（c），
 * 还有一个三个孩子的枝（e）。三种形状的中点到相邻行号的距离各不相同，
 * 重叠那条不变量用一棵全是叶子的树是测不出来的。
 *
 *                      行号（叶子按 DFS 序发号）
 *   root  y=4.0
 *    ├ a      y=0        ← 叶子
 *    ├ b      y=1.5      ← (1+2)/2
 *    │  ├ b1  y=1
 *    │  └ b2  y=2
 *    ├ c      y=4.25     ← (3.5+5)/2
 *    │  ├ c1  y=3.5      ← (3+4)/2
 *    │  │  ├ c11 y=3
 *    │  │  └ c12 y=4
 *    │  └ c2  y=5
 *    ├ d      y=6
 *    └ e      y=8        ← (7+9)/2
 *       ├ e1  y=7
 *       ├ e2  y=8
 *       └ e3  y=9
 *
 *   root 的 y = (0 + 8)/2 = 4
 */
function fixture(): GraphNode {
  return n('root', [
    n('a'),
    n('b', [n('b1'), n('b2')]),
    n('c', [n('c1', [n('c11'), n('c12')]), n('c2')]),
    n('d'),
    n('e', [n('e1'), n('e2'), n('e3')]),
  ]);
}

/** 「行号」在这里就是 y 除以间距，用例里按行号断言比按像素好读 */
const rowOf = (y: number): number => y / ROW_PITCH;

describe('autoLayout', () => {
  it('深度决定 x：每一层差一个 COL_PITCH', () => {
    const at = autoLayout(fixture(), new Set());

    expect(at.get('root')!.x).toBe(0);
    for (const key of ['a', 'b', 'c', 'd', 'e']) {
      expect(at.get(key)!.x).toBe(COL_PITCH);
    }
    for (const key of ['b1', 'b2', 'c1', 'c2', 'e1', 'e2', 'e3']) {
      expect(at.get(key)!.x).toBe(COL_PITCH * 2);
    }
    for (const key of ['c11', 'c12']) {
      expect(at.get(key)!.x).toBe(COL_PITCH * 3);
    }
  });

  it('叶子按 DFS 序各占一行', () => {
    const at = autoLayout(fixture(), new Set());
    const leaves = ['a', 'b1', 'b2', 'c11', 'c12', 'c2', 'd', 'e1', 'e2', 'e3'];
    leaves.forEach((key, i) => {
      expect(rowOf(at.get(key)!.y)).toBe(i);
    });
  });

  it('内部节点的 y 取首尾孩子的中点（不是平均）', () => {
    const at = autoLayout(fixture(), new Set());

    // b 的两个孩子在第 1、2 行 → 落在 1.5
    expect(rowOf(at.get('b')!.y)).toBe(1.5);
    // e 的三个孩子在第 7、8、9 行 → 正中间那个，8
    expect(rowOf(at.get('e')!.y)).toBe(8);
    // c 的孩子起点 3.5、终点 5（c1 自己是内部节点，取的是它的中点 3.5）→ 4.25
    expect(rowOf(at.get('c')!.y)).toBe(4.25);
    // root 从 a 的第 0 行到 e 的第 8 行 → 4
    expect(rowOf(at.get('root')!.y)).toBe(4);
  });

  it('取中点而不是平均：枝繁的一侧不会把父节点拽过去', () => {
    const at = autoLayout(fixture(), new Set());

    // e 的三个孩子行号是 7/8/9：中点与平均都是 8，这一个分不出来。
    // b 的孩子是 1/2：也是 1.5。真正分得开的是 c —— 它的两个孩子落在 3.5 与 5，
    // 中点 4.25；而「按每个孩子自己占多少行加权」会给出别的数。这里直接钉中点这条口径。
    const c1 = at.get('c1')!.y;
    const c2 = at.get('c2')!.y;
    expect(at.get('c')!.y).toBe((c1 + c2) / 2);
  });

  it('收起的节点按叶子算：它的子树不占行，别的枝往上收', () => {
    const expanded = autoLayout(fixture(), new Set());
    // 收起 c：c11 / c12 / c2 三行让出来，d 之后的整段往上提
    const collapsed = autoLayout(fixture(), new Set(['c']));

    expect(collapsed.has('c11')).toBe(false);
    expect(collapsed.has('c2')).toBe(false);
    // c 自己还在，当叶子占了新的一行（a 第 0 行、b 的两个孩子第 1、2 行之后）
    expect(rowOf(collapsed.get('c')!.y)).toBe(3);
    // d 从第 6 行提到第 4 行（让出了三行）
    expect(rowOf(expanded.get('d')!.y)).toBe(6);
    expect(rowOf(collapsed.get('d')!.y)).toBe(4);
  });

  /*
   * 这条是文件头那段推导的**执行版本**。它不该失败；一旦失败，说明改了 NODE_H / GAP_Y /
   * COL_PITCH / NODE_W 里的某一个，把「自动布局天然不重叠」这个前提碰掉了 ——
   * 那是个安静的错误（卡片只是**偶尔**叠上），肉眼很难发现。
   */
  it('不变量：任意两张卡都不重叠', () => {
    const at = autoLayout(fixture(), new Set());
    const keys = [...at.keys()];

    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        const a = at.get(keys[i])!;
        const b = at.get(keys[j])!;
        // 矩形相交 ⟺ 两个方向上都真的错开
        const apartX = Math.abs(a.x - b.x) >= NODE_W;
        const apartY = Math.abs(a.y - b.y) >= NODE_H;
        expect(apartX || apartY).toBe(true);
      }
    }
  });

  it('不变量：同层两卡至少隔一行 —— 余量恰好是 GAP_Y', () => {
    const at = autoLayout(fixture(), new Set());
    const byDepth = new Map<number, number[]>();
    for (const [, p] of at) {
      const depth = Math.round(p.x / COL_PITCH);
      byDepth.set(depth, [...(byDepth.get(depth) ?? []), p.y]);
    }

    // 挨得最近的一对是**两个相邻的叶子**（b1/b2 在第 1、2 行），不是内部节点。
    // 所以最小的同层间距就是 ROW_PITCH 本身，而 ROW_PITCH > NODE_H 靠的是 GAP_Y > 0。
    let tightest = Infinity;
    for (const ys of byDepth.values()) {
      ys.sort((m, k) => m - k);
      for (let i = 1; i < ys.length; i += 1) {
        tightest = Math.min(tightest, ys[i] - ys[i - 1]);
      }
    }

    expect(tightest).toBe(ROW_PITCH);
    expect(tightest - NODE_H).toBe(GAP_Y);
  });
});

describe('applyOffsets', () => {
  /** 把结果摊成 键 → 点，方便按名取 */
  const at = (positions: ReturnType<typeof applyOffsets>) =>
    new Map(positions.map((p) => [p.key, p]));

  it('没有偏移时就是自动布局，只是整体平移到了 PAD 上', () => {
    const tree = fixture();
    const base = autoLayout(tree, new Set());
    const pos = at(applyOffsets(tree, base, {}, new Set()));

    // 左上角那一张（a，自动坐标 (256, 0)）落到了 (256+PAD, PAD)
    expect(pos.get('a')!.x).toBe(base.get('a')!.x + CANVAS_PAD);
    expect(pos.get('a')!.y).toBe(base.get('a')!.y + CANVAS_PAD);
    // 相对关系一点没变
    expect(pos.get('root')!.x).toBe(CANVAS_PAD);
    expect(pos.get('d')!.x - pos.get('a')!.x).toBe(0);
  });

  it('拖父节点：整支跟着走，且位移**逐像素**相同（这是「整支跟着走」的全部实现）', () => {
    const tree = fixture();
    const base = autoLayout(tree, new Set());
    const before = at(applyOffsets(tree, base, {}, new Set()));
    const after = at(applyOffsets(tree, base, { b: { dx: 120, dy: 40 } }, new Set()));

    // b 自己动了
    expect(after.get('b')!.x - before.get('b')!.x).toBe(120);
    expect(after.get('b')!.y - before.get('b')!.y).toBe(40);
    // 两个孩子跟着动，而且**同一个位移**（子树形状不变）
    for (const key of ['b1', 'b2']) {
      expect(after.get(key)!.x - before.get(key)!.x).toBe(120);
      expect(after.get(key)!.y - before.get(key)!.y).toBe(40);
    }
  });

  it('拖子节点：只有它自己那一支动，父与兄弟不动', () => {
    const tree = fixture();
    const base = autoLayout(tree, new Set());
    const before = at(applyOffsets(tree, base, {}, new Set()));
    const after = at(applyOffsets(tree, base, { b1: { dx: -30, dy: 0 } }, new Set()));

    expect(after.get('b1')!.x - before.get('b1')!.x).toBe(-30);
    // 父节点没被拖下去，兄弟也没动
    expect(after.get('b')!.x).toBe(before.get('b')!.x);
    expect(after.get('b2')!.x).toBe(before.get('b2')!.x);
  });

  it('偏移按祖先**累加**：父子各自摆过，两段位移一起生效', () => {
    const tree = fixture();
    const base = autoLayout(tree, new Set());
    const before = at(applyOffsets(tree, base, {}, new Set()));
    const after = at(
      applyOffsets(tree, base, { b: { dx: 100, dy: 20 }, b1: { dx: 10, dy: 5 } }, new Set()),
    );

    // b1 = 自己的 10 + 祖先 b 的 100
    expect(after.get('b1')!.x - before.get('b1')!.x).toBe(110);
    expect(after.get('b1')!.y - before.get('b1')!.y).toBe(25);
    // b2 只吃到祖先那一段
    expect(after.get('b2')!.x - before.get('b2')!.x).toBe(100);
  });

  it('偏移表里的死键（节点没了 / 被收起）不影响别的节点', () => {
    const tree = fixture();
    const base = autoLayout(tree, new Set());
    const withJunk = at(
      applyOffsets(tree, base, { 'space:不存在': { dx: 999, dy: 999 } }, new Set()),
    );
    const clean = at(applyOffsets(tree, base, {}, new Set()));

    expect(withJunk.get('a')).toEqual(clean.get('a'));
    expect(withJunk.get('root')).toEqual(clean.get('root'));
  });

  it('收起的节点自己是可见的（它当叶子），子孙不在结果里', () => {
    const tree = fixture();
    const base = autoLayout(tree, new Set(['c']));
    const keys = applyOffsets(tree, base, {}, new Set(['c'])).map((p) => p.key);

    expect(keys).toContain('c');
    expect(keys).not.toContain('c11');
    expect(keys).not.toContain('c2');
    // 顺序是 DFS 序：模板那份 @for 直接用它
    expect(keys.indexOf('root')).toBeLessThan(keys.indexOf('c'));
    expect(keys.indexOf('c')).toBeLessThan(keys.indexOf('d'));
  });

  /*
   * 下面两条钉的是**画布原点是固定的**。这是踩出来的一个真 bug，值得单独摆出来：
   *
   * 早先的写法拿「叠加偏移之后的当前位置」量包围盒，于是拖动时基准**跟着被拖的那张卡跑**。
   * 拖根卡片往右 100，最左那张卡也右移 100，`minX` 一起涨，平移量正好把位移抵消掉 ——
   * 卡片原地不动。越靠左上的卡越明显：拖最左边那一列横着走，整页纹丝不动，
   * 而它在别的用例里（拖单个枝、祖先累加）全都测不出来，因为那些用例的基准恰好没动。
   */
  it('平移基准是自动布局，不跟着被拖的卡跑', () => {
    const tree = fixture();
    const base = autoLayout(tree, new Set());
    const before = at(applyOffsets(tree, base, {}, new Set()));
    // root 的自动坐标是 (0, 4 行) —— 它是**最左**那张，正是会把基准带跑的那一个
    const after = at(applyOffsets(tree, base, { root: { dx: 100, dy: 40 } }, new Set()));

    for (const [key, p] of before) {
      expect(after.get(key)!.x - p.x).toBe(100);
      expect(after.get(key)!.y - p.y).toBe(40);
    }
  });

  it('摆到自动布局左上方就是负坐标，不在这一层夹', () => {
    const tree = fixture();
    const base = autoLayout(tree, new Set());
    const pos = at(applyOffsets(tree, base, { root: { dx: -50, dy: -30 } }, new Set()));

    // root 自动坐标 (0, 4 行)，平移量恒为 CANVAS_PAD 而不跟着涨 ⇒ 结果可以是负的
    expect(pos.get('root')!.x).toBe(CANVAS_PAD - 50);
    expect(pos.get('root')!.y).toBe(CANVAS_PAD + 4 * ROW_PITCH - 30);
    // 负坐标由拖动那边的 clampToVisible 挡住；布局这一层如实反映「被摆到了哪」，
    // 这样「父卡片还在动、子卡片被夹住」这种把一支拆散的情况就不可能发生
  });
});

describe('clampToVisible（不许拖出看得见的那块板）', () => {
  const bounds = (minX: number, minY: number, maxX: number, maxY: number): Bounds => ({
    minX,
    minY,
    maxX,
    maxY,
  });

  /** 一块 1000×600 的可视区，原点与画布原点重合（没横向滚动时就是这样） */
  const view = bounds(0, 0, 1000, 600);

  /** 一张 200×92 的卡在 (280, 24)。这一支只有它自己，所以两个包围盒一样 */
  const card = bounds(280, 24, 280 + NODE_W, 24 + NODE_H);

  it('看得见的地方原样放过', () => {
    expect(clampToVisible(card, card, view, -100, -20)).toEqual({ dx: -100, dy: -20 });
  });

  it('往左上顶到可视区边就停住', () => {
    expect(clampToVisible(card, card, view, -500, -500)).toEqual({ dx: -280, dy: -24 });
  });

  it('往右下也夹 —— 拖出去就被滚动壳裁掉了，看不见也拖不回来', () => {
    // 右边界 1000 − 480 = 520；下边界 600 − 116 = 484
    expect(clampToVisible(card, card, view, 4000, 3000)).toEqual({ dx: 520, dy: 484 });
  });

  it('整支比可视区还大时，退成只夹被拖的那张卡', () => {
    // 这一支纵向有 876 高（比 600 还高），「整支装进来」无解 ⇒ 只保证手里这张看得见
    const branch = bounds(280, 24, 280 + NODE_W, 900);
    // 整支那条约束是 dy ∈ [−24, −300]（空区间），退成自己那张：dy ∈ [−24, 484]
    expect(clampToVisible(branch, card, view, 0, 500)).toEqual({ dx: 0, dy: 484 });
  });

  it('可视区量不出来时，只剩「不许出画布原点」那条口径', () => {
    // UNBOUNDED 的右/下是 Infinity ⇒ 那两个方向不夹；左/上是 0 ⇒ 等价于改动之前的行为
    expect(clampToVisible(card, card, UNBOUNDED, -500, 4000)).toEqual({ dx: -280, dy: 4000 });
  });

  it('这一支在哪都量不出来时，干脆不夹（宁可拖得出去，也不要让页面卡死）', () => {
    expect(clampToVisible(null, null, view, -500, 4000)).toEqual({ dx: -500, dy: 4000 });
  });

  it('给回来的 0 不是 -0', () => {
    // 指针往左上顶住时 `Math.round(-0.2)` 会给出 -0；-0 与 0 在 `Object.is` / `toEqual`
    // 眼里是两个值，而存进 localStorage 又会变回 0 —— 「写进去和读出来不一样」最省事的掐法
    const { dx, dy } = clampToVisible(card, card, UNBOUNDED, -0, -0);

    expect(Object.is(dx, -0)).toBe(false);
    expect(Object.is(dy, -0)).toBe(false);
  });
});

describe('boxOf', () => {
  it('一张卡都没有时给 null（「空」与「量不出来」要分得开）', () => {
    expect(boxOf([])).toBeNull();
  });

  it('算的是卡片的矩形，不是左上角那几个点', () => {
    expect(boxOf([{ x: 10, y: 20 }])).toEqual({
      minX: 10,
      minY: 20,
      maxX: 10 + NODE_W,
      maxY: 20 + NODE_H,
    });
  });
});

describe('linkPath', () => {
  /** 把 `d` 里的数字按出现顺序抠出来：`M x1 y1 C c1x c1y, c2x c2y, x2 y2` → 8 个数 */
  const nums = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

  it('从父卡右缘中点出发、落到子卡左缘中点', () => {
    const d = linkPath({ x: 0, y: 0 }, { x: 256, y: 100 });

    expect(d.startsWith(`M ${NODE_W} ${NODE_H / 2} `)).toBe(true);
    expect(d.endsWith(`256 ${100 + NODE_H / 2}`)).toBe(true);
  });

  it('两个控制点只做水平外推 —— 曲线在两端是水平的', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 256, y: 100 };
    const [x1, y1, c1x, c1y, c2x, c2y, x2, y2] = nums(linkPath(from, to));

    expect([x1, y1, x2, y2]).toEqual([
      from.x + NODE_W,
      from.y + NODE_H / 2,
      to.x,
      to.y + NODE_H / 2,
    ]);
    // 第一个控制点的 y 等于起点 y、第二个等于终点 y ⇒ 端点处切线水平
    expect(c1y).toBe(y1);
    expect(c2y).toBe(y2);
    // 两个控制点分别向中间收
    expect(c1x).toBeGreaterThan(x1);
    expect(c2x).toBeLessThan(x2);
  });

  it('控制点外推量有下限：父子几乎同 x 时曲线还是鼓的', () => {
    // 子卡左缘离父卡右缘只差 2px（被拖到快叠上了）→ |Δx|/2 = 1，会被抬到下限 24
    const [x1, , c1x, , c2x, , x2] = nums(linkPath({ x: 0, y: 0 }, { x: NODE_W + 2, y: 0 }));

    expect(c1x - x1).toBe(24);
    expect(x2 - c2x).toBe(24);
  });

  it('控制点外推量有上限：拉很远也不甩出长弧', () => {
    const [x1, , c1x] = nums(linkPath({ x: 0, y: 0 }, { x: 4000, y: 0 }));

    expect(c1x - x1).toBe(80);
  });

  it('被拖到父卡左边时照画（回环是「你把它拖那儿了」的忠实反映，不特殊处理）', () => {
    const [x1, , c1x, , c2x, , x2] = nums(linkPath({ x: 400, y: 0 }, { x: 300, y: 0 }));

    // 终点在起点左边：控制点仍是水平外推，于是曲线绕一个回环
    expect(x2).toBeLessThan(x1);
    expect(c1x).toBeGreaterThan(x1);
    expect(c2x).toBeLessThan(x2);
  });

  /*
   * 这一条是本轮修的那个症状的**根**：子卡片贴着画布左缘时（拖动夹取的极限），
   * `x2 - k` 是负数，而画布原点就是 `<svg>` 视口的左上角 —— 鼓出去的那一截画不出来，
   * 用户看到的就是「线条有一段不显示」。夹掉之后凸包整个落在 `x >= 0` 里，曲线按定理也在里面。
   */
  it('子卡片贴着画布原点时，左边那个控制点被夹住，曲线不出画布', () => {
    const d = linkPath({ x: 400, y: 0 }, { x: 0, y: 0 });

    expect(nums(d).some((v) => v < 0)).toBe(false);
    expect(nums(d)[4]).toBe(0); // 第二个控制点的 x 被夹到 0，而不是 -80
  });
});

describe('edgesOf / canvasOf', () => {
  it('每个「父 → 子」一条边，键是「父>子」', () => {
    const tree = fixture();
    const nodes = applyOffsets(tree, autoLayout(tree, new Set()), {}, new Set());
    const edges = edgesOf(tree, nodes, new Set());

    // 15 个节点、1 个根 ⇒ 14 条边
    expect(nodes.length).toBe(15);
    expect(edges.length).toBe(14);
    expect(edges.map((e) => e.key)).toContain('c>c1');
    expect(edges.map((e) => e.key)).toContain('root>a');
  });

  it('收起的节点不出边', () => {
    const tree = fixture();
    const collapsed = new Set(['c']);
    const nodes = applyOffsets(tree, autoLayout(tree, collapsed), {}, collapsed);
    const keys = edgesOf(tree, nodes, collapsed).map((e) => e.key);

    expect(keys).not.toContain('c>c1');
    expect(keys).toContain('root>c');
  });

  it('画布包得住所有卡片，四周各留 PAD', () => {
    const tree = fixture();
    const nodes = applyOffsets(tree, autoLayout(tree, new Set()), {}, new Set());
    const { w, h } = canvasOf(nodes, edgesOf(tree, nodes, new Set()));

    for (const p of nodes) {
      expect(p.x).toBeGreaterThanOrEqual(CANVAS_PAD - 0.001);
      expect(p.x + NODE_W).toBeLessThanOrEqual(w - CANVAS_PAD + 0.001);
      expect(p.y + NODE_H).toBeLessThanOrEqual(h - CANVAS_PAD + 0.001);
    }
  });

  it('自动布局里曲线整个在卡片之间，画布尺寸由卡片决定', () => {
    const tree = fixture();
    const nodes = applyOffsets(tree, autoLayout(tree, new Set()), {}, new Set());
    const edges = edgesOf(tree, nodes, new Set());
    const cards = boxOf(nodes)!;

    // 缝里走的曲线不会比卡片更靠右、更靠下 ⇒ 加不加它算出来一样
    for (const e of edges) {
      expect(e.box.maxX).toBeLessThanOrEqual(cards.maxX);
      expect(e.box.maxY).toBeLessThanOrEqual(cards.maxY);
    }
    expect(canvasOf(nodes, edges)).toEqual({
      w: cards.maxX + CANVAS_PAD,
      h: cards.maxY + CANVAS_PAD,
    });
  });

  /*
   * 本轮修的那个症状的另一半：**画布只按卡片算**时，曲线鼓出去的那一截会被 `<svg>` 悄悄裁掉。
   * 这张用例把「曲线也要算进去」钉住 —— 去掉 `canvasOf` 里那个遍历 edges 的循环就会红。
   */
  it('画布也包得住曲线的控制点，不只是卡片', () => {
    // 子卡片拖到父卡左边贴着画布原点：父卡右缘 480、外推 80 ⇒ 凸包一直伸到 560，
    // 而卡片的包围盒只到 480。
    const tree = n('root', [n('kid')]);
    const nodes = applyOffsets(
      tree,
      autoLayout(tree, new Set()),
      { kid: { dx: -(CANVAS_PAD + COL_PITCH), dy: 0 } },
      new Set(),
    );
    const edges = edgesOf(tree, nodes, new Set());
    const cards = boxOf(nodes)!;

    expect(edges[0].box.maxX).toBeGreaterThan(cards.maxX);
    expect(canvasOf(nodes, edges).w).toBe(edges[0].box.maxX + CANVAS_PAD);
  });
});

describe('linkBox', () => {
  it('是控制点的凸包，所以一定包得住曲线（贝塞尔落在凸包里）', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 256, y: 100 };
    const box = linkBox(from, to);

    // 端点与两个控制点都在框里
    expect(box.minX).toBeLessThanOrEqual(Math.min(from.x + NODE_W, to.x));
    expect(box.maxX).toBeGreaterThanOrEqual(Math.max(from.x + NODE_W, to.x));
    // 纵向不超过两端的中点之间 —— 控制点的 y 就等于端点的 y
    expect(box.minY).toBe(from.y + NODE_H / 2);
    expect(box.maxY).toBe(to.y + NODE_H / 2);
  });

  it('子卡片贴到画布原点时，凸包不会被夹到负数', () => {
    expect(linkBox({ x: 400, y: 0 }, { x: 0, y: 0 }).minX).toBe(0);
  });
});

describe('layoutTree', () => {
  it('一步到位：卡片 / 连线 / 画布三个坐标一致 —— 线端点落在卡片缘中点上', () => {
    const tree = fixture();
    const { nodes, edges, w, h } = layoutTree(tree, {}, new Set());
    const at = new Map(nodes.map((p) => [p.key, p]));

    // 取 root → a 那条，验证端点确实是两张卡片的缘中点
    const d = edges.find((e) => e.key === 'root>a')!.d;
    const root = at.get('root')!;
    const a = at.get('a')!;
    expect(d.startsWith(`M ${root.x + NODE_W} ${root.y + NODE_H / 2} `)).toBe(true);
    expect(d.endsWith(`${a.x} ${a.y + NODE_H / 2}`)).toBe(true);

    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
  });

  it('空表与「摆过又清空」逐像素相同', () => {
    const tree = fixture();
    const fresh = layoutTree(tree, {}, new Set());
    const restored = layoutTree(tree, decodeOffsets(encodeOffsets({})), new Set());

    expect(restored.nodes).toEqual(fresh.nodes);
  });
});

describe('decodeOffsets（容错：认不出来就当没摆过）', () => {
  it('空 / 非法 JSON / 非对象 一律回空表', () => {
    expect(decodeOffsets(null)).toEqual({});
    expect(decodeOffsets('')).toEqual({});
    expect(decodeOffsets('这不是 json')).toEqual({});
    expect(decodeOffsets('null')).toEqual({});
    expect(decodeOffsets('123')).toEqual({});
    expect(decodeOffsets('[1,2,3]')).toEqual({});
    expect(decodeOffsets('"字符串"')).toEqual({});
  });

  it('非有限数那条坏记录单独丢掉，其余照常生效', () => {
    // 这一条是**关键**：一个 NaN 坐标会让卡片整个从画布上消失（left: NaNpx 无效），
    // 那种「打开页面东西没了」的故障宁可变成「回到默认布局」。
    const raw = JSON.stringify({
      good: { dx: 10, dy: 20 },
      nan: { dx: null, dy: 0 },
      inf: { dx: '1e999', dy: 0 },
      str: { dx: '10', dy: '20' },
      missing: { dx: 5 },
      scalar: 7,
      nil: null,
    });

    expect(decodeOffsets(raw)).toEqual({ good: { dx: 10, dy: 20 } });
  });

  it('负坐标与 0 是合法值，不能被当成「缺失」丢掉', () => {
    const raw = JSON.stringify({ a: { dx: 0, dy: 0 }, b: { dx: -120, dy: -40 } });
    expect(decodeOffsets(raw)).toEqual({ a: { dx: 0, dy: 0 }, b: { dx: -120, dy: -40 } });
  });

  it('编解码来回一趟不变', () => {
    const offsets: Offsets = { 'space:sp1': { dx: 12, dy: -8 }, 'device:d1': { dx: 0, dy: 0 } };
    expect(decodeOffsets(encodeOffsets(offsets))).toEqual(offsets);
  });
});

describe('sameOffsets', () => {
  it('空表之间、同值之间算「没改过」', () => {
    expect(sameOffsets({}, {})).toBe(true);
    expect(sameOffsets({ a: { dx: 1, dy: 2 } }, { a: { dx: 1, dy: 2 } })).toBe(true);
  });

  it('键不同 / 值不同 / 多一个键都算改过', () => {
    expect(sameOffsets({ a: { dx: 1, dy: 2 } }, {})).toBe(false);
    expect(sameOffsets({ a: { dx: 1, dy: 2 } }, { a: { dx: 1, dy: 3 } })).toBe(false);
    expect(sameOffsets({ a: { dx: 1, dy: 2 } }, { b: { dx: 1, dy: 2 } })).toBe(false);
    expect(sameOffsets({}, { a: { dx: 0, dy: 0 } })).toBe(false);
  });

  it('长度相同但键不同，不能被长度那一关放过去', () => {
    expect(sameOffsets({ a: { dx: 1, dy: 1 } }, { b: { dx: 1, dy: 1 } })).toBe(false);
  });
});

/*
 * 竖向现在是**内容高度（`panelH`）驱动**的三条分支：下面放得下就往下、下面放不下上面
 * 放得下就往上、两边都挤就摆下方由画布往下长兜住。`panelH` 在真机上由 `#panelBox` 的
 * `offsetHeight` 量出来（样式表不绑 `max-height`，框 `height: auto`，量一次就是内容高度），
 * 测不到时回落到 `PANEL_EST_H` —— 用例直接以它为 `panelH`。
 * `maxH` **恒等于内容高度**且不绑回 CSS 裁口，框永远完整显示、不内部滚（用户报的「滚动条」）。
 */
describe('panelSpot（信息框贴哪一侧）', () => {
  // 每张卡的画布都够宽够高，纵向落到第一条分支，只钉横向
  const WIDE = { w: 4000, h: 4000 };

  it('默认贴卡片右侧，纵向与卡片对齐', () => {
    expect(panelSpot({ x: 0, y: 40 }, WIDE.w, WIDE.h, PANEL_EST_H)).toEqual({
      x: NODE_W + PANEL_GAP,
      y: 40,
      maxH: PANEL_EST_H,
      flipped: false,
    });
  });

  it('右边放不下、左边放得下 → 翻到左侧，且左缘正好离卡片 PANEL_GAP', () => {
    const card = { x: 600, y: 0 };
    // 画布到 880 为止：右边要占到 600+200+12+320 = 1132 > 880
    const spot = panelSpot(card, 880, 4000, PANEL_EST_H);

    expect(spot.flipped).toBe(true);
    expect(spot.x + PANEL_W).toBe(card.x - PANEL_GAP);
  });

  it('两边都放不下时**不翻**——宁可往右顶出去，因为右边能滚回来、左边不能', () => {
    // 这一条是那个坑本身：x = 0 的树顶卡片（根永远在第一列，这是常态）
    // 翻过去是 -332，被滚动壳左缘吃掉一条，而且 LTR 下横向滚动区不往负方向长，滚不回来。
    const spot = panelSpot({ x: 0, y: 0 }, 100, 4000, PANEL_EST_H);

    expect(spot.flipped).toBe(false);
    expect(spot.x).toBe(NODE_W + PANEL_GAP);
  });

  it('恰好放得下时不翻（边界取「不大于」）', () => {
    // 卡片放得够靠右，翻过去才不会掉出画布左缘（`left >= 0`），否则测的是另一个分支
    const card = { x: 400, y: 0 };
    const exact = card.x + NODE_W + PANEL_GAP + PANEL_W;

    expect(panelSpot(card, exact, 4000, PANEL_EST_H).flipped).toBe(false);
    expect(panelSpot(card, exact - 1, 4000, PANEL_EST_H).flipped).toBe(true);
  });

  /* ── 纵向：这一半是后补的，与横向不是同一个成因 ─────────────────────────────
   *
   * 横向那条的口径是「滚出去还能滚回来」；纵向**真的会被吃掉**（早期是框把滚动壳撑高，
   * 滚它就是整棵树往上走，所以想把框收进画布）。现在的口径反过来：**框恒为内容高度、绝不内部
   * 滚** —— 内容多高框多高，画布不够就往下长（`canvasWithPanel`）。每一条都在钉同一句话：
   * `maxH ≡ panelH`，任何一张卡、任何画布高度都成立。
   * ------------------------------------------------------------------------- */

  it('卡片在下方、下面地方够 → 往下长，整只内容高度的框放得下', () => {
    // 卡 y=400，画布到 700：下面 300 = panelH，够
    const spot = panelSpot({ x: 300, y: 400 }, 4000, 700, PANEL_EST_H);

    expect(spot.y).toBe(400);
    expect(spot.maxH).toBe(PANEL_EST_H);
    expect(spot.y + spot.maxH).toBe(700);
  });

  it('下面地方不够 → 改成贴卡片下缘往上长，框底与卡片底齐平', () => {
    // 卡 y=400、画布到 500：下面只剩 100 < panelH 300，往上那一侧是 400+92=492（够）
    const spot = panelSpot({ x: 300, y: 400 }, 4000, 500, PANEL_EST_H);

    expect(spot.maxH).toBe(PANEL_EST_H);
    expect(spot.y).toBe(400 + NODE_H - PANEL_EST_H);
    // 框底 = 卡片下缘（不是画布底）—— 框不许盖住它自己那张卡
    expect(spot.y + spot.maxH).toBe(400 + NODE_H);
  });

  it('上下都挤（画布比框还矮）→ 框**不缩不滚**，按内容高度摆、底边伸出，交给画布长高', () => {
    // 卡是唯一一张，画布就是它加一圈留白：下面 100 不够，上面只有 92 —— 整只 300 的框
    // 哪儿都放不下。这一支正是旧滚动条的根源，现在框恒为内容高度、绝不内部滚。
    const spot = panelSpot({ x: 0, y: 0 }, 4000, 100, PANEL_EST_H);

    expect(spot.maxH).toBe(PANEL_EST_H);
    expect(spot.y).toBe(0);
    // 底边伸出 300 > 100：补足由 canvasWithPanel 做（见那条用例），这里不许截短框
    expect(spot.y + spot.maxH).toBe(PANEL_EST_H);
  });

  it('遍历一整个自动布局：横向不出左缘、纵向不出下缘（任何一张卡）', () => {
    // 从最左一列（一定翻不了）到最右一列（一定翻）、从第一行到最后一行，四种组合都走到
    const tree: GraphNode = {
      key: 'space:root',
      kind: 'space',
      space: null,
      device: null,
      service: null,
      children: [
        {
          key: 'space:child',
          kind: 'space',
          space: null,
          device: null,
          service: null,
          children: [
            { key: 'device:d1', kind: 'device', space: null, device: null, service: null, children: [] },
            { key: 'device:d2', kind: 'device', space: null, device: null, service: null, children: [] },
          ],
        },
      ],
    };
    const board = layoutTree(tree, {}, new Set());

    for (const node of board.nodes) {
      const spot = panelSpot(node, board.w, board.h, PANEL_EST_H);
      expect(spot.x).toBeGreaterThanOrEqual(0);
      expect(spot.y).toBeGreaterThanOrEqual(0);
      // maxH 恒为内容高度：框是完整的一只，绝不在哪张卡那儿被砍短去迁就画布
      expect(spot.maxH).toBe(PANEL_EST_H);
      // 「完整显示」的真话是一句：**画布（含框给它补高的那一截）一定装得下整只框**。
      // 有些卡的框底真的会探出基画布（下面不够、上面也不够时），那是 `canvasWithPanel`
      // 把画布往下长的活；这一条不靠运气，说的是容器最终盖住了框，就不会有内部滚动条。
      const grew = canvasWithPanel({ w: board.w, h: board.h }, spot);
      expect(spot.y + spot.maxH).toBeLessThanOrEqual(grew.h);
    }
  });
});

describe('shiftPanel（用户把框拖走之后）', () => {
  /** 画布 4000×4000 里的一张卡：默认落在右侧、纵向有整只内容高度的空间 */
  const card = { x: 300, y: 40 };
  const board = { w: 4000, h: 4000 };

  it('零位移时是**恒等**的：不拖动就不该改动自动落位算出来的任何一个数', () => {
    // 这条不是废话，两处夹取的写法都是为了它：
    //  - `maxH` **原样保留**（框是内容高度定好了的，拖动不改它、不压扁也不拉长）；
    //  - 横向上界 `max(board.w, spot.x) ≥ spot.x`、纵向上界 `board.h - spot.maxH ≥ spot.y`
    //    （`panelSpot` 保证 `y + maxH ≤ board.h`）。
    // 三张卡分别是：下面地方很富余的、下面不够要往上长的、以及最右那一列（框顶出画布、
    // 翻不过去）。都用真实布局里的 y —— 恒等这条性质靠「`board.h - y ≥ maxH`」成立，
    // 而那是 `canvasOf` 保证的（画布高按卡片包围盒 + 留白算，所以卡片一定在画布之内）。
    for (const c of [card, { x: 300, y: 216 }, { x: 280, y: 216 }]) {
      const spot = panelSpot(c, 760, 332, PANEL_EST_H);
      expect(shiftPanel(spot, { dx: 0, dy: 0 }, { w: 760, h: 332 })).toEqual(spot);
    }
  });

  it('正常拖动：整体平移，横纵都跟着动', () => {
    const spot = panelSpot(card, 4000, 4000, PANEL_EST_H);
    const moved = shiftPanel(spot, { dx: -120, dy: 60 }, board);

    expect(moved.x).toBe(spot.x - 120);
    expect(moved.y).toBe(spot.y + 60);
    expect(moved.flipped).toBe(spot.flipped);
  });

  it('框本来就顶在画布外时（「两边都放不下」那条分支），拖动**不把它拽回来**', () => {
    // x = 492 而画布 760 装不下整只框 —— 这正是用户报的那个「过不去」的场景的起点
    const spot = panelSpot({ x: 280, y: 108 }, 760, 332, PANEL_EST_H);
    expect(spot.flipped).toBe(false);
    expect(spot.x).toBeGreaterThan(760 - PANEL_W);

    const shift = (dx: number) => shiftPanel(spot, { dx, dy: 0 }, { w: 760, h: 332 }).x;
    // 新的右界是 `board.w`（框**左缘**可以到画布右缘，右半只框探出原画布，画布跟着长、
    // 横向滚回来）。所以不但不拽回，**反而能继续往右拖** —— 一直到左缘贴上画布右缘。
    expect(shift(40)).toBe(spot.x + 40);
    expect(shift(-40)).toBe(spot.x - 40);
    expect(shift(99999)).toBe(760);
    expect(shift(-9999)).toBe(0);
  });

  it('左上角夹在画布里：**抓手（标题那一行）必须始终抓得到**', () => {
    const spot = panelSpot(card, 4000, 4000, PANEL_EST_H);

    // 往左上拖到底：x 收到 0，y 收到 0。拖不出去之后把手还在画布里，能拖回来
    expect(shiftPanel(spot, { dx: -99999, dy: -99999 }, board)).toMatchObject({ x: 0, y: 0 });
    // 往右下拖到底：x 收到 board.w（整个左缘贴画布右缘）、y 收到 board.h - maxH
    //   （底缘贴画布下缘）。两界都不压扁框 —— `maxH` 全程是内容高度。
    const br = shiftPanel(spot, { dx: 99999, dy: 99999 }, board);
    expect(br.x).toBe(board.w);
    expect(br.y).toBe(board.h - spot.maxH);
    expect(br.y + br.maxH).toBe(board.h);
  });

  it('拖到下方时框**整体滑入画布、不再被压扁**（用户报的「滚动条」来源）', () => {
    const spot = panelSpot(card, 4000, 4000, PANEL_EST_H);
    // 一路拖到底：y 夹在 board.h - maxH 上，整只框都露出来 —— 不再按新位置把 maxH 砍小
    const low = shiftPanel(spot, { dx: 0, dy: 5000 }, board);

    expect(low.y).toBe(board.h - spot.maxH);
    expect(low.maxH).toBe(spot.maxH);
    expect(low.y + low.maxH).toBeLessThanOrEqual(board.h);
  });

  it('maxH 是内容高度，往下拖不缩、往上拖不长', () => {
    // 卡贴着画布下方，自动落位给的 maxH = panelH = 300（整只内容高度）
    const spot = panelSpot({ x: 300, y: 400 }, 4000, 700, PANEL_EST_H);
    const up = shiftPanel(spot, { dx: 0, dy: -200 }, { w: 4000, h: 700 });

    expect(spot.maxH).toBe(PANEL_EST_H);
    // 拖到上面之后「下面」反而空出了 500 —— 但 maxH 是内容高度，绝不为「有空位」而拉长
    expect(up.y).toBe(200);
    expect(up.maxH).toBe(PANEL_EST_H);
  });

  it('画布比框还窄/还矮的退化情形不抛、也不出负数', () => {
    const tiny = { w: 100, h: 50 };
    const moved = shiftPanel({ x: 0, y: 0, maxH: 30, flipped: false }, { dx: 500, dy: 500 }, tiny);

    // 右界 max(100, 0)=100：x 顶到 100，框右半只探出（与「右边可探出」同一口径）
    expect(moved.x).toBe(100);
    // 画布会因框而长到「框底 + 留白」= 54，所以按下界的 y 顶到 54-30=24（不再用裸 board.h 掐）
    expect(moved.y).toBe(24);
    expect(moved.maxH).toBe(30);
  });
});

describe('canvasWithPanel（信息框算进画布宽度）', () => {
  it('没选中就是原尺寸', () => {
    expect(canvasWithPanel({ w: 800, h: 400 }, null)).toEqual({ w: 800, h: 400 });
  });

  it('框往右顶出去时画布跟着长，右边留出 CANVAS_PAD', () => {
    const spot = panelSpot({ x: 600, y: 40 }, 100, 4000, PANEL_EST_H);
    const size = canvasWithPanel({ w: 100, h: 400 }, spot);

    expect(size.w).toBe(spot.x + PANEL_W + CANVAS_PAD);
    expect(size.h).toBe(400);
  });

  it('翻到左侧时不长（框整个在卡片左边，一定在画布内）', () => {
    const card = { x: 600, y: 0 };
    const spot = panelSpot(card, 880, 4000, PANEL_EST_H);
    expect(spot.flipped).toBe(true);
    expect(canvasWithPanel({ w: 880, h: 400 }, spot)).toEqual({ w: 880, h: 400 });
  });

  it('高度不动：整只框落在画布内（bottom ≤ size.h）就不补', () => {
    // 卡在最后一行，框贴卡片下缘往上长，底边 192+300=492 ≤ 500 —— 框没伸出去，高度不动。
    // 这正是「卡片在下方」那个场景：完整显示靠**框往上长**，不靠把画布加高。
    const spot = panelSpot({ x: 300, y: 400 }, 4000, 500, PANEL_EST_H);
    const size = canvasWithPanel({ w: 4000, h: 500 }, spot);

    expect(size.h).toBe(500);
  });

  it('框比画布还高（`bottom > size.h`）→ 画布往下长到「框底 + 留白」，框不被截短', () => {
    // 这就是「绝不内部滚」的兜底：内容（panelH=600）比画布（400）还高，两个方向都放不下整只，
    // 框摆下去、底边伸出，由画布补足 —— 而不是把 maxH 砍到 400 去迁就画布。
    const spot = panelSpot({ x: 300, y: 0 }, 4000, 400, 600);
    expect(spot.maxH).toBe(600);
    expect(spot.y + spot.maxH > 400).toBe(true);

    const size = canvasWithPanel({ w: 4000, h: 400 }, spot);
    expect(size.h).toBe(600 + CANVAS_PAD);
    expect(size.w).toBe(4000);
  });
});
