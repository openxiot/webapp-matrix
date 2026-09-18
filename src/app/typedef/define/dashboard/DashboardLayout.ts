/**
 * 自定义数据看板的布局与卡片（`/matrix/v1/dashboard`，见 service-matrix 的
 * `自定义首页方案.md` 与 `API.md`）。
 *
 * 三条与后端对齐的口径：
 * - **布局是一个空间（项目）一份**，空间内共享。读写权限不对称：读是空间成员、写是空间管理员。
 *   所以这里**没有 `editable` 字段** —— 能不能编辑由前端按 `isAdmin` 现算（§6.2），
 *   服务端不重复下发一份可能过期的判断。
 * - **位置是坐标**：每张卡带 {@link DashboardWidget.x}（起始列，0..23）与
 *   {@link DashboardWidget.y}（起始行，0 起），二维自由摆放。
 *   {@link DashboardLayout.widgets} 的数组顺序是**阅读顺序**（窄屏一列时的顺序），
 *   每次落定后按 `(y, x)` 重排一次让两者保持一致 —— 但它**不是位置的真值**。
 *   占几列几行（`w` / `h`）仍由 `size` 档位按 {@link WIDGET_SIZES} 在前端算，**不上行**：
 *   服务端只认档位名，存 `w`/`h` 就是第二份会过期的真值。
 * - **时间一律是毫秒时间戳**，与其他接口同口径。
 */

/** 卡片类型。只剩 `line` 的 `serviceField` 分支还没接数据源，提交能存但渲染会回「暂不支持」 */
export type WidgetType = 'stat' | 'line' | 'distribution' | 'device' | 'service';

/**
 * 尺寸档位。名字是 `W{占几列}H{多少像素}`，**说的就是这一档的两件事**：
 * `W6H200` = 6 列宽、200 像素高。所以名字本身可读，也自带一道校验 ——
 * 「名字与实际占格对不上」这件事有 `dashboard.grid.spec.ts` 一条用例钉着。
 *
 * 为什么不用 `S` / `M` / `L` / `XL`（那是上一版的名字）：**那套名字早就不成立了**。
 * `S1` 是 6 宽 1 行、`S` 是 6 宽 2 行、`M1` 是 12 宽 1 行、`L` 与 `XL` 同高不同宽 ——
 * 字母既不单调对应宽度、也不对应高度，「S 比 M 小」这句话在引入矮档位那天起就是错的。
 *
 * 名字里用**像素**而不是行数：行数会跟着行高变。上一次把行高从 38 改成 92 时，
 * 每档的行数被整体减半（`h: 4` → `h: 2`）而像素一个没动 —— 像素是稳定的那一维。
 *
 * 档位是可以**拼**的：矮档位竖着叠起来正好等于高一档（`92 + 16 + 92 = 200`），
 * 所以 308 那一档能由「一张 200 + 一张 92」占满，416 能由四张 92 占满。
 */
export type WidgetSize =
  | 'W6H92'
  | 'W12H92'
  | 'W6H200'
  | 'W12H200'
  | 'W24H200'
  | 'W12H308'
  | 'W24H308'
  | 'W12H416'
  | 'W24H416';

/**
 * 尺寸档位 → 占几列几行（24 列网格）。**这张表是档位的唯一真值**：
 * 名字、宽度选项、高度选项、占格全由它推出来，别处不许再抄一份。
 *
 * **这张表只在前端**：服务端只认档位名（认不认识这个名字），排版知识全在这里 ——
 * 加档位时改这一处，后端 `WidgetSize` 跟着加一个枚举常量即可，不必同步数值。
 * 服务端也**不存 `w` / `h`**：那是从档位推出来的，存一份就是第二份会过期的真值。
 *
 * `h` 是**行数**，一行 {@link GRID_ROW_HEIGHT} 像素，所以像素高度 = `h × 92 + (h − 1) × 16`
 * —— 即 `108h − 16`，是个**等差阶梯**（92 / 200 / 308 / 416，步长 108 = 一行加一道缝）。
 * 一行 92 这个数是挑出来的（理由见 {@link GRID_ROW_HEIGHT}）：它让每一档的像素高度与
 * 改造前**一像素不差**，同时让「两张一行高的卡竖着叠起来」正好等于「一张两行高的卡」。
 *
 * 宽度的两个缺口是故意的：**没有 6 宽的 308 / 416**（细高条放图表没法看，而那一竖条
 * 用矮卡摞就能填满），**没有整宽的 92**（一行高的整宽卡没有对应的内容）。
 */
