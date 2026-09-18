import {
  DashboardLayout,
  DashboardPerson,
  DashboardWidget,
  WidgetSize,
  WidgetType,
  WIDGET_SIZES,
} from '../../define/dashboard/DashboardLayout';

/**
 * 看板布局与 JSON 的互转。**要编也要解** —— 与其他只解的 codec 不同：布局是整个看板里
 * 唯一由前端写回后端的数据（PUT `/layout`），所以 `encode` 是与 `decode` 同等重要的一半。
 *
 * 三条口径：
 * - **`decode` 什么都不补**：`title` 没设就保持 `undefined`（不是空串），`creator` 没下发就不要这个键。
 *   「没设」与「设成了空」在编辑器里是两件事 —— 后者会显示成一片空白标题，前者会退回默认名。
 * - **`encode` 只发该发的**：`spaceId` 与 `creator` / `updater` 不带（服务端从路径与 JWT 取，
 *   客户端说了不算）。**`version` 必须带**：它是乐观锁，漏了后端按「首次保存」处理，
 *   别人的改动会被无声覆盖。
 * - **线格式里有坐标，但只有两个数**：每张卡带 `x` / `y`（网格单位，左上角起点）。
 *   占几列几行（`w` / `h`）**不上行** —— 那是从 `size` 档位推出来的，服务端只认档位名
 *   （见 `DashboardLayout` 的 `WIDGET_SIZES`）。老文档里那两个都不存在，读出来是 `undefined`，
 *   由**页面**去补（见下面「这个类不补坐标」）。
 *
 * **这个类不补坐标**：`x` / `y` 缺失时只是 `undefined`，不在这里按顺序铺位置 —— 本类第一条口径
 * 就是「`decode` 什么都不补」，而「没有坐标时该摆在哪儿」是排版知识，属于页面
 * （`pages/main/dashboard/dashboard.grid` 的 `ensurePlacements`）。再者 `typedef/` 从不反向
 * import `pages/`，把那段搬进来会开一个坏头。
 *
 * 老文档里那个嵌套的 `widgets[].layout`（改造前的 `{x, y, w, h}`）**不认识就丢掉**
 * （Mongo 的 POJO codec 与 `@JsonIgnoreProperties` 都跳过未知键），第一次保存就把它洗掉了
 * —— 不需要迁移。注意别把它与现在的平铺 `x` / `y` 搞混：**那个是历史残留，不读也不写**。
 */
export class DashboardLayoutCodec {
  static decode(o: any): DashboardLayout {
    const x = new DashboardLayout();
    x.spaceId = o?.spaceId ?? '';
    x.version = o?.version ?? 0;
    x.widgets = DashboardLayoutCodec.decodeWidgets(o?.widgets);
    x.creator = DashboardLayoutCodec.decodePerson(o?.creator);
    x.updater = DashboardLayoutCodec.decodePerson(o?.updater);
    return x;
  }

  static decodeWidgets(rows: any): DashboardWidget[] {
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows.map((row) => DashboardLayoutCodec.decodeWidget(row));
  }

  static decodeWidget(o: any): DashboardWidget {
    const x = new DashboardWidget();
    x.id = o?.id ?? '';
    x.type = TYPES.includes(o?.type) ? (o.type as WidgetType) : 'stat';
    // 缺 title / titleKey 就是 undefined：预置布局的卡片靠 titleKey 显示名字，
    // 用户改过的卡片靠自己那份 title，两者都空时由页面按 type 兜底
    x.title = typeof o?.title === 'string' ? o.title : undefined;
    x.titleKey = typeof o?.titleKey === 'string' ? o.titleKey : undefined;
    x.size = readSize(o?.size);
    // 坐标：**两个都要**，只给一个的文档按「都没有」处理（由页面整份重铺）。
    // `cellCoord` 只收非负整数 —— `"6"` 这种字符串数字收下来只会掩盖后端的一次改动，
    // 小数则根本不是格子下标；两种都当「没有这个键」
    const cx = cellCoord(o?.x);
    const cy = cellCoord(o?.y);
    if (cx !== undefined && cy !== undefined) {
      x.x = cx;
      x.y = cy;
    }
    x.refresh = typeof o?.refresh === 'number' ? o.refresh : undefined;
    // config 原样收下：它异构，按 type 断言是渲染侧的事（见 DashboardWidget 的说明）
    x.config = o?.config && typeof o.config === 'object' ? { ...o.config } : {};
    return x;
  }

