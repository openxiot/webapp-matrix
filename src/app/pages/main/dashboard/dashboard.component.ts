import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CdkDragMove, CdkDragStart, DragDropModule } from '@angular/cdk/drag-drop';
import { catchError, forkJoin, of } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzFloatButtonModule } from 'ng-zorro-antd/float-button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTooltipDirective } from 'ng-zorro-antd/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { AccountService } from '../../../service/account.service';
import { DashboardService } from '../../../service/dashboard.service';
import { MainI18nService } from '../../../service/i18n.service';
import { MatrixService } from '../../../service/matrix.service';
import { ModbusService } from '../../../service/modbus.service';
import { ModbusConfig } from '../../../typedef/define/modbus/Modbus';
import { SpaceEntity } from '../../../typedef/define/space/SpaceEntity';
import { OrganizationMember } from '../../../typedef/define/user/UserOrganization';
import { DashboardCatalog } from '../../../typedef/define/dashboard/DashboardCatalog';
import {
  DASHBOARD_DEFAULT_SIZE,
  DASHBOARD_WIDGET_TITLES,
  DEFAULT_REFRESH_SECONDS,
  DashboardLayout,
  REFRESH_INTERVALS,
  DashboardWidget,
  GRID_COLUMNS,
  GRID_GAP,
  GRID_ROW_HEIGHT,
  WidgetType,
  titleOf,
} from '../../../typedef/define/dashboard/DashboardLayout';
import { DashboardWidgetData } from '../../../typedef/define/dashboard/DashboardWidgetData';
import { WidgetEditorComponent } from './editor/widget.editor';
import { WidgetPickerComponent } from './editor/widget.picker';
import {
  Placement,
  cardHeight,
  cellDelta,
  compact,
  ensurePlacements,
  findSlot,
  fitsAt,
  placeAt,
  placementsOf,
  sameLayout,
  sizeOf,
} from './dashboard.grid';
import { WidgetHostComponent } from './widget/host/widget.host';

/**
 * 自定义数据看板（`/main/dashboard`）。
 *
 * 一屏分两处取，**并行**：
 * - `layout`：卡片有哪些、摆在哪（用户配置，可编辑、有乐观锁版本号）；
 * - `render`：这些卡片此刻的读数（瞬时值，算完就丢）。
 *
 * 两者都是空间成员可读，所以进页面就能看到东西 —— 服务端对「从未配置过」的空间给一份**预置布局**
 * （§6.5），空看板在正常路径上不出现。
 *
 * 四条口径：
 * - **位置是两个坐标**：屏幕是「宽 24 格、高无限」的网格，每张卡带 `x` / `y`（左上角起点），
 *   占几列几行由 `size` 档位决定（`dashboard.grid` 的 `sizeOf` / `cardHeight`）。
 *   `widgets` 的**数组顺序是阅读顺序**（窄屏折成一列时的上下次序），每次落定后按 `(y, x)`
 *   重排一次让两者一致 —— 但它不是位置的真值。旧布局没有坐标，{@link adopt} 进来时整份重铺一遍
 *   （`ensurePlacements`，复刻的正是改造前浏览器流式排开的样子，所以旧布局长相不变）。
 * - **还没取到就是空白，不是 0**：首屏那几百毫秒里画一个「0」，用户会当成真读数。
 * - **自动刷新是工具条上一个全局间隔**（`0` 表示不刷新，§5.2）：整屏挂在同一个节拍上，
 *   到点重取一次读数。它**不跟布局一起落库**，存在浏览器里、按项目分键 —— 它是看的人当下的
 *   偏好（盯大屏时想 30 秒刷一次，在自己电脑上未必），不是这份布局的一部分；存库还会让
 *   「切一下间隔」变成一次带乐观锁的写。改造前每张卡各带一个 `refresh`，那个字段已经删了。
 * - **编辑态是一份本地草稿，点「保存布局」才写库**（§7.4）。改十次不写十次，而且「退出编辑」
 *   天然就是撤销。
 *
 * 编辑态与看数据时**渲染同一张卡片、给同一个高度**（见 {@link placements}）：尺寸一致是构造上
 * 成立的，不是两套样式对齐出来的。原来编辑态画的是「磁贴」（卡名 + 配置摘要 + 四个按钮），
 * 它按格子高度画而统计卡按内容高，于是退出编辑时统计卡那一行会往上收一截 —— 那个方案连同
 * 磁贴一起删掉了。
 *
 * 取数照 `modbus.component` 的范式：先读一次当前项目，再用 `effect` 盯着 `account.space()`
 * 的变化重载（这一页没有路由参数，不需要订阅 `route.params`）。
 */
@Component({
  selector: 'main-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.less',
  imports: [
    DragDropModule,
    NzAlertModule,
    NzEmptyModule,
    NzFloatButtonModule,
    NzIconModule,
    NzModalModule,
    NzPopconfirmModule,
    NzSpinModule,
    NzTooltipDirective,
    TranslatePipe,
    WidgetEditorComponent,
    WidgetPickerComponent,
    WidgetHostComponent,
  ],
})
export class DashboardComponent implements OnDestroy {
  protected readonly account = inject(AccountService);

  private readonly dashboard = inject(DashboardService);
  private readonly modbus = inject(ModbusService);
  private readonly matrix = inject(MatrixService);
  private readonly msg = inject(NzMessageService);
  private readonly i18n = inject(MainI18nService);

  readonly loading = signal(false);
  /** 布局取失败的原因（权限、网络）；非空时整页只显示这条告警 */
  readonly error = signal('');

  /** 服务端的布局。**未取到是 null，不是一份空布局** —— 那会让页面显示「暂无卡片」 */
  readonly layout = signal<DashboardLayout | null>(null);