export const WIDGET_SIZES: Record<WidgetSize, { w: number; h: number }> = {
  W6H92: { w: 6, h: 1 }, // 92px，统计专用
  W12H92: { w: 12, h: 1 }, // 92px，统计专用
  W6H200: { w: 6, h: 2 }, // 200px
  W12H200: { w: 12, h: 2 }, // 200px
  W24H200: { w: 24, h: 2 }, // 200px，整宽的横幅
  W12H308: { w: 12, h: 3 }, // 308px
  W24H308: { w: 24, h: 3 }, // 308px
  W12H416: { w: 12, h: 4 }, // 416px
  W24H416: { w: 24, h: 4 }, // 416px
};

/** 网格列数（§D4）：CSS Grid 的 `repeat(24, 1fr)` */
export const GRID_COLUMNS = 24;

/**
 * 卡片行高（px）。**这是真正的常量之一**。
 *
 * 92 不是个整数好看的数字，是算出来的：它与 {@link GRID_GAP} 一起让**每一档的像素高度
 * 与改造前完全相同**（1 行 92、2 行 200、3 行 308、4 行 416），
 * 同时保证「两张一行高的卡竖着叠起来 = 一张两行高的卡」（`92 + 16 + 92 = 200`），
 * 这就是用户要的「高度可以拼接」。换个数字（比如字面的 90）就要连间距一起动，
 * 而间距一动，24 列的列宽会跟着变，**每一张卡的宽度都得重算**。
 *
 * 像素高度一律由 `dashboard.grid` 的 `cardHeight()` 算，**别在别处再抄一遍这个算式**。
 */
export const GRID_ROW_HEIGHT = 92;

/** 卡片间距（px）。另一个真正的常量 */
export const GRID_GAP = 16;

/** 自动刷新间隔的缺省值（秒），与后端 `DEFAULT_REFRESH_SECONDS` 一致 */
export const DEFAULT_REFRESH_SECONDS = 60;

/** 时间窗口。两种形态：相对（渲染时由**服务端**按它的「现在」解析）与绝对（编辑器里手选的区间） */
export type WindowConfig =
  | { kind: 'last'; hours: number }
  | { kind: 'range'; from: number; to: number };

/** 统计卡的配置（§5.3） */
export interface StatConfig {
  metric?: string;
  window?: WindowConfig;
}

/** 曲线图的配置（§5.4） */
export interface LineConfig {
  source?: 'alarmCount' | 'serviceField';
  window?: WindowConfig;
  bucket?: 'hour';
  /** `source: serviceField` 时的点位三元组 */
  serviceId?: string;
  functionIndex?: number;
  field?: string;
  maxPoints?: number;
  showFailureShadow?: boolean;
}

/** 数据分布的配置（§5.5） */
export interface DistributionConfig {
  dimension?: 'deviceType' | 'serviceType' | 'alarmType' | 'failureType';
  window?: WindowConfig;
  chart?: 'pie';
  /** 显示层截断（「前 N + 其他」）。后端**全量下发**，这个值只影响渲染 */
  limit?: number;
}

/**
 * 设备卡片的配置（§5.6）。
 *
 * `pid` 是**完整的 pid**（`<did>.<siid>.<piid>`，与设备影子的元素、写属性的请求同一个形状）：
 * `did` 那一段看着与 {@link did} 重复，但服务端两个都要 —— 归属校验看的是 `did`，
 * 取数看的是 `pid`。编辑器一次写两个，不给人拆开的机会。
 */
export interface DeviceConfig {
  did?: string;
  pid?: string;
  display?: 'value';
  showUnit?: boolean;
}