  static decodePerson(o: any): DashboardPerson | undefined {
    // 整个键缺失（预置布局没有作者）时不要造一个空壳 —— 页面据此判断「显不显示作者」，
    // 一个 {id: undefined} 会让它显示出一行空白
    if (!o || typeof o !== 'object') {
      return undefined;
    }
    return { id: o.id, name: o.name, timestamp: o.timestamp };
  }

  /**
   * 保存请求体。**只发这几个键**，其余一概不发。
   *
   * 坐标在 `widgets` 每一项上（{@link encodeWidget}），这里不再另发一份 ——
   * `widgets` 的数组顺序是**阅读顺序**，一并带上，两者保持一致是页面的责任。
   */
  static encode(layout: DashboardLayout): any {
    return {
      // 乐观锁：读到的原值原样回传，服务端比对不上就拒（而不是覆盖别人的改动）
      version: layout.version,
      widgets: layout.widgets.map((widget) => DashboardLayoutCodec.encodeWidget(widget)),
    };
  }

  static encodeWidget(widget: DashboardWidget): any {
    const body: any = {
      id: widget.id,
      type: widget.type,
      size: widget.size,
      config: widget.config ?? {},
    };
    // 空标题按「没设」处理：发一个空串上去，会被存成一个「用户把标题清空了」的卡片，
    // 之后它既不显示预置名也不显示用户名的位置 —— 而用户的本意是改回默认
    if (widget.title) {
      body.title = widget.title;
    }
    // titleKey 只在用户**没改标题**时原样带回去：它是「这张卡还挂着预置名」的记号，
    // 用户一旦自己起了名字，这张卡就是他的了，不该再留着一个会随服务端改文案而变的旧记号
    if (widget.titleKey && !widget.title) {
      body.titleKey = widget.titleKey;
    }
    if (widget.refresh !== undefined) {
      body.refresh = widget.refresh;
    }
    // 坐标**必须发**，两个一起发：不发就等于每次保存都退回「没有坐标」，
    // 用户下一次刷新会看到整屏重排。只发一个是脏数据（服务端两个都要），
    // 宁可两个都不发、让服务端按旧布局处理，也不要发半个
    if (widget.x !== undefined && widget.y !== undefined) {
      body.x = widget.x;
      body.y = widget.y;
    }
    return body;
  }
}

const TYPES: WidgetType[] = ['stat', 'line', 'distribution', 'device', 'service'];

/**
 * 旧档位名 → 现在的名字（`W{列}H{像素}` 那一套之前的 `S1` / `M1` / `S` / `M` / `L` / `XL`）。
 *
 * **这层映射必须有**：库里存着的布局写的是旧名，认不出来就会落到下面的兜底档位 ——
 * 那是一次**静默的改尺寸**（用户没动过的卡片自己变了大小，界面上查不出原因），
 * 正是 `DashboardLayout` 里那条「静默改尺寸比留一个旧档位更坏」要避免的事。
 * 读的时候翻译成新名，用户下一次保存时库里就自动落成新名了，不需要迁移脚本。
 */
const LEGACY_SIZES: Record<string, WidgetSize> = {
  S1: 'W6H92',
  M1: 'W12H92',
  S: 'W6H200',
  M: 'W12H200',
  L: 'W12H416',
  XL: 'W24H416',
};

/**
 * 读一个档位名：**新名 → 旧名 → 兜底**。
 *
 * 名字的名单直接取自 `WIDGET_SIZES` 的键（加档位只改那一处，这里不用跟着抄）。
 * 认不出来时给 `W6H200`（最小的常规档）：那意味着库里存着一个将来某个版本写的档位，
 * 给个小格子总比给个撑满屏幕的好 —— 与 `dashboard.grid` 的 `sizeOf` 同一条兜底。
 */
function readSize(raw: unknown): WidgetSize {
  if (typeof raw === 'string') {
    if (raw in WIDGET_SIZES) {
      return raw as WidgetSize;
    }
    const legacy = LEGACY_SIZES[raw];
    if (legacy) {
      return legacy;
    }
  }
  return 'W6H200';
}

/** 读一个网格坐标（非负整数）。不合法一律 `undefined` = 「没有这个键」 */
function cellCoord(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : undefined;
}
