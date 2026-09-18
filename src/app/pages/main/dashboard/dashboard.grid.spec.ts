import {
  DashboardWidget,
  GRID_COLUMNS,
  GRID_GAP,
  GRID_ROW_HEIGHT,
  WidgetSize,
  WIDGET_SIZES,
} from '../../../typedef/define/dashboard/DashboardLayout';
import {
  Placement,
  cardHeight,
  cellDelta,
  compact,
  ensurePlacements,
  findSlot,
  fitsAt,
  flowPlace,
  hasPlacements,
  placeAt,
  placementsOf,
  sizeOf,
} from './dashboard.grid';

/**
 * 网格排版。要钉住的是**文件头那三条不变量**，外加两条这一轮特有的：
 *
 * - **每一档的像素高度与改造前一致**：行高从 38 改成 92 是一次纯内部换算，
 *   用户不该在自己的看板上看出任何差别（除非他正好想用新档位）。
 * - **高度可以拼接**：两张一行高的卡竖着叠起来，与一张两行高的卡**严丝合缝** ——
 *   这是「人眼看上去可以占领的空间，卡片就可以拖过去占领」的实现基础。
 */
describe('dashboard.grid', () => {
  describe('sizeOf', () => {
    it('按档位给占格', () => {
      expect(sizeOf(widget('S1'))).toEqual({ w: 6, h: 1 });
      expect(sizeOf(widget('M1'))).toEqual({ w: 12, h: 1 });
      expect(sizeOf(widget('S'))).toEqual({ w: 6, h: 2 });
      expect(sizeOf(widget('M'))).toEqual({ w: 12, h: 2 });
      expect(sizeOf(widget('L'))).toEqual({ w: 12, h: 4 });
      expect(sizeOf(widget('XL'))).toEqual({ w: 24, h: 4 });
    });

    it('不认识的档位退回 S（不是撑满一屏的 XL）', () => {
      const odd = widget('S');
      odd.size = 'Huge' as WidgetSize;

      expect(sizeOf(odd)).toEqual({ w: 6, h: 2 });
    });

    it('档位表里每一档都落在 24 列之内（越界的卡会被挤到下一行，看着像自己跳了）', () => {
      for (const size of Object.keys(WIDGET_SIZES) as WidgetSize[]) {
        expect(WIDGET_SIZES[size].w).toBeLessThanOrEqual(GRID_COLUMNS);
        expect(WIDGET_SIZES[size].w).toBeGreaterThan(0);
        expect(WIDGET_SIZES[size].h).toBeGreaterThan(0);
      }
    });
  });

  describe('cardHeight', () => {
    it('h 个行高、中间 h − 1 道缝', () => {
      // 写成 h × 92 会少掉缝，卡片比它占的格子矮一截；写成 (h+1) × 92 则溢出到下一张卡上
      expect(cardHeight(1)).toBe(GRID_ROW_HEIGHT);
      expect(cardHeight(2)).toBe(2 * GRID_ROW_HEIGHT + GRID_GAP);
      expect(cardHeight(4)).toBe(4 * GRID_ROW_HEIGHT + 3 * GRID_GAP);
    });

    it('**每一档的像素高度与改造前完全一致**', () => {
      // 改造前是 GRID_ROW_HEIGHT = 38，档位表里的 h 是现在的两倍。这两组数字一个都不许变：
      // 行高从 38 改成 92 只是内部换算，用户不该在自己的看板上看出任何差别。
      // 这条用例把「旧算式」硬编码在这里，改常量时它会当场红
      const before = (h: number) => h * 38 + (h - 1) * 16;

      expect(cardHeight(WIDGET_SIZES.S.h)).toBe(before(4));
      expect(cardHeight(WIDGET_SIZES.M.h)).toBe(before(4));
      expect(cardHeight(WIDGET_SIZES.L.h)).toBe(before(8));
      expect(cardHeight(WIDGET_SIZES.XL.h)).toBe(before(8));
    });

    it('**高度可以拼接**：两张一行高的卡叠起来 = 一张两行高的卡', () => {
      // 用户要的正是这个：「2 个 90px 高度的卡片，竖向排布，加上间隔，高度就和 200px 的卡片一样了」。
      // 中间那道缝也要算进去 —— 两张卡之间同样有 gap，不然会矮 16px
      expect(cardHeight(1) + GRID_GAP + cardHeight(1)).toBe(cardHeight(2));
    });
  });

  describe('flowPlace', () => {
    it('复刻旧的流式排版：从左上往右下铺，一行放不下就换行', () => {
      // 手算的期望值：M(12 列) 占掉左半边；两张 S(6 列) 依次落在右边；
      // 第三张 S 在第 0、1 行都放不下（那两行已满），于是落到第 2 行
      expect(flowPlace([widget('M', 'a'), widget('S', 'b'), widget('S', 'c'), widget('S', 'd')])).toEqual([
        place('a', 0, 0, 12, 2),
        place('b', 12, 0, 6, 2),
        place('c', 18, 0, 6, 2),
        place('d', 0, 2, 6, 2),
      ]);
    });

    it('矮卡能落进高卡旁边的空里（这正是旧模型做不到的事）', () => {
      // 左边一张高卡，右边竖着两张矮卡。改造前这排不出来 —— 流式排布里第二行要从
      // 「第一行最高的那张卡」下面才开始，右边那块明明空着的地方落不下去。
      // 现在只是普通的一行，因为流式铺开本来就是「逐行扫第一个放得下的位置」
      expect(flowPlace([widget('L', 'big'), widget('S1', 's1'), widget('S1', 's2')])).toEqual([
        place('big', 0, 0, 12, 4),
        place('s1', 12, 0, 6, 1),
        place('s2', 18, 0, 6, 1),
      ]);
    });

    it('忽略卡片上已有的坐标（它回答的是「没有坐标时该怎么摆」）', () => {
      const moved = widget('S', 'a', 18, 7);

      expect(flowPlace([moved])).toEqual([place('a', 0, 0, 6, 2)]);
    });
  });

  describe('二维摆放（用户要的那件事）', () => {
    it('两张一行高的卡竖向叠在一张两行高的卡旁边，底边齐平', () => {
      // 这是「高度可以拼接」在**布局**上的样子：两张 S1 叠起来正好与一张 S 等高，
      // 于是它们能并排放在同一段纵向空间里
      const items = [
        place('big', 0, 0, 6, 2),
        place('top', 6, 0, 6, 1),
        place('bottom', 6, 1, 6, 1),
      ];

      expectNoOverlap(items);
      expect(cardHeight(1) + GRID_GAP + cardHeight(1)).toBe(cardHeight(2));
      // 底边对齐：两行高的卡下沿在第 2 行，第二张矮卡的下沿也在第 2 行
      expect(items[0].y + items[0].h).toBe(items[2].y + items[2].h);
    });

    it('把第三张矮卡拖进「大卡旁边剩下的那一行」—— 拖得进去，且与大卡底边齐平', () => {
      // 大卡 6 列 2 行，右边已有一张矮卡在第 0 行；把一个矮卡拖到第 1 行的那半格上。
      // 改造前这件事做不到：那一行在大卡的纵向范围内，流式排布看不见它
      const items = [
        place('big', 0, 0, 6, 2),
        place('top', 6, 0, 6, 1),
        place('bottom', 6, 1, 6, 1),
      ];
      const before = [
        place('big', 0, 0, 6, 2),
        place('top', 6, 0, 6, 1),
        place('bottom', 0, 4, 6, 1),
      ];
      const after = placeAt(before, 'bottom', 6, 1);
      const byId = index(after);

      expect(byId['bottom'].y).toBe(1);
      expectNoOverlap(after);
      // 与上面那份手摆的结果一致 ⇒ 拖出来的就是「人眼看上去能占的那块地方」
      expect(byId['bottom']).toEqual(items[2]);
    });
  });

  describe('hasPlacements', () => {
    it('齐全、在界内、互不重叠才算有', () => {
      expect(hasPlacements([widget('S', 'a', 0, 0), widget('S', 'b', 6, 0)])).toBe(true);
    });

    it('缺一个坐标就是没有（旧文档）', () => {
      expect(hasPlacements([widget('S', 'a', 0, 0), widget('S', 'b')])).toBe(false);
    });

    it('越界或负数就是没有', () => {
      expect(hasPlacements([widget('XL', 'a', 6, 0)])).toBe(false);
      expect(hasPlacements([widget('S', 'a', -1, 0)])).toBe(false);
      expect(hasPlacements([widget('S', 'a', 0, -1)])).toBe(false);
    });

    it('互相压着就是没有（脏数据照它渲染就是两张卡叠在一起）', () => {
      expect(hasPlacements([widget('S', 'a', 0, 0), widget('S', 'b', 3, 0)])).toBe(false);
    });

    it('边界相接不算重叠', () => {
      // 一张的下沿正好是另一张的上沿
      expect(hasPlacements([widget('S', 'a', 0, 0), widget('S', 'b', 0, 2)])).toBe(true);
      expect(hasPlacements([widget('S', 'a', 0, 0), widget('S', 'b', 6, 0)])).toBe(true);
    });

    it('空布局算有（没有卡片就没有什么可重铺的）', () => {
      expect(hasPlacements([])).toBe(true);
    });
  });

  describe('ensurePlacements', () => {
    it('旧布局（没有坐标）整份按流式铺一遍', () => {
      const legacy = [widget('M', 'a'), widget('S', 'b'), widget('S', 'c')];
      const fixed = ensurePlacements(legacy);

      expect(fixed.map((w) => [w.x, w.y])).toEqual([
        [0, 0],
        [12, 0],
        [18, 0],
      ]);
      // 铺完就是合法的了
      expect(hasPlacements(fixed)).toBe(true);
    });

    it('铺过一遍之后再铺是同一个结果（用户保存前会重复调它）', () => {
      const once = ensurePlacements([widget('M', 'a'), widget('S', 'b')]);
      const twice = ensurePlacements(once);

      expect(twice.map((w) => [w.x, w.y])).toEqual(once.map((w) => [w.x, w.y]));
    });

    it('坐标齐全时原样返回（同一个数组，不白白换引用）', () => {
      const good = [widget('S', 'a', 0, 0), widget('S', 'b', 6, 0)];

      expect(ensurePlacements(good)).toBe(good);
    });

    it('只改坐标，卡片上别的一个字段都不动', () => {
      const legacy = [widget('S', 'a')];
      legacy[0].title = '东区温度';
      legacy[0].refresh = 30;

      const fixed = ensurePlacements(legacy)[0];

      expect(fixed.title).toBe('东区温度');
      expect(fixed.refresh).toBe(30);
      expect(fixed.size).toBe('S');
      expect(fixed.id).toBe('a');
    });
  });

  describe('findSlot', () => {
    it('空布局落在左上角', () => {
      expect(findSlot([], 6, 2)).toEqual({ x: 0, y: 0 });
    });

    it('**先填洞**：腾出来的空位拿得回来，而不是一路排到末尾', () => {
      // 一行里左边空着 6 列，右边占着 —— 新卡片该落进那个空里
      const items = [place('a', 6, 0, 6, 2)];

      expect(findSlot(items, 6, 2)).toEqual({ x: 0, y: 0 });
    });

    it('顶上排满了就往下接一行', () => {
      const items = [place('a', 0, 0, 24, 2)];

      expect(findSlot(items, 6, 2)).toEqual({ x: 0, y: 2 });
    });

    it('宽度放不下时不会给一个越界的 x', () => {
      const items = [place('a', 0, 0, 18, 2)];

      // 只剩 6 列，12 宽的卡片放不下，落到下一行
      expect(findSlot(items, 12, 2)).toEqual({ x: 0, y: 2 });
    });
  });

  describe('compact', () => {
    it('**只往上吸，不左右挪**', () => {
      const items = [place('a', 6, 4, 6, 2)];
      const result = compact(items);

      expect(result[0].x).toBe(6);
      expect(result[0].y).toBe(0);
    });

    it('被压着的吸不动', () => {
      const items = [place('a', 0, 0, 6, 2), place('b', 0, 5, 6, 2)];

      expect(compact(items).map((i) => i.y)).toEqual([0, 2]);
    });

    it('输出按 (y, x) 排好（这是幂等的前提）', () => {
      const items = [place('b', 6, 3, 6, 1), place('a', 0, 3, 6, 1)];
      const result = compact(items);

      // 两张都能吸到第 0 行，然后按 (y, x) 重排 —— 输入顺序是反的，输出是正的
      expect(result.map((i) => i.id)).toEqual(['a', 'b']);
      expect(result.every((i) => i.y === 0)).toBe(true);
    });

    it('**幂等**：吸完再吸一次，位置与顺序都不变', () => {
      // 这一条踩过坑：按吸之前的顺序处理、又原样返回，第二次进来就是另一组位置，
      // 表现成「每保存一次布局就自己重排一次」
      const messy = [
        place('a', 6, 0, 6, 1),
        place('b', 0, 3, 6, 2),
        place('c', 6, 2, 6, 1),
        place('d', 0, 7, 12, 2),
      ];
      const once = compact(messy);
      const twice = compact(once);

      expect(twice).toEqual(once);
    });

    it('**幂等**也经得起「顺序会翻」的输入', () => {
      // a 在 b 下面但在左边：吸完之后 a 跑到 b 前面去了（阅读顺序变了）。
      // 顺序一翻，第二次进来的处理次序就不同 —— 结果必须仍然一样
      const items = [place('a', 0, 3, 6, 1), place('b', 6, 0, 6, 1)];
      const once = compact(items);

      expect(once.map((i) => i.id)).toEqual(['a', 'b']);
      expect(compact(once)).toEqual(once);
    });
  });

  describe('fitsAt', () => {
    it('界内就放得下', () => {
      expect(fitsAt(0, 0, 6)).toBe(true);
      expect(fitsAt(18, 0, 6)).toBe(true); // 18 + 6 = 24，正好贴着右边
      expect(fitsAt(0, 99, 24)).toBe(true); // 行往下是无限的
    });

    it('顶出右边界就放不下', () => {
      expect(fitsAt(19, 0, 6)).toBe(false);
      expect(fitsAt(12, 0, 24)).toBe(false); // 24 宽的卡只有 x = 0 放得下
      expect(fitsAt(24, 0, 6)).toBe(false);
    });

    it('跑到板子上边或左边就放不下', () => {
      expect(fitsAt(0, -1, 6)).toBe(false);
      expect(fitsAt(-1, 0, 6)).toBe(false);
    });

    it('**压在别人身上仍然算放得下** —— 那是让位的事，不是界的事', () => {
      // 这一条是「可以放置」那个判定的口径：拖动中只有越界才变红，压到别人不变红，
      // 因为松手之后被压的会往下让。要是这里判成放不下，用户就没法把卡往上叠了
      expect(fitsAt(0, 0, 24)).toBe(true);
    });
  });

  describe('placeAt', () => {
    it('**拖到哪就落在哪**，不被吸走', () => {
      // 纵向自由的前提：吸走了就永远只能在顶上排，也就谈不上「纵向占领空间」
      const items = [place('a', 0, 0, 6, 2)];
      const result = placeAt(items, 'a', 0, 5);

      expect(result.find((i) => i.id === 'a')!.y).toBe(5);
    });

    it('被压到的往下让，让到不压为止', () => {
      const items = [place('a', 0, 0, 6, 2), place('b', 0, 2, 6, 2), place('c', 0, 4, 6, 2)];
      // 把 c 拎到 a 的位置上：a、b 依次往下让
      const result = placeAt(items, 'c', 0, 0);
      const byId = index(result);

      expect(byId['c'].y).toBe(0);
      // 让位是**顺次**的：每张落到上面那张的正下方，中间不留缝
      expect(byId['a'].y).toBe(2);
      expect(byId['b'].y).toBe(4);
    });

    it('**让完就停**：没被压到的卡不会自己往上吸', () => {
      // 这是这一轮去掉上吸的那条口径。上吸在这里会把 b 从第 6 行吸到第 2 行 ——
      // 用户明明把 b 摆在下面留着位置，一松手它自己跑了，白摆一次
      const items = [place('a', 0, 0, 6, 2), place('b', 0, 6, 6, 2), place('c', 12, 4, 12, 4)];
      const result = placeAt(items, 'c', 12, 0);
      const byId = index(result);

      expect(byId['c'].y).toBe(0);
      expect(byId['a'].y).toBe(0);
      expect(byId['b'].y).toBe(6); // 没被压到，原样待着
    });

    it('让位之后整屏仍然不重叠、不越界', () => {
      const items = [
        place('a', 0, 0, 12, 2),
        place('b', 12, 0, 12, 2),
        place('c', 0, 2, 6, 2),
        place('d', 6, 2, 6, 2),
      ];
      const result = placeAt(items, 'd', 0, 0);

      expectNoOverlap(result);
    });

    it('越界的落点被**夹回界内**（兜底：拖拽那条路自己会先判界，别的调用方不会）', () => {
      const items = [place('a', 0, 0, 12, 2)];
      // 12 宽的卡片最大起始列是 12（12 + 12 = 24）
      expect(placeAt(items, 'a', 20, 0).find((i) => i.id === 'a')!.x).toBe(12);
      expect(placeAt(items, 'a', -5, 0).find((i) => i.id === 'a')!.x).toBe(0);
      expect(placeAt(items, 'a', 0, -4).find((i) => i.id === 'a')!.y).toBe(0);
    });

    it('**幂等**：同一个落点放两次是同一个结果', () => {
      const items = [place('a', 0, 0, 6, 2), place('b', 6, 0, 6, 2), place('c', 0, 2, 12, 2)];
      const once = placeAt(items, 'c', 6, 0);
      const twice = placeAt(once, 'c', 6, 0);

      expect(twice).toEqual(once);
    });

    it('不动传进来的数组', () => {
      const items = [place('a', 0, 0, 6, 2), place('b', 0, 2, 6, 2)];
      const snapshot = JSON.parse(JSON.stringify(items));

      placeAt(items, 'b', 0, 0);

      expect(items).toEqual(snapshot);
    });

    it('id 对不上时原样返回（拖拽与草稿短暂错位时不要炸）', () => {
      const items = [place('a', 0, 0, 6, 2)];

      expect(placeAt(items, 'nope', 0, 0)).toBe(items);
    });
  });

  describe('cellDelta', () => {
    it('走了一格就是一格', () => {
      const unit = 50;

      expect(cellDelta(50, 0, unit)).toEqual({ dc: 1, dr: 0 });
      expect(cellDelta(0, GRID_ROW_HEIGHT + GRID_GAP, unit)).toEqual({ dc: 0, dr: 1 });
    });

    it('走了半格算一格（就近取整，不然要拖满一整格才动）', () => {
      expect(cellDelta(30, 0, 50)).toEqual({ dc: 1, dr: 0 });
      expect(cellDelta(20, 0, 50)).toEqual({ dc: 0, dr: 0 });
    });

    it('负数对称', () => {
      expect(cellDelta(-50, 0, 50)).toEqual({ dc: -1, dr: 0 });
    });

    it('容器还没量出来（宽度 0）时给 0，不是 Infinity/NaN', () => {
      expect(cellDelta(120, 0, 0)).toEqual({ dc: 0, dr: 0 });
    });
  });
});