/** 服务卡片的配置（§5.7，P2 渲染） */
export interface ServiceConfig {
  serviceId?: string;
  functionIndex?: number;
  /** 要显示的字段名。**位名（`status.bit0`）也是合法字段名** —— 位是独立的点，各有各的历史 */
  fields?: string[];
  display?: 'value';
  showUnit?: boolean;
  // 这里原来还有一个 `showStale`（陈旧阈值）：卡片**不判陈旧**，改为一律显示采集时刻，
  // 那个键因此没有效果了。删掉它而不是留着，是因为留着的键会被下一个人当成还会生效的开关。
  // 旧布局里存着的那个键**不认识就忽略**（`config` 是异构对象，不需要迁移）
}

/**
 * 操作人（创建者 / 最后更新者）。
 *
 * `timestamp` 是**毫秒时间戳**而不是 `Date`：它直接来自线格式（后端 `PersonCodec` 输出
 * `getTime()`）。注意与 `typedef/define/user/UserOrganization` 里那个 `Person`（`timestamp: Date`）
 * 不是一份东西 —— 那个是组织成员接口的返回，这个是 `creator` / `updater` 的通用记号。
 */
export interface DashboardPerson {
  id?: string;
  name?: string;
  timestamp?: number;
}

/**
 * 一张卡片。五种类型共用一个壳，差异全在 {@link config} 里。
 *
 * **位置是两个坐标**：{@link x} / {@link y} 是左上角起点（网格单位）。占几列几行由
 * {@link size} 档位决定 —— **`w` / `h` 不上行**，服务端只收 `x` / `y`。
 *
 * `config` 的类型是 `Record<string, unknown>` 而不是 {@link StatConfig} 那样的联合类型：
 * 线格式里它本来就是一个异构对象，按 `type` 断言成某个具体类型是**编辑器**该做的事
 * （它知道用户在填哪种卡），而渲染/取数侧应当**防御性读取** —— 库里可能存着旧版本写的配置，
 * 一个断言换来的只是编译器闭嘴，运行时该崩还是崩。
 */
export class DashboardWidget {
  /** 卡片 ID：前端生成的短串，同一布局内唯一。**渲染结果按它对应卡片**（下标会随拖拽变化，id 不会） */
  id: string = '';
  type: WidgetType = 'stat';
  /**
   * 标题。**用户数据**：原样显示、**不翻译**。
   *
   * 取值顺序是 `title` → `titleKey` → 按 `type` 的默认名（见 {@link titleOf}）。
   */
  title?: string;
  /**
   * 预置标题的 i18n key：**页面文案**，要翻译。只有服务端下发的预置布局会填它
   * （见 §6.5：预置布局是服务端造的，把中文写进 `title` 会让英文界面显示中文，
   * 而按 AGENTS.md 的规则，服务端下发的 `title` 恰恰不许翻译）。
   */
  titleKey?: string;
  /** 尺寸档位。占几列几行按 {@link WIDGET_SIZES} 算；拖拽只改坐标、不改档位 */
  size: WidgetSize = 'W6H200';
  /**
   * 起始列（0 起，`0 .. GRID_COLUMNS − 1`）。
   *
   * **没有这个键 = 旧布局**（改造前存下来的是「顺序即位置」，卡片不带坐标）。
   * 这种情况由 `DashboardLayoutCodec.decode` 按数组顺序 `flowPlace` 补一遍 ——
   * 那条路径复刻的正是改造前浏览器的流式排布，所以旧布局打开后长相不变。
   * 两者**要么都有、要么都没有**：只给一个的文档按「都没有」处理（见 codec）。
   */
  x?: number;
  /** 起始行（0 起，上不封顶）。与 {@link x} 同生同灭 */
  y?: number;
  /** 自动刷新间隔（秒）；`0` = 不自动刷新。缺省按 {@link DEFAULT_REFRESH_SECONDS} */
  refresh?: number;
  config: Record<string, unknown> = {};
}