  /** 各卡的读数，按 `id` 索引（**不能按下标**：顺序会随保存变化） */
  private readonly data = signal<DashboardWidgetData | null>(null);

  /** 可见点表：只有服务类型分布用得到（把 `configId` 解成「厂家 型号」） */
  readonly configs = signal<ModbusConfig[]>([]);

  /**
   * 编辑器要的候选清单（设备 + 服务）。
   *
   * **进编辑态时取一次**，退出编辑即丢：它只服务于表单的下拉，而看数据时一张表单都不开。
   * 未取到是 `null`（不是一份空清单）—— 编辑器据此区分「还在取」与「本空间一个服务都没有」。
   */
  readonly catalog = signal<DashboardCatalog | null>(null);

  /** 候选清单取失败的原因（服务端那句话）。原样显示、不翻译 */
  readonly catalogError = signal('');

  // ===== 编辑态 =====

  /** 是否在编辑布局。为真时这一屏渲染的是 {@link draft} 而不是服务端那份 */
  readonly editing = signal(false);

  /** 编辑中的草稿。进编辑态时从 `layout` 拷一份；保存成功或退出编辑即丢弃 */
  private readonly draft = signal<DashboardWidget[]>([]);

  /** 正在编辑的那张卡（对话框开着时非 null）。**可能是刚新建、还没填配置的那张** */
  readonly editingWidget = signal<DashboardWidget | null>(null);

  /** 类型选择框开着（点「添加卡片」之后、选定类型之前） */
  readonly pickerOpen = signal(false);

  /**
   * 保存 / 恢复默认进行中。
   *
   * 它同时管两件事：`save()` 与 `reset()` 各自的 guard（一次请求没回来之前不再发第二次），
   * 以及编辑态那一列浮动按钮的「忙」态 —— `nz-float-button` 没有 `nzLoading`，
   * 转不了圈就整列压暗、不收点击（见模板与样式表）。
   */
  readonly saving = signal(false);

  /** {@link editingWidget} 是这次「添加卡片」刚加进来的 —— 取消编辑要把它撤掉 */
  private editorIsNew = false;

  /** 项目根空间（扁平，含 accesses）与成员（user 访问条目），用于算 {@link canEdit} */
  private readonly adminSpace = signal<SpaceEntity | null>(null);
  private readonly members = signal<OrganizationMember[]>([]);

  /**
   * 当前账号能否编辑这份看板（= 空间管理员，§6.2）。
   *
   * 照抄项目里已有的 `isAdmin` 惯用法（`project.component.ts:171` 等 6 处逐字相同）：
   * 1. 自己在空间成员（user 访问条目）里 `role === 'admin'`；
   * 2. 组织兜底：当前组织命中根空间 `accesses` 里 `type === 'organization'` 的条目，且自己是该组织管理员。
   *
   * 为假时**不渲染编辑入口**，也不发任何写请求 —— 服务端本来也会拒，但让用户点到一个必然失败的
   * 按钮不叫提示。
   */
  readonly canEdit = computed(() => {
    const me = this.account.user();
    if (!me?.id) return false;

    const selfEntry = this.members().find((m) => m.userId === me.id);
    if (selfEntry?.role === 'admin') return true;

    const org = this.account.organization();
    const orgEntry = this.adminSpace()?.accesses?.find(
      (a) => a.type === 'organization' && a.id === org.id,
    );
    if (orgEntry) {
      const meInOrg = org.members.find((m) => m.userId === me.id);
      return meInOrg !== undefined && meInOrg.role === 'admin';
    }
    return false;
  });

  /** 已加载的项目 id（与 `account.space()` 比对，变了才重载） */
  private currentSpaceId = '';

  /** 这一屏要摆的卡片：编辑态取草稿，否则取服务端那份。**两条路径的坐标都是齐的**（见 {@link adopt}） */
  readonly widgets = computed(() =>
    this.editing() ? this.draft() : (this.layout()?.widgets ?? []),
  );

  /**
   * 摆上屏的每一格（**扁平的一层**，不是按行分组的两层）。
   *
   * 扁平是拖拽的前提：所有卡片必须是同一个容器的直接子节点，跨行搬动才谈得上（原来的
   * `nz-row` / `nz-col` 两层嵌套因此换成了 24 列 CSS Grid）。
   *
   * **迭代的仍是 `widgets()` 的数组顺序**，位置走 `grid-column` / `grid-row` 绑定 —— 这一条是
   * 拖拽能用的前提，不能反：CDK 拖动时把那个 `.cell` 从 DOM 里换成了占位块（`replaceChild`），
   * 节点正被它持有；Angular 这时候一挪节点，卡片当场跳。所以拖动中变的**只有绑定值**。
   *
   * 拖动中每张卡的位置取自 {@link dragTarget} 那次 `placeAt` 的结果（别人已经让开），
   * 没有拖动时就是卡片自己的坐标。
   *
   * **落点越界时整屏一个字节都不动**：那一拖的结果是「弹回原位」，没有位置要预览，
   * 这时让别人让开再让回去只是白晃一下。
   *
   * 每张卡与它这一刻的读数在这里配成一对（少一次按 id 查找的 O(n²)）。高度按档位给，
   * **编辑态与看数据时是同一个值**（见类说明）。
   *
   * `title` 只给拖拽时飘着的那张幽灵卡用（卡片身上那份标题由卡片自己画）。在这里翻好而不是
   * 在模板里调一个方法：切语言时它跟着重算，模板方法则要等一次变更检测。
   */
  readonly placements = computed(() => {
    const widgets = this.widgets();
    // 坐标一定齐：布局进 {@link adopt} 时就补过一遍了（见那个方法）
    const base = placementsOf(widgets);
    const byId = new Map(base.map((item) => [item.id, item]));
    // 拖动中：整屏按「拖到那儿之后」的样子排。没拖动时一个字节都不重算
    const target = this.dragTarget();
    if (target && this.canDrop()) {
      for (const item of placeAt(base, target.id, target.x, target.y)) {
        byId.set(item.id, item);
      }
    }
    const dataById = new Map((this.data()?.widgets ?? []).map((item) => [item.id, item]));
    return widgets.map((widget, index) => {
      const item = byId.get(widget.id) ?? base[index];
      return {
        widget,
        item: dataById.get(widget.id),
        title: this.widgetTitle(widget),
        /** 起始列 / 起始行（0 起），绑到 `grid-column` / `grid-row`（CSS 里从 1 起，模板 +1） */
        x: item.x,
        y: item.y,
        /** 占几列几行 */
        w: item.w,
        h: item.h,
        height: cardHeight(item.h),
      };
    });
  });

