import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { catchError, forkJoin, of } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzSpinModule } from 'ng-zorro-antd/spin';
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
  DashboardWidget,
  GRID_COLUMNS,
  GRID_GAP,
  WidgetType,
  titleOf,
} from '../../../typedef/define/dashboard/DashboardLayout';
import { DashboardWidgetData } from '../../../typedef/define/dashboard/DashboardWidgetData';
import { WidgetEditorComponent } from './editor/widget.editor';
import { WidgetPickerComponent } from './editor/widget.picker';
import { cardHeight, sizeOf } from './home.grid';
import { WidgetHostComponent } from './widget/host/widget.host';

/**
 * 自定义数据看板（`/main/home`）。
 *
 * 一屏分两处取，**并行**：
 * - `layout`：卡片有哪些、摆在哪（用户配置，可编辑、有乐观锁版本号）；
 * - `render`：这些卡片此刻的读数（瞬时值，算完就丢）。
 *
 * 两者都是空间成员可读，所以进页面就能看到东西 —— 服务端对「从未配置过」的空间给一份**预置布局**
 * （§6.5），空看板在正常路径上不出现。
 *
 * 四条口径：
 * - **顺序即位置**：版式就是 `widgets` 的数组顺序，一屏按 24 列 CSS Grid **流式**铺开
 *   （`home.component.html` 的 `.board`），窄屏折成一列交给一条媒体查询。服务端那份顺序一字未动
 *   —— 布局是**空间共享一份**的，一个人在手机上看到的顺序不该改掉所有人的排布。
 * - **还没取到就是空白，不是 0**：首屏那几百毫秒里画一个「0」，用户会当成真读数。
 * - **自动刷新按每张卡自己的 `refresh` 分组**，`0` 表示不刷新（§5.2）：把所有卡挂在同一个
 *   最快的节拍上，等于让整屏陪着最勤的那张卡一起请求。
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
  selector: 'main-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.less',
  imports: [
    DragDropModule,
    NzAlertModule,
    NzButtonModule,
    NzEmptyModule,
    NzModalModule,
    NzPopconfirmModule,
    NzSpinModule,
    TranslatePipe,
    WidgetEditorComponent,
    WidgetPickerComponent,
    WidgetHostComponent,
  ],
})
export class HomeComponent implements OnDestroy {
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

  /** 保存 / 恢复默认进行中（那三个按钮转圈用） */
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

  /**
   * 这一屏要摆的卡片：编辑态取草稿，否则取服务端那份。**两条路径都是同一个数组类型、同一份顺序**
   * ——「顺序即位置」，所以这里没有坐标要算。
   */
  readonly widgets = computed(() =>
    this.editing() ? this.draft() : (this.layout()?.widgets ?? []),
  );

  /**
   * 摆上屏的每一格（**扁平的一层**，不是按行分组的两层）。
   *
   * 扁平是拖拽的前提：CDK 的「让位」是把占位块在**兄弟节点之间**搬来搬去，跨行搬动要求所有
   * 卡片是同一个容器的直接子节点。原来的 `nz-row` / `nz-col` 两层嵌套因此换成了 24 列 CSS Grid
   * —— 一行的宽度、换行位置由浏览器按 `grid-column: span N` 自己算，效果与栅格相同。
   *
   * 每张卡与它这一刻的读数在这里配成一对（少一次按 id 查找的 O(n²)）。高度按档位给，
   * **编辑态与看数据时是同一个值**（见类说明）。
   *
   * `title` 只给拖拽时飘着的那张幽灵卡用（卡片身上那份标题由卡片自己画）。在这里翻好而不是
   * 在模板里调一个方法：切语言时它跟着重算，模板方法则要等一次变更检测。
   */
  readonly placements = computed(() => {
    const byId = new Map((this.data()?.widgets ?? []).map((item) => [item.id, item]));
    return this.widgets().map((widget) => {
      const size = sizeOf(widget);
      return {
        widget,
        item: byId.get(widget.id),
        title: this.widgetTitle(widget),
        /** 占几列，绑到 `grid-column: span N` */
        span: size.w,
        height: cardHeight(size.h),
      };
    });
  });

  /** 卡片的显示名：取值顺序与服务端那份一致（`title` → `titleKey` → 按类型的默认名） */
  private widgetTitle(widget: DashboardWidget): string {
    const fallback = DASHBOARD_WIDGET_TITLES[widget.type] ?? DASHBOARD_WIDGET_TITLES.stat;
    const label = titleOf(widget, fallback);
    return label.text ?? this.t(label.key ?? fallback);
  }

  /** 网格列数与间距（`GRID_COLUMNS` / `GRID_GAP` 都在 `DashboardLayout` 里，样式表不抄第二处） */
  readonly columns = GRID_COLUMNS;
  readonly gap = GRID_GAP;

  /** 每张卡自己的定时器（按 `refresh` 分组，见 {@link restartTimers}） */
  private timers: ReturnType<typeof setInterval>[] = [];

  constructor() {
    this.currentSpaceId = this.account.space().id;
    this.load();

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
    this.clearTimers();
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
    this.clearTimers();
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
        this.layout.set(layout);
        this.data.set(data);
        this.configs.set(configs);
        this.loading.set(false);
        this.restartTimers();
      },
      error: (e) => {
        this.layout.set(null);
        this.data.set(null);
        this.loading.set(false);
        this.error.set(e?.message ?? String(e));
      },
    });
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
   * 重新取一屏读数（布局不动）。
   *
   * 保存 / 恢复默认之后用它而不是 {@link load}：布局刚由服务端返回，再取一次是白跑一趟，
   * 还会让整屏闪一下加载态。**失败就置空**（卡片留白）而不是换成错误态 —— 布局已经存好了，
   * 因为读数没取到就把整屏变成一张告警，反而把刚保存成功这件事盖掉了；下一个刷新周期会补上。
   */
  private reloadData(): void {
    const spaceId = this.currentSpaceId;
    if (!spaceId) {
      return;
    }
    this.restartTimers();
    this.dashboard.render(spaceId).subscribe({
      next: (data) => this.data.set(data),
      error: () => this.data.set(null),
    });
  }

  /**
   * 按每张卡的 `refresh` 分组起定时器。
   *
   * 分组而不是「取所有卡里最小的那个间隔，到点全刷」：一个 10 秒的卡片不该让一屏 60 秒的卡片
   * 陪它每 10 秒请求一次。`refresh` 缺省按 {@link DEFAULT_REFRESH_SECONDS}，**`0` 表示不刷新**
   * （schema 里就是这个意思），负数是脏数据，同样当不刷新。
   *
   * 每次布局变化都**全部重起**：分组是按当前的卡片集合算的，留着旧定时器会让已经删掉的卡片
   * 继续在后台请求。
   *
   * **只看服务端那份布局，不看草稿**：按草稿起定时器会有一个很糟的后果 ——「退出编辑」不会
   * 重起定时器，于是它们会一直刷着那份已经被丢掉的草稿（连卡片 id 都可能对不上）。
   * 跟着存起来的那份走，退出编辑时手里这份读数本来就是对的那一份；编辑期间卡片照常显示，
   * 只是刷新周期按**存起来的那份**的 `refresh` 走 —— 这也是它唯一的代价，可以接受。
   */
  private restartTimers(): void {
    this.clearTimers();
    const groups = new Map<number, DashboardWidget[]>();
    for (const widget of this.layout()?.widgets ?? []) {
      const seconds = widget.refresh ?? DEFAULT_REFRESH_SECONDS;
      if (seconds <= 0) {
        continue;
      }
      const group = groups.get(seconds);
      if (group) {
        group.push(widget);
      } else {
        groups.set(seconds, [widget]);
      }
    }
    for (const [seconds, widgets] of groups) {
      this.timers.push(setInterval(() => this.refresh(widgets), seconds * 1000));
    }
  }

  private clearTimers(): void {
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
  }

  /**
   * 刷一组卡片。
   *
   * 传 `widgets` 就是让服务端按**这一组**渲染（`render` 的草稿用法）—— 传空表示渲染整份已存布局，
   * 那正是这里要避免的：分组刷新就是为了不必整屏重取。
   *
   * **失败不弹错、不清屏**：页面上那份读数仍然可用（只是旧了几十秒），下一个 tick 会再试。
   * 把整屏换成错误态，反而把「刚才还好好的」也一并弄没了。
   */
  private refresh(widgets: DashboardWidget[]): void {
    const spaceId = this.currentSpaceId;
    if (!spaceId) {
      return;
    }
    this.dashboard.render(spaceId, widgets).subscribe({
      next: (data) => this.merge(data),
      error: () => {},
    });
  }

  /** 把一次刷新回来的那张（那几张）卡的读数并进手里这份，**其余原样保留** */
  private merge(incoming: DashboardWidgetData): void {
    const current = this.data();
    if (!current) {
      this.data.set(incoming);
      return;
    }
    const byId = new Map(current.widgets.map((item) => [item.id, item]));
    for (const item of incoming.widgets) {
      byId.set(item.id, item);
    }
    const merged = new DashboardWidgetData();
    merged.spaceId = incoming.spaceId || current.spaceId;
    merged.from = incoming.from || current.from;
    merged.to = incoming.to || current.to;
    merged.widgets = [...byId.values()];
    this.data.set(merged);
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
   * 加一张卡：**落在末尾**，紧接着打开对话框填配置。
   *
   * 落末尾是顺序模型的自然结果：没有坐标可挑，要放哪儿拖一下。所以原来那个「扫第一个不重叠的
   * 空位」（`findSlot`）随坐标一起删掉了 —— 流式排布里本来就没有「空位」这回事。
   */
  private addWidget(type: WidgetType): void {
    const widget = new DashboardWidget();
    widget.id = newWidgetId(this.draft());
    widget.type = type;
    widget.size = DASHBOARD_DEFAULT_SIZE[type] ?? 'S';
    widget.refresh = DEFAULT_REFRESH_SECONDS;
    widget.config = defaultConfig(type);
    this.draft.set([...this.draft(), widget]);
    this.openEditor(widget, true);
  }

  /** 点某张卡：打开它的配置框（整张卡都可点，见模板上的 `.cell`） */
  editWidget(widget: DashboardWidget): void {
    this.openEditor(widget, false);
  }

  /**
   * 拖拽落定：把草稿里那两项的位置换过来。
   *
   * `previousIndex` / `currentIndex` 是**上屏顺序**（{@link placements}）里的下标，与草稿数组
   * 一一对应（`placements` 就是按草稿顺序 map 出来的），所以可以直接拿来换。
   *
   * 换的是顺序本身，**不重算任何位置** —— 版式就是顺序，浏览器按新的顺序重排。
   */
  dropWidget(event: CdkDragDrop<unknown>): void {
    if (!this.editing() || event.previousIndex === event.currentIndex) {
      return;
    }
    const next = [...this.draft()];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.draft.set(next);
  }

  /**
   * 对话框点「确认」：把改好的那张换回草稿。
   *
   * 换的只是这一张，**别处一张都不动**：顺序进线之后改了尺寸也只是它自己换个占格，与谁都不冲突。
   */
  commitEditor(widget: DashboardWidget): void {
    this.draft.set(this.draft().map((w) => (w.id === widget.id ? widget : w)));
    this.closeEditor();
  }

  /**
   * 对话框点「删除」：把这张卡从草稿里拿掉。
   *
   * **只动草稿**，所以不套确认气泡 —— 「退出编辑」天然就是撤销，而库里的那份要到「保存布局」
   * 才会被改。这也正是这个按钮能直接放在对话框 footer 里的原因。
   */
  removeFromEditor(): void {
    const id = this.editingWidget()?.id;
    if (id) {
      this.draft.set(this.draft().filter((w) => w.id !== id));
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
   * 存的就是草稿的**数组顺序**本身 —— 屏幕上那一刻看到的顺序，一个字节不重排、不重算。
   *
   * 成功时用**服务端返回的那份**替换手里的布局：版本号已经 +1，不换的话紧接着再存一次
   * 就会撞版本冲突。失败时**不动草稿** —— 用户改的那一屏还在，要不要放弃由他点「退出编辑」决定。
   */
  save(): void {
    const layout = this.layout();
    const spaceId = this.currentSpaceId;
    if (!layout || !spaceId) {
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
        this.layout.set(saved);
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
   * 恢复默认布局（服务端删掉文档，下次读回到预置布局）。
   *
   * **留在编辑态**：这是一次「换一份起点」而不是「改完了」，用户多半还要接着调；
   * 草稿一并换成预置布局，界面上立刻看得到。这个操作是破坏性的，故模板里套了确认气泡。
   */
  reset(): void {
    const spaceId = this.currentSpaceId;
    if (!spaceId) {
      return;
    }
    this.saving.set(true);
    this.dashboard.reset(spaceId).subscribe({
      next: (layout) => {
        this.saving.set(false);
        this.closeEditor();
        this.layout.set(layout);
        this.draft.set([...layout.widgets]);
        this.msg.success(this.t('操作成功'));
        this.reloadData();
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