/** 一份布局（一个空间一份） */
export class DashboardLayout {
  /** 所属空间（**根空间**，即项目）。路径上给子空间时，服务端也归到同一个项目 */
  spaceId: string = '';
  /**
   * 乐观锁版本号。**保存时必须原样回传**读到的值：
   * 「从未保存过」时是 `0`（预置布局的版本号），保存成功后变 `1` 并逐次 +1。
   */
  version: number = 0;
  /**
   * 卡片列表。**数组顺序是阅读顺序**（窄屏一列时的上下次序），**不是位置** ——
   * 位置是每张卡自己的 {@link DashboardWidget.x} / {@link DashboardWidget.y}。
   *
   * 两者保持一致的办法是：**每次落定后按 `(y, x)` 重排一次这个数组**（见 `dashboard.grid`
   * 的 `placeAt` / `compact`，它们的输出都是排好序的）。所以数组顺序是**派生物**，
   * 但服务端保存时仍**原样保留**它，只校验坐标 —— 服务端不做排序，重排是前端的活。
   */
  widgets: DashboardWidget[] = [];
  /** 创建者（展示用）。**预置布局没有作者**，这两个键整个不出现 */
  creator?: DashboardPerson;
  /** 最后更新者（展示用） */
  updater?: DashboardPerson;
}

/**
 * 各类型的默认卡名（**词典键**，与标题的兜底共用一份）。
 *
 * 放在这里而不是各页面里：卡片外壳（没标题时的卡头）与看板页（添加卡片的类型选择对话框）
 * 都要用它，各留一份的话，加了新类型总有一处忘记补。
 */
export const DASHBOARD_WIDGET_TITLES: Record<WidgetType, string> = {
  stat: '统计数字',
  line: '曲线图',
  distribution: '数据分布',
  device: '设备',
  service: '服务',
};

/**
 * 这个版本**能新建**的卡片类型。
 *
 * 与 {@link WidgetType} 一一对应：四种类型都接上了数据源（`stat` / `distribution` /
 * `line(alarmCount)` 走统计、`service` 走服务的影子、`device` 走设备影子）。
 * 只剩 `line` 的 `serviceField` 那一支还是「暂不支持」—— 它是**同一种卡片里的另一个数据源**，
 * 不是一种新卡片，所以不在这里体现：编辑器里对它显式地给一个选项、并说明还没接。
 *
 * 这**不是** schema 的限制：库里存着别的类型也读得进来（`type` 认得它），
 * 编辑器遇到不认识的类型也不会崩（见 `widget.editor` 的 `@default`）。
 */
export const DASHBOARD_EDITABLE_TYPES: WidgetType[] = ['stat', 'line', 'distribution', 'device', 'service'];

/** 新建卡片时的尺寸档位。必须能被 {@link sizeAllowed} 放行，否则下拉里选不中当前值 */
export const DASHBOARD_DEFAULT_SIZE: Record<WidgetType, WidgetSize> = {
  stat: 'W6H92',
  line: 'W12H200',
  distribution: 'W12H200',
  device: 'W6H200',
  service: 'W12H200',
};

/**
 * 这个类型能不能用这一档。
 *
 * **统计卡只允许一行高的档位**：它是唯一「没有卡头、按内容自然高 ≈ 90px」的卡片，
 * 塞进 200px 的档位里下面会空 110px；反过来别的卡片一行都太矮（卡头就要占掉一行的一多半）。
 *
 * 界线写成「恰好一行」与「一行以上」而不是一份手抄的档位名单：加新档位时这里不用改，
 * 更不会出现「加了档位却忘了加到某个类型的名单里」那种静默的漏。
 */
export function sizeAllowed(type: WidgetType, size: WidgetSize): boolean {
  const rows = WIDGET_SIZES[size]?.h ?? 0;
  return type === 'stat' ? rows === 1 : rows > 1;
}

/**
 * 这个类型能选的宽度（列），从窄到宽 —— 编辑器第一个下拉的选项。
 * 由 {@link WIDGET_SIZES} 推出来，**不另立一张表**。
 */
export function widthChoices(type: WidgetType): number[] {
  const widths = (Object.keys(WIDGET_SIZES) as WidgetSize[])
    .filter((size) => sizeAllowed(type, size))
    .map((size) => WIDGET_SIZES[size].w);
  return [...new Set(widths)].sort((a, b) => a - b);
}

/**
 * 这个类型 + 这个宽度下能选的档位，**按高度从矮到高** —— 编辑器第二个下拉的选项。
 *
 * 高度选项因此是**跟着宽度联动**的：6 宽的卡片只有 200 这一档高度，12 宽有三档。
 * 不列「存在的全部组合再禁用掉几个」—— 那样用户得先撞墙才知道不行。
 */