  /** 卡片的显示名：取值顺序与服务端那份一致（`title` → `titleKey` → 按类型的默认名） */
  private widgetTitle(widget: DashboardWidget): string {
    const fallback = DASHBOARD_WIDGET_TITLES[widget.type] ?? DASHBOARD_WIDGET_TITLES.stat;
    const label = titleOf(widget, fallback);
    return label.text ?? this.t(label.key ?? fallback);
  }

  /**
   * 网格的三个尺寸（都在 `DashboardLayout` 里，**样式表不抄第二处** —— 全由模板绑上去）。
   *
   * `rowHeight` 是**行单位**：一行 92px，跨 `h` 行的格子正好 `h × 92 + (h − 1) × 16` 像素，
   * 与 `cardHeight(h)` 逐像素相同。两张一行高的卡竖着叠起来于是正好等于一张两行高的卡。
   */
  readonly columns = GRID_COLUMNS;
  readonly rowHeight = GRID_ROW_HEIGHT;
  readonly gap = GRID_GAP;

  // ===== 拖拽（二维摆放） =====

  /**
   * 这一拖要落到哪一格。非 null 时整屏按它重排（见 {@link placements}）并画出落点框。
   *
   * 只在**指针真的跨了一格之后**才有值：还没动就画一个框罩在这张卡自己身上，是噪音。
   *
   * `w` / `h` 一起记着，是为了让 {@link canDrop} 只看这一个信号就能判界 —— 被判的那张卡
   * 就是被拖的这张，它的占格在拖动中不会变（拖动不改尺寸）。
   */
  readonly dragTarget = signal<{ id: string; x: number; y: number; w: number; h: number } | null>(
    null,
  );

  /**
   * 这一拖的三种状态，**拖动中那两处反馈（幽灵卡的底色、落点框）共用它这一个判据**：
   *
   * - `idle`：还没跨过任何一格（刚抓手），什么都不提示；
   * - `ok`：落点放得下 —— 幽灵卡染成可落的底色、落点框画出来；
   * - `blocked`：放不下，幽灵卡染红，没有落点框（松手就弹回原位）。
   *
   * 「放不下」只有一种：越出 24 列，或拖到板子上方（{@link fitsAt}）。**压在别人身上算放得下** ——
   * 被压的那张会往下让，这正是让位存在的意义；要是压住了就算放不下，用户永远叠不出纵向的版式。
   */
  readonly dropState = computed<'blocked' | 'idle' | 'ok'>(() => {
    const target = this.dragTarget();
    if (!target) {
      return 'idle';
    }
    return fitsAt(target.x, target.y, target.w) ? 'ok' : 'blocked';
  });

  /** 这一拖收不收。整屏预览（{@link placements}）、落点框、松手落地都问它 */
  readonly canDrop = computed(() => this.dropState() === 'ok');

  /**
   * 这一拖开始时那张卡的位置与占格。拖动中一切都是「起点 + 位移」，不用去读正在变的信号。
   */
  private dragOrigin: { id: string; x: number; y: number; w: number; h: number } | null = null;

  /**
   * 一格宽 + 一道缝（像素）。**拖动开始时量一次**：拖动中容器宽度不会变，每像素量一次是白读
   * 一次布局。量不到（板子还没上屏）时留 0，{@link cellDelta} 对 0 是安全的（横向不位移）。
   */
  private colUnit = 0;

  /** 网格容器。只在拖动开始那一刻要它（量列宽），所以用信号查询而不是常驻一份引用 */
  private readonly boardRef = viewChild<ElementRef<HTMLElement>>('board');

  /**
   * 落点框：把 {@link dragTarget} 换算成绑上去的两条 CSS 网格线（CSS 从 1 起，故 +1）。
   *
   * 就是 {@link dragTarget} 自己那个格子（**不是**这张卡原来的位置 —— 这里曾经按
   * `placementsOf(widgets)` 取过，于是框永远画在卡片出发的地方、跟着指针一动不动）。
   * 越界时不画：那一拖的结果是弹回原位，没有可落的地方。
   */
  readonly dropOutline = computed(() => (this.canDrop() ? this.dragTarget() : null));

  /**
   * 自动刷新间隔（秒），**全屏一个**，`0` = 不自动刷新。
   *
   * 存在浏览器里（按项目分键，见 {@link readStoredInterval}），换项目时跟着换回来。
   */
  readonly refreshSeconds = signal(DEFAULT_REFRESH_SECONDS);

  /**
   * 「自动刷新」那颗里那六个档位的候选。`0` 显示成「关闭」，其余显示成 `30s` / `1m` / `5m` /
   * `15m` / `1h` ——全是纯数字与单位，**不翻译**（同尺寸下拉的裸档位名）。
   */
  readonly refreshOptions = computed(() =>
    REFRESH_INTERVALS.map((seconds) => ({
      value: seconds,
      label: seconds === 0 ? this.t('关闭') : intervalLabel(seconds),
    })),
  );