/** 造一张卡片。**带坐标**的卡片才代表「新格式」，不给 x/y 就是旧布局 */
function widget(size: WidgetSize, id = 'w1', x?: number, y?: number): DashboardWidget {
  const w = new DashboardWidget();
  w.id = id;
  w.size = size;
  w.x = x;
  w.y = y;
  return w;
}

/** 一个期望的 Placement */
function place(id: string, x: number, y: number, w: number, h: number): Placement {
  return { id, x, y, w, h };
}

function index(items: Placement[]): Record<string, Placement> {
  const byId: Record<string, Placement> = {};
  for (const item of items) {
    byId[item.id] = item;
  }
  return byId;
}

/** 任意两张不重叠、且都在界内。每一个改动坐标的函数跑完都该过一遍这个 */
function expectNoOverlap(items: Placement[]): void {
  for (const item of items) {
    expect(item.x).toBeGreaterThanOrEqual(0);
    expect(item.y).toBeGreaterThanOrEqual(0);
    expect(item.x + item.w).toBeLessThanOrEqual(GRID_COLUMNS);
  }
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const apart =
        a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      expect(apart).toBe(true);
    }
  }
}

// placementsOf 本身没有别的行为，一并在这里钉一下「坐标缺失按 0 算」这条前提
describe('placementsOf', () => {
  it('坐标缺失按 0 算（所以要先问 hasPlacements）', () => {
    expect(placementsOf([widget('S', 'a')])).toEqual([place('a', 0, 0, 6, 2)]);
  });
});