export function sizeChoices(type: WidgetType, width: number): WidgetSize[] {
  return (Object.keys(WIDGET_SIZES) as WidgetSize[])
    .filter((size) => WIDGET_SIZES[size].w === width && sizeAllowed(type, size))
    .sort((a, b) => WIDGET_SIZES[a].h - WIDGET_SIZES[b].h);
}

/**
 * 分布卡的 `dimension` 表（§5.5）与它的显示名，与 {@link DASHBOARD_METRICS} 同一条口径
 * （显示名同时是词典键）。`设备类型` 是仓库里已有的词条，直接复用、不另造一个。
 */
export const DASHBOARD_DIMENSIONS: Record<string, string> = {
  deviceType: '设备类型',
  serviceType: '服务类型',
  alarmType: '告警类型',
  failureType: '故障类型',
};

/** dimension 的显示名。表里没有时**原样给出 id**（与 {@link dashboardMetricLabel} 同一条兜底） */
export function dashboardDimensionLabel(
  dimension: string | undefined,
  translate: (key: string) => string,
): string {
  const label = dimension ? DASHBOARD_DIMENSIONS[dimension] : undefined;
  return label ? translate(label) : (dimension ?? '');
}

/**
 * 卡片的显示标题，按 `title` → `titleKey` → 默认名 的顺序取。
 *
 * `titleKey` 只可能是我们自己写下的 i18n key（服务端预置布局），所以它进翻译是安全的；
 * 而 `title` 是用户敲进去的一句话（「东区温度」），原样返回、**绝不翻译**。
 *
 * `defaultKey` 是「按 type 的默认名」那个词条 key，由调用方给（它是页面文案，
 * 不同 type 各有一个词条），翻译同样由调用方做 —— 这个函数不认识 i18n。
 */
export function titleOf(widget: DashboardWidget, defaultKey: string): { text?: string; key?: string } {
  if (widget.title) {
    return { text: widget.title };
  }
  if (widget.titleKey) {
    return { key: widget.titleKey };
  }
  return { key: defaultKey };
}

/**
 * `stat` 卡片的 metric 表（§5.3）：显示名与单位都**同时是词典里的键**（本仓库的键即中文原文），
 * 页面再翻成当前语言 —— 与 `MODBUS_ALARM_LEVEL_LABELS` 同一条口径。
 *
 * 单位只有两个：`台` / `个`（英文词典里它们是 `devices` / `services`，即**名词**而不是量词，
 * 所以「9 devices」读得通）。告警与故障**不带单位**：中文里「今日告警 5」本来就省略量词，
 * 而 `次` / `种` 直译成英文（`5 times`）反而别扭。这是显示决策，不是缺漏。
 *
 * **这张表是自动取自 `value` 的兜底，不是唯一来源**：卡片标题默认用这里的 `label`，
 * 但用户改了标题就按用户的来（`title` 优先，见 {@link titleOf}）。
 */
export const DASHBOARD_METRICS: Record<string, { label: string; unit?: string }> = {
  'devices.total': { label: '设备总量', unit: '台' },
  'devices.online': { label: '在线', unit: '台' },
  'services.total': { label: '服务总量', unit: '个' },
  'alarms.today': { label: '今日告警' },
  'alarms.window': { label: '告警次数' },
  'failures.total': { label: '故障种类' },
};

/**
 * metric 的显示名。表里没有时**原样给出 metric id** —— 后端加了新指标时不至于空白，
 * 而且那个 id 正是编辑器里配的值，看得出是「这个指标我还不认识」
 * （与 `modbusFailureLabel` 同一条兜底）。
 *
 * 翻译函数由调用方传入：本文件是纯类型定义、不认识 i18n 服务。
 */
export function dashboardMetricLabel(
  metric: string | undefined,
  translate: (key: string) => string,
): string {
  const entry = metric ? DASHBOARD_METRICS[metric] : undefined;
  return entry ? translate(entry.label) : (metric ?? '');
}

/** metric 的单位（已翻好）。没有单位时给**空串**：卡片上是「9 台」还是「5」，由这里决定 */
export function dashboardMetricUnit(
  metric: string | undefined,
  translate: (key: string) => string,
): string {
  const unit = metric ? DASHBOARD_METRICS[metric]?.unit : undefined;
  return unit ? translate(unit) : '';
}