  /** 间隔选择框开着（那颗闹钟点出来的）。内容就地写在模板里，见那段注释 */
  readonly refreshOpen = signal(false);

  /**
   * 草稿与已存布局**有没有真差别**。两处在用它：「保存布局」那颗浮动按钮按它压不压暗，
   * 以及 `save()` 自己的 guard（那颗按钮没有 `nzDisabled`，真正的拦截在方法里）。
   *
   * 比较走 `sameLayout`（结构比较），不是引用：进编辑态时草稿是 `[...widgets]`，数组是新的
   * 而卡片对象还是旧的，引用一比会一进编辑态就说「改过了」。
   *
   * 非编辑态恒为假（草稿是空的，没有「改动」可言）—— 「退出编辑」那颗按钮的确认气泡也问它
   * （`[nzCondition]`，没动过就直接退，不必弹）。
   */
  readonly dirty = computed(
    () => this.editing() && !sameLayout(this.draft(), this.layout()?.widgets ?? []),
  );

  /** 全屏**唯一**那个自动刷新定时器（`refreshSeconds` 为 `0` 时是 `null`） */
  private timer: ReturnType<typeof setInterval> | null = null;

  /**
   * 整页是否处于全屏。
   *
   * 与 `home.3d.component` 里那套同一个道理：**状态只能从 `document.fullscreenElement` 读，
   * 不能自己维护一个布尔量**。用户按 Esc（或浏览器因为别的原因退出全屏）我们收不到任何回调
   * —— 只有 `fullscreenchange`。自己记的那个布尔量在这种时候就与浏览器说的不一致了，
   * 按钮会显示成「退出全屏」而实际已经不在全屏。
   *
   * 这里读的是**整页**（`documentElement`）而不是某个元素：这一屏要的是「看板铺满整块屏幕」，
   * 与 `home.3d` 那个只把 3D 场景放进全屏的用法不同 —— 所以判定的也是「有没有人全屏」，
   * 不比对是哪个元素。
   */
  readonly fullscreen = signal(false);

  constructor() {
    this.currentSpaceId = this.account.space().id;
    this.load();

    // 挂上监听顺便对一次现状：初值可能是 true（比如热重载后页面仍在全屏）
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    this.onFullscreenChange();

    // 项目信号后续变化（切换项目 / 清空）时自动刷新
    effect(() => {
      const spaceId = this.account.space().id;
      if (spaceId !== this.currentSpaceId) {
        this.currentSpaceId = spaceId;
        this.load();
      }
    });

    // 这里原来还有一个 effect：为编辑态那排磁贴的摘要取「设备显示名 + 产品规格」。
    // 磁贴删掉之后它没有消费者了 —— 卡片自己会在 effect 里取它要的那几样
    // （见 `device.widget.ts`），不必在这一层预取。
  }

  ngOnDestroy(): void {
    this.clearTimer();
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
  }

  /** 全屏状态跟着浏览器走（见 `fullscreen` 上面那段） */
  private readonly onFullscreenChange = (): void => {
    this.fullscreen.set(document.fullscreenElement !== null);
  };

