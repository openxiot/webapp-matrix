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
 * 尺寸档位。名字里那个数字是**占几行**：`S1` 是「S 的一行版」，`S` 是它的两行版。
 *
 * `M` 与 `L` 同宽、只有高度不同（「宽图」与「高图」是两种需求），`XL` 才整宽。
 * `S1` / `M1` 是**统计卡专用**的矮档位（只有它们高度是一行 92px），因为统计卡是唯一
 * 「没有卡头、按内容自然高 ≈ 90px」的卡片 —— 见 {@link DASHBOARD_SIZE_CHOICES}。
 */
export type WidgetSize = 'S1' | 'M1' | 'S' | 'M' | 'L' | 'XL';

/**
 * 尺寸档位 → 占几列几行（24 列网格）。
 *
 * **这张表只在前端**：服务端只认档位名（认不认识这个名字），排版知识全在这里 ——
 * 加档位时改这一处，后端 `WidgetSize` 跟着加一个枚举常量即可，不必同步数值。
 * 服务端也**不存 `w` / `h`**：那是从档位推出来的，存一份就是第二份会过期的真值。
 *
 * `h` 是**行数**，一行 {@link GRID_ROW_HEIGHT} 像素，所以像素高度 = `h × 92 + (h − 1) × 16`。
 * 一行 92 这个数是挑出来的（理由见 {@link GRID_ROW_HEIGHT}）：它让每一档的像素高度与
 * 改造前**一像素不差**，同时让「两张一行高的卡竖着叠起来」正好等于「一张两行高的卡」。
 */
export const WIDGET_SIZES: Record<WidgetSize, { w: number; h: number }> = {
  S1: { w: 6, h: 1 }, // 92px，统计专用
  M1: { w: 12, h: 1 }, // 92px，统计专用
  S: { w: 6, h: 2 }, // 200px
  M: { w: 12, h: 2 }, // 200px
  L: { w: 12, h: 4 }, // 416px
  XL: { w: 24, h: 4 }, // 416px
};

/** 网格列数（§D4）：CSS Grid 的 `repeat(24, 1fr)` */
export const GRID_COLUMNS = 24;

/**
 * 卡片行高（px）。**这是真正的常量之一**。
 *
 * 92 不是个整数好看的数字，是算出来的：它与 {@link GRID_GAP} 一起让**每一档的像素高度
 * 与改造前完全相同**（1 行 92、2 行 200、4 行 416 —— 即原来的 S/M 与 L/XL），
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
  size: WidgetSize = 'S';
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

/** 新建卡片时的尺寸档位。必须落在 {@link DASHBOARD_SIZE_CHOICES} 里，否则下拉显示不出当前值 */
export const DASHBOARD_DEFAULT_SIZE: Record<WidgetType, WidgetSize> = {
  stat: 'S1',
  line: 'M',
  distribution: 'M',
  device: 'S',
  service: 'M',
};

/**
 * 各类型**能选**的尺寸档位（编辑器那个下拉的选项表）。
 *
 * 统计卡只给两个矮档位：它是唯一「没有卡头、按内容自然高」的卡片，实测约 90px ——
 * 塞进 200px 的档位里下面会空 110px。两个矮档位（6 格 / 12 格，都是一行 92px）
 * 正好是它需要的全部自由度。
 *
 * **存量统计卡（库里存着 `S` / `M` / `L` / `XL` 的）不受这张表约束**：渲染侧一律按存的档位渲染，
 * 不悄悄改用户的布局；只有打开编辑器时下拉里没有当前值，用户一保存就落成合法档位。
 * 静默改尺寸比留一个旧档位更坏 —— 用户没动过的卡片自己变了大小，是查不出原因的。
 */
export const DASHBOARD_SIZE_CHOICES: Record<WidgetType, WidgetSize[]> = {
  stat: ['S1', 'M1'],
  line: ['S', 'M', 'L', 'XL'],
  distribution: ['S', 'M', 'L', 'XL'],
  device: ['S', 'M', 'L', 'XL'],
  service: ['S', 'M', 'L', 'XL'],
};

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