  /**
   * 全屏 / 退出全屏。
   *
   * 进全屏的请求**可能被拒**（不是用户手势触发的、iframe 没给权限、浏览器策略），
   * 吞掉异常即可：状态由 `fullscreenchange` 说话，这里也不乐观置位 —— 报错没有别的补救动作。
   * 退出那条同理（理论上不会失败，但没必要为一个没人接的 rejection 操心）。
   */
  toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }

    void document.documentElement.requestFullscreen().catch(() => undefined);
  }

  /** 翻译一个词条。都在 `computed` 里用，故读一次 `currentLang` 建立依赖（同 `widget.host.ts`） */
  private readonly t = (key: string, params?: Record<string, unknown>): string => {
    this.i18n.currentLang();
    return this.i18n.translate.instant(key, params);
  };

  /* ----------------------------------------------------------------------------------------------
   * 取数
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 一次取回整屏：布局 + 读数 + 可见点表。
   *
   * 两处失败的后果不一样，故兜错也分开：布局或读数失败 = 整屏没有真数据可显示，走错误态；
   * 点表清单只用于把 `configId` 解成显示名，取不到就退回 id（与服务清单页同口径），
   * 不该拖垮整屏。
   *
   * 布局与读数是**两次请求**，中间若有人保存了一次，这一屏会是「新位置 + 旧读数」——
   * 下一次自动刷新就对齐了；为此改成串行（多一次往返）不划算。
   */
  load(): void {
    const spaceId = this.currentSpaceId;
    this.error.set('');
    this.configs.set([]);
    this.clearTimer();
    // 间隔是**按项目**记的，换项目要跟着换回来（没记过就是缺省的那档）
    this.refreshSeconds.set(spaceId ? readStoredInterval(spaceId) : DEFAULT_REFRESH_SECONDS);
    // 换项目 / 手动刷新都可能发生在编辑态里：那份草稿是上一个项目的，留着只会被存到新项目上
    this.exitEdit();

    if (!spaceId) {
      // 未选项目：模板走空态，别发一个注定 403 的请求
      this.layout.set(null);
      this.data.set(null);
      this.loading.set(false);
      return;
    }

    this.loadAdminContext(spaceId);
    this.loading.set(true);
    forkJoin({
      layout: this.dashboard.layout(spaceId),
      data: this.dashboard.render(spaceId),
      configs: this.modbus.listVisible().pipe(catchError(() => of<ModbusConfig[]>([]))),
    }).subscribe({
      next: ({ layout, data, configs }) => {
        this.layout.set(this.adopt(layout));
        this.data.set(data);
        this.configs.set(configs);
        this.loading.set(false);
        this.restartTimer();
      },
      error: (e) => {
        this.layout.set(null);
        this.data.set(null);
        this.loading.set(false);
        this.error.set(e?.message ?? String(e));
      },
    });
  }

  /**
   * 收下一份服务端布局：**先把坐标补齐**，再交给信号。
   *
   * 补的是**旧布局**（改造前存下来的那份没有坐标）。补法是 `ensurePlacements` 的整份贪婪铺 ——
   * 它复刻的正是改造前浏览器流式排开的那个样子，所以旧布局打开后长相不变（见 `dashboard.grid`
   * 的不变量 3）。改的是刚解出来的那个对象（它是这一趟的产物，没有别人持着），不必再拷一份。
   *
   * 两处入口都要过这里：`load` / `save` 回包。漏一处的后果是那份布局的
   * `widgets` 全没有坐标 —— 而 {@link placements} 是按坐标摆的，于是整屏卡片全叠在左上角。
   */
  private adopt(layout: DashboardLayout): DashboardLayout {
    layout.widgets = ensurePlacements(layout.widgets ?? []);
    return layout;
  }

  /** 项目根空间 + 成员，供 {@link canEdit} 判定；非管理员也要看板，失败静默即可 */
  private loadAdminContext(spaceId: string): void {
    forkJoin({
      space: this.matrix.getSpace(spaceId),
      members: this.matrix.listAccesses(spaceId),
    }).subscribe({
      next: ({ space, members }) => {
        this.adminSpace.set(space);
        this.members.set(members);
      },
      error: () => {},
    });
  }

  /**
   * 重取一屏读数。
   *
   * 自动刷新的定时器与保存成功后的收尾都走这里 —— 两条路的差别只在**失败怎么办**上，
   * 所以分成两个薄壳而不是各写一遍订阅（见 {@link refresh} 与 {@link reloadData}）。
   *
   * （工具条那个「刷新」不走这里：它要连**布局**一起重取 —— 别人可能刚改过，而重新加载是
   * 用户手里唯一的「把别人的改动取回来」的入口。见 {@link load}。）
   *
   * 布局不动，所以这是**一次**请求（`render` 不带草稿 = 渲染整份已存布局）。
   */
  private fetchData(onError: (e: unknown) => void): void {
    const spaceId = this.currentSpaceId;
    if (!spaceId) {
      return;
    }
    this.dashboard.render(spaceId).subscribe({
      next: (data) => this.data.set(data),
      error: onError,
    });
  }

  /**
   * 自动刷新与手动刷新走这条：**失败不弹错、不清屏**。
   *
   * 页面上那份读数仍然可用（只是旧了几十秒），下一个 tick 会再试。把整屏换成错误态，
   * 反而把「刚才还好好的」也一并弄没了。
   */
  private refresh(): void {
    this.fetchData(() => {});
  }

  /**
   * 保存成功之后走这条：**失败就置空**（卡片留白）而不是换成错误态。
   *
   * 布局已经存好了，因为读数没取到就把整屏变成一张告警，反而把「刚保存成功」这件事盖掉；
   * 置空至少是诚实的（卡片还在、位置还是新的，只是暂时没有数字），下一个刷新周期会补上。
   */
  private reloadData(): void {
    this.fetchData(() => this.data.set(null));
  }

  /**
   * 换自动刷新间隔：记进浏览器 + 立刻重起定时器（不必等下一个 tick 生效）。
   */
  setRefreshInterval(seconds: number): void {
    this.refreshSeconds.set(seconds);
    storeInterval(this.currentSpaceId, seconds);
    this.restartTimer();
  }

  /**
   * 在对话框里点了一个档位：设上，然后**把框关掉** —— 点一行就是选定这件事本身，
   * 没有「确定」这一步（同「添加卡片」那个选择框）。取消走 ESC / 右上角那个叉 / 点浮层外面，
   * 那几条都只是 `refreshOpen.set(false)`，不改任何状态 —— 所以「点了一行」与「点错了想撤」
   * 两条路不会串。
   */
  pickRefreshInterval(seconds: number): void {
    this.setRefreshInterval(seconds);
    this.refreshOpen.set(false);
  }

  /**
   * 起那个唯一的定时器。
   *
   * **全屏一个节拍**：改造前是每张卡各带一个 `refresh`、按值分组起多个定时器，为的是「10 秒
   * 的那张卡不该让整屏陪它每 10 秒请求一次」。那个优化换来的是一屏最多五个定时器、一屏布局
   * 一改就要全部重起，以及每张卡还得各自维护一个「多久没刷」的账 —— 而它省下的请求，在
   * `render` 本来就能一次取回整屏读数（且服务端对卡片是按需查的）之后就不成立了。
   *
   * `0`（关闭）与未选项目都不起。**换间隔、换项目、重进页面都要先清再起**，否则会留下一串
   * 各自计时、谁也停不掉的僵尸定时器。
   */
  private restartTimer(): void {
    this.clearTimer();
    const seconds = this.refreshSeconds();
    if (seconds <= 0 || !this.currentSpaceId) {
      return;
    }
    this.timer = setInterval(() => this.refresh(), seconds * 1000);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /* ----------------------------------------------------------------------------------------------
   * 编辑
   * ----------------------------------------------------------------------------------------------*/

  /** 进入编辑态：从服务端那份拷一份草稿。拷的是数组本身，卡片对象不必深拷（改一张卡走 {@link commitEditor}） */
  startEdit(): void {
    this.draft.set([...(this.layout()?.widgets ?? [])]);
    this.editing.set(true);
    // 候选清单跟着编辑态走：进编辑态取一次，之后打开多少个对话框都不再拉
    this.loadCatalog();
  }

  /**
   * 退出编辑态：草稿、候选清单、选择框一起丢掉。
   *
   * 三处出口共用（取消编辑、保存成功、重新加载）—— 各写一遍的结果是某一条路上漏掉一份状态，
   * 而那些状态在下一次进编辑态时会被当成新的。
   */
  private exitEdit(): void {
    this.closeEditor();
    this.pickerOpen.set(false);
    this.editing.set(false);
    this.draft.set([]);
    this.catalog.set(null);
    this.catalogError.set('');
  }

  /** 退出编辑：草稿整个丢掉。回到服务端那份（点这个按钮前会先确认，见模板） */
  cancelEdit(): void {
    this.exitEdit();
  }

  /**
   * 取候选清单（本项目的设备与服务）。
   *
   * **失败不弹错**：清单只服务于表单的下拉，取不到时编辑器里显示服务端那句话就够了；
   * 把整屏换成告警会把「布局与读数都好好的」这件事盖掉。先把手里那份置空，
   * 免得第二次进编辑态时短暂地显示上一个项目（或上一份）的服务。
   */
  private loadCatalog(): void {
    const spaceId = this.currentSpaceId;
    this.catalog.set(null);
    this.catalogError.set('');
    if (!spaceId) {
      return;
    }
    this.dashboard.catalog(spaceId).subscribe({
      next: (catalog) => this.catalog.set(catalog),
      error: (e) => this.catalogError.set(e?.message ?? String(e)),
    });
  }

  /** 打开类型选择框（工具条那个「添加卡片」） */
  openPicker(): void {
    this.pickerOpen.set(true);
  }

  closePicker(): void {
    this.pickerOpen.set(false);
  }

  /**
   * 选定类型：关选择框，紧接着开配置框。
   *
   * 两个对话框在同一拍里一关一开，动画会叠一下 —— 这是有意的：多一次点击（先关掉、再自己去
   * 找那张刚出现的卡点一下）才是真的绕。
   */
  pickWidget(type: WidgetType): void {
    this.pickerOpen.set(false);
    this.addWidget(type);
  }

  /**
   * 加一张卡：**落在第一个放得下的空位**，紧接着打开对话框填配置。
   *
   * 扫空位而不是接在末尾：用户腾出来的洞不该只有手动拖才用得回去（`findSlot` 从顶上往下、
   * 每行从左往右）。落定之后它会以 `findSlot` 给的那一格进 `compact` —— 其实不必：
   * `findSlot` 本来就是按阅读顺序找到的第一个洞，再吸一遍是恒等的。
   *
   * **草稿里坐标一定是齐的**，这也是 {@link placements} 敢直接 `placementsOf` 的前提。
   */
  private addWidget(type: WidgetType): void {
    const widget = new DashboardWidget();
    widget.id = newWidgetId(this.draft());
    widget.type = type;
    widget.size = DASHBOARD_DEFAULT_SIZE[type] ?? 'S';
    widget.config = defaultConfig(type);
    const size = sizeOf(widget);
    const spot = findSlot(placementsOf(this.draft()), size.w, size.h);
    widget.x = spot.x;
    widget.y = spot.y;
    this.draft.set([...this.draft(), widget]);
    this.openEditor(widget, true);
  }

  /** 点某张卡：打开它的配置框（整张卡都可点，见模板上的 `.cell`） */
  editWidget(widget: DashboardWidget): void {
    this.openEditor(widget, false);
  }

  /* ----------------------------------------------------------------------------------------------
   * 拖拽：二维摆放
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 抓起一张卡：记下起点、量一次列宽。
   *
   * **不设置 {@link dragTarget}** —— 这时落点就是它自己待着的地方，画个框罩在自己身上只是噪音。
   * 等指针真的跨了一格（{@link dragMoved}）再画。
   *
   * 卡片身上没有坐标（理论上到不了：进 {@link adopt} 就补过）时整个拖拽不启动：安静地什么都不做
   * 比按 `0, 0` 算出一堆乱七八糟的位移强。
   */
  dragStarted(event: CdkDragStart<DashboardWidget>): void {
    const widget = event.source.data;
    if (!widget || widget.x === undefined || widget.y === undefined) {
      this.dragOrigin = null;
      return;
    }
    const size = sizeOf(widget);
    this.dragOrigin = { id: widget.id, x: widget.x, y: widget.y, w: size.w, h: size.h };

    // 一格宽 + 一道缝：24 列的网格里，相邻两格的**起点**间距就是这么多。下面那个 `+ gap`
    // 是把最后一道缝补进来 —— `clientWidth` 是 24 格加 23 道缝，除以 24 才是每格的步长
    const board = this.boardRef()?.nativeElement;
    this.colUnit = board ? (board.clientWidth + GRID_GAP) / GRID_COLUMNS : 0;
  }

  /**
   * 拖动中：把「从起点走了多少像素」换算成目标格子。
   *
   * `cdkDragMoved` **每移动一像素就发一次**，所以目标格子没变就直接返回，不白算一遍整屏让位。
   *
   * **不夹边界**：卡片跟着指针走到哪就是哪，顶出右边界或上方照实记下来 —— 那个越界的落点正是
   * 「放不下」的判据（{@link canDrop}），夹回界内就永远看不出放不下，用户会以为松手能落在那儿。
   * 真的越界了，松手时 {@link dragEnded} 不收这一拖，卡片弹回原处。
   */
  dragMoved(event: CdkDragMove<DashboardWidget>): void {
    const origin = this.dragOrigin;
    if (!origin) {
      return;
    }
    const { dc, dr } = cellDelta(event.distance.x, event.distance.y, this.colUnit);
    const x = origin.x + dc;
    const y = origin.y + dr;

    const current = this.dragTarget();
    if (current && current.x === x && current.y === y) {
      return;
    }
    this.dragTarget.set({ id: origin.id, x, y, w: origin.w, h: origin.h });
  }

  /**
   * 松手：把落在的那一格写进草稿。
   *
   * 写的是 {@link dragTarget} 里那个位置 —— **拖到哪就落在哪**，不被上吸挪走。否则「纵向占领
   * 空间」这件事根本做不到（往下拖白拖），而且拖动中那个落点框会骗人：瞄着一个位置松手却落到别处。
   * 让位的代价由别人付：被压到的**往下让**（`placeAt` 里那一步），让完就停、不再上吸。
   *
   * **越界的一拖整个丢掉**（{@link canDrop} 为假）：草稿不动，CDK 自己把那张幽灵卡弹回原位。
   * 这里也就不用去 `placeAt` 一次再丢掉 —— 那一次会让别的卡先让开再回去，白晃一下。
   *
   * 指针没跨过任何一格（一次点击）时 `dragTarget` 是空的，这里什么都不做 —— 那一下是
   * 「打开这张卡的配置框」，由 `.cell` 上的 `(click)` 管。
   */
  dragEnded(): void {
    const target = this.dragTarget();
    const canDrop = this.canDrop();
    this.dragOrigin = null;
    this.dragTarget.set(null);
    if (!target || !canDrop) {
      return;
    }
    this.applyPlacements(placeAt(placementsOf(this.draft()), target.id, target.x, target.y));
  }

  /**
   * 把一份坐标表写回草稿：坐标落到卡片上，数组**按 `(y, x)` 重排**（那是「阅读顺序」，
   * 窄屏折成一列时按它排）。
   *
   * 传进来的表必须已经是排好序的 —— `placeAt` / `compact` 的输出都是（见 `dashboard.grid`
   * 的不变量 1），所以直接照它的顺序 map 就行。
   */
  private applyPlacements(items: Placement[]): void {
    const byId = new Map(this.draft().map((widget) => [widget.id, widget]));
    const next: DashboardWidget[] = [];
    for (const item of items) {
      const widget = byId.get(item.id);
      if (widget) {
        next.push({ ...widget, x: item.x, y: item.y });
      }
    }
    this.draft.set(next);
  }

  /**
   * 对话框点「确认」：把改好的那张换回草稿，**并重算一遍位置**。
   *
   * 重算是因为尺寸可能变了：`W6H200`（6×2）改成 `W24H416`（24×4）之后它多半压到了旁边的卡，
   * 光把尺寸换上去
   * 就是两张卡叠在一起。`placeAt` 把它钉在原处、被压的往下让。尺寸**变小**时让出来的空就这么
   * 留着（不上吸，与拖拽同口径）—— 用户自己把卡改小，剩下的地方该由他决定放什么。
   * 所以改尺寸、改配置都走这一条路，不必分情况。
   */
  commitEditor(widget: DashboardWidget): void {
    this.draft.set(this.draft().map((w) => (w.id === widget.id ? widget : w)));
    this.closeEditor();
    // 尺寸变小 / 没变时这一步是恒等的（`placeAt` 幂等），不必先判断有没有变
    this.applyPlacements(
      placeAt(placementsOf(this.draft()), widget.id, widget.x ?? 0, widget.y ?? 0),
    );
  }

  /**
   * 对话框点「删除」：把这张卡从草稿里拿掉，**并把它让出来的空收掉**（`compact` 只上吸）。
   *
   * 不收的话删掉一张卡会在版式里留一个洞，而那个洞只能靠手动拖别的东西过去补。
   *
   * **这是全屏唯一还会整屏上吸的地方**：拖拽与改档位都不吸了（位置是用户摆的，不能自己跑），
   * 只有「这张卡没了」的时候那个洞不是任何人摆出来的，收掉才说得过去。
   *
   * **只动草稿**，所以不套确认气泡 —— 「退出编辑」天然就是撤销，而库里的那份要到「保存布局」
   * 才会被改。这也正是这个按钮能直接放在对话框 footer 里的原因。
   */
  removeFromEditor(): void {
    const id = this.editingWidget()?.id;
    if (id) {
      this.draft.set(this.draft().filter((w) => w.id !== id));
      this.applyPlacements(compact(placementsOf(this.draft())));
    }
    this.closeEditor();
  }

  /**
   * 对话框点「取消」。
   *
   * 对**刚加进来的**那张，取消的意思是「我不想加这张卡了」，所以要把它撤掉 —— 否则
   * 「点了一下曲线图、又按了取消」会凭空多出一张卡片。改配置的那种取消则什么都不用做：
   * 编辑器改的是它自己那份副本，草稿里那张从头到尾没被动过。
   */
  cancelEditor(): void {
    if (this.editorIsNew) {
      const id = this.editingWidget()?.id;
      if (id) {
        this.draft.set(this.draft().filter((w) => w.id !== id));
      }
    }
    this.closeEditor();
  }

  private openEditor(widget: DashboardWidget, isNew: boolean): void {
    this.editorIsNew = isNew;
    this.editingWidget.set(widget);
  }

  private closeEditor(): void {
    this.editorIsNew = false;
    this.editingWidget.set(null);
  }

  /* ----------------------------------------------------------------------------------------------
   * 保存 / 恢复默认
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 保存布局（整体替换，带乐观锁版本号）。
   *
   * 存的是草稿**原样** —— 屏幕上那一刻看到的坐标与顺序，一个字节不重排、不重算
   * （重排只在拖拽落定、改尺寸、删卡片那三处发生，见 `applyPlacements`）。
   *
   * 成功时用**服务端返回的那份**替换手里的布局：版本号已经 +1，不换的话紧接着再存一次
   * 就会撞版本冲突。失败时**不动草稿** —— 用户改的那一屏还在，要不要放弃由他点「退出编辑」决定。
   *
   * 前两句 guard 是**按钮那边给不了**的：改造前「保存布局」是个 `[disabled]="!dirty()"` 的普通
   * 按钮，现在它是浮动按钮，而 `nz-float-button` 没有 `nzDisabled` 这个输入。所以「没改过」
   * 与「正在存」这两件事由这里挡住，界面上只把那颗按钮压暗（见模板与样式表）。
   * 挡住的正是它们该挡的：前者会让一次白跑保存把乐观锁版本号推上去，后者是连点两下必然撞版本冲突。
   */
  save(): void {
    const layout = this.layout();
    const spaceId = this.currentSpaceId;
    if (!layout || !spaceId || !this.dirty() || this.saving()) {
      return;
    }
    const next = new DashboardLayout();
    next.spaceId = layout.spaceId || spaceId;
    next.version = layout.version;
    next.widgets = [...this.draft()];

    this.saving.set(true);
    this.dashboard.save(spaceId, next).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.exitEdit();
        this.layout.set(this.adopt(saved));
        this.msg.success(this.t('保存成功'));
        this.reloadData();
      },
      error: (e) => {
        this.saving.set(false);
        this.msg.warning(e?.message ?? String(e));
      },
    });
  }

  /**
   * 恢复默认：把**预置布局装进草稿**，库里的那份原封不动。
   *
   * 与其它编辑动作同口径 —— 它只改草稿，用户还得点「保存布局」才生效；在那之前「退出编辑」
   * 就等于什么都没发生过。所以模板里那个确认气泡也去掉了：一个能撤销的动作不必先过一道确认
   * （改造前它是个 DELETE，一点库里的布局当场就没了，那个确认是必须的）。
   *
   * **留在编辑态**：这是一次「换一份起点」而不是「改完了」，用户多半还要接着调，草稿一换界面上
   * 立刻看得到。
   *
   * 预置布局**不带坐标**（服务端给不了，见 §6.5），铺一遍才有得摆 —— 与 {@link adopt} 同一个
   * 理由，只是这里不换 `layout`，所以不用它。
   *
   * `saving()` 那句 guard：它同时管着 `saving` 这个信号（按钮转圈、整列压暗），
   * 一次请求没回来之前不该再发一次。
   */
  reset(): void {
    const spaceId = this.currentSpaceId;
    if (!spaceId || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.dashboard.preset(spaceId).subscribe({
      next: (layout) => {
        this.saving.set(false);
        this.closeEditor();
        this.draft.set(ensurePlacements(layout.widgets ?? []));
      },
      error: (e) => {
        this.saving.set(false);
        this.msg.warning(e?.message ?? String(e));
      },
    });
  }

}

/** 新卡片的默认配置：能给出的最普通的那一种，剩下的让用户在对话框里改 */
function defaultConfig(type: WidgetType): Record<string, unknown> {
  switch (type) {
    case 'stat':
      return { metric: 'devices.total' };
    case 'line':
      // 窗口**必须给**：`validateLine` 两个数据源都要求 `config.window`，缺了存不进去。
      // 24 小时与编辑器里那个缺省跨度是同一个数（`DEFAULT_WINDOW_HOURS`）
      return { source: 'alarmCount', bucket: 'hour', window: { kind: 'last', hours: 24 } };
    case 'distribution':
      return { dimension: 'deviceType' };
    default:
      // 服务卡：没有「最普通的那一个服务」可言（服务清单是本项目的用户数据），
      // 留给用户在对话框里选 —— 必填项没填齐时那里也点不了「确认」
      return {};
  }
}

/**
 * 自动刷新间隔在浏览器里的键前缀，**按项目分键**（`dashboard.refreshSeconds.<spaceId>`）。
 *
 * 分键而不是全站一个：两个项目各看各的，切过去就是各自上次选的那档。存浏览器而不是跟布局一起
 * 落库的理由见类说明。
 */
const REFRESH_STORAGE_PREFIX = 'dashboard.refreshSeconds.';

/**
 * 读这个项目上次选的间隔。
 *
 * **认不出来就是缺省值**：没选过、被手改过、存的是已经下线的档位 —— 一条都不值得报错，
 * 回到 `1m` 就是了。所以这里校验「是不是候选里的那一档」，而不是信 `Number()` 的结果。
 */
function readStoredInterval(spaceId: string): number {
  const raw = Number(localStorage.getItem(REFRESH_STORAGE_PREFIX + spaceId));
  return REFRESH_INTERVALS.includes(raw) ? raw : DEFAULT_REFRESH_SECONDS;
}

function storeInterval(spaceId: string, seconds: number): void {
  if (!spaceId) {
    return;
  }
  localStorage.setItem(REFRESH_STORAGE_PREFIX + spaceId, String(seconds));
}

/**
 * 间隔的显示文案：`30s` / `1m` / `1h`。
 *
 * 纯数字 + 单位，**不翻译** —— 与尺寸下拉的裸档位名同一个口径（`W6H308` 也没进那 66 份词典）。
 * 只有 `0` 那个特殊值走词典里的「关闭」。
 */
function intervalLabel(seconds: number): string {
  if (seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }
  return seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
}

/**
 * 生成一个布局内唯一的卡片 id。
 *
 * 随机串而不是时间戳：同一个毫秒里连点两次「添加卡片」是完全可能的（对话框一关就能再点），
 * 而重复的 id 会让两张卡的读数互相覆盖（`render` 的结果按 id 对应卡片）—— 是那种要盯很久
 * 才看得出来的错。撞了就重摇，代价可以忽略。
 */
function newWidgetId(existing: DashboardWidget[]): string {
  const taken = new Set(existing.map((widget) => widget.id));
  let id = '';
  do {
    id = `w_${Math.random().toString(36).slice(2, 10)}`;
  } while (taken.has(id));
  return id;
}
