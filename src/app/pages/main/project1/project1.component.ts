import {
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CdkDragMove, CdkDragStart, DragDropModule } from '@angular/cdk/drag-drop';
import { TranslatePipe } from '@ngx-translate/core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzAvatarComponent } from 'ng-zorro-antd/avatar';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzFloatButtonModule } from 'ng-zorro-antd/float-button';
import { NzIconDirective } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { DeviceEntity } from '../../../typedef/define/device/DeviceEntity';
import { AccountService } from '../../../service/account.service';
import { BreadcrumbTranslateDirective } from '../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { ProjectComponent } from '../project/project.component';
import { GraphNode, buildGraph, findNode } from './project1.graph';
import {
  Bounds,
  Offset,
  Offsets,
  PanelSpot,
  Point,
  TreeLayout,
  UNBOUNDED,
  PANEL_EST_H,
  boxOf,
  canvasWithPanel,
  clampToVisible,
  decodeOffsets,
  encodeOffsets,
  layoutTree,
  panelSpot,
  sameOffsets,
  shiftPanel,
} from './project1.layout';

/*
 * 项目树（`/main/project1`）。
 *
 * 与 `/main/project` 的关系：**同一份数据、同一种层级口径，换一种画法**。
 *
 * 表格那一版把树展平成一维的行，靠缩进 + 展开图标表达层级 —— 「谁在谁下面」要顺着缩进数，
 * 一不小心就看串行。这一版把层级画成**真正的树**：每个节点是一张卡片，父卡片右边拉出
 * N 条曲线，分别指向 N 个子节点。5 个子节点就是 5 条线，一眼数得出来。
 *
 * 树是**横着长**的（根在左、层级往右推）：同层节点竖着排，于是画布宽度只随**层数**涨，
 * 而不随「最宽的那层挂了几个节点」涨。
 *
 * **卡片本身仍然是只读的**：卡面上只有「这是什么、归谁管」（图标 / 名字 / 类型标签 / 数量），
 * 没有时间、也没有动作链接 —— 那几样东西要占掉三行，而卡片是 200×92 的定高盒，摆不下。
 *
 * 放不下的那些（创建 / 更新时间、空间代码、设备 did 与最后在线……）连同**动作按钮**，都挪进
 * 旁边那张**信息框**：点一下卡片弹出来，点空白 / 关闭按钮 / Esc 收起来。它不是模态框 ——
 * 一页树上「看一眼再点下一个」是常态，每看一张就挡住整页说不过去。
 *
 * 动作按钮与表格那一版**同一份实现**（父类那几个 `addDevice` / `removeSpace` / `removeDevice`
 * / `removeService` / `addChildSpace`），确认文案、删完重新取数、以及「按 isAdmin 显隐」
 * 全都照旧，不在这儿重写一遍。这一版的存在理由仍然是「一眼看清关系」，
 * 信息框只是把表格里分散在几列的信息收在卡片旁边。
 *
 * ── 卡片可以拖 ───────────────────────────────────────────────────────────────
 *
 * 位置**不进后端**：不进 `SpaceEntity` / `DeviceEntity` / 服务实体，也**不复用 `ModelAnchor`**
 * （那是 3D 模型的局部坐标，把 2D 画布坐标塞进去语义就脏了）。摆出来的位置只存**本机浏览器**
 * （`localStorage`，按项目分键），与看板那个自动刷新间隔同一个口径。
 *
 * 拖动与「一眼看清关系」是有冲突的：能自由摆，就意味着位置不再由层级推导。解法是把两者
 * **叠起来**而不是二选一 —— 层级仍然算出一份**自动布局**（就是上面那个横着长的形状，
 * 一进页面看到的就是它），用户摆出来的只是一个**偏移**。于是：
 *
 *   - 没摆过 → 偏移表是空的 → 看到的就是自动布局，与「不能拖」的那一版逐像素相同；
 *   - 摆过 → 自动布局 + 偏移，层级关系（谁连着谁）**仍然由曲线如实画出**，只是形状随人；
 *   - 「恢复默认」= 清空偏移表 → 回到自动布局。没有第二条代码路径。
 *
 * 「偏移按**祖先累加**」这一条同时给出两种行为：拖父卡片整支跟着走、拖子卡片只有它那一支动。
 * 推导与不变量都在 `project1.layout.ts` 的文件头。
 *
 * **要进「编辑布局」才能拖**（与看板同一套交互）：看的时候卡片是死的，免得读图时手一滑
 * 把布局碰乱。右下角悬浮按钮，退出编辑改过了会问一句。
 *
 * 所以本组件**继承 `ProjectComponent`**，复用它的取数与那几个格式化小工具：
 *
 *   - 继承来的：空间图取数（`loadSpaceGraph`）、设备显示名的三级兜底（见 `deviceName`）、
 *     空间图标与类型标签（`iconOf` / `typeLabel`）、节点上的几个计数、以及**全部写动作**
 *     与它们的 `isAdmin` 判定（`loadAdminContext`）。
 *   - 自己加的：`graph`（把三份扁平列表拼成一棵树，见 `project1.graph.ts`）、
 *     `layout`（坐标，见 `project1.layout.ts`）、收起状态、以及拖动与编辑态。
 *
 * 这么接的**好处是取数与取名口径只有一份实现**，不存在「表格那边改了、树这边忘了跟」这种漂移。
 * 代价是父类里那个表格专用的 `rows` computed、以及几个写动作也被继承了 ——
 * 这一页一个都不读（`computed` 是惰性的，不读就不算）。
 */

/** 摆出来的位置存哪。按项目分键，与看板的 `dashboard.refreshSeconds.<spaceId>` 同一个套路 */
const POSITION_STORAGE_PREFIX = 'project1.positions.';

/**
 * 「一张都不抬」。
 *
 * 用**共享的一个空集**而不是每次 `new Set()`：`raisedKeys` 是 `computed`，模板每个变更检测
 * 周期都会读它 —— 返回同一个对象，`@for` 上那个 `[class.is-raised]` 绑定的值就恒等不变，
 * 不会白白把五张卡全部标脏。
 */
const NO_KEYS: ReadonlySet<string> = new Set<string>();

@Component({
  selector: 'projects-tree',
  templateUrl: './project1.component.html',
  styleUrl: './project1.component.less',
  imports: [
    DragDropModule,
    TranslatePipe,
    DatePipe,
    RouterLink,
    BreadcrumbTranslateDirective,
    NzAlertModule,
    NzAvatarComponent,
    NzBreadCrumbModule,
    NzButtonModule,
    NzEmptyModule,
    NzFloatButtonModule,
    NzIconDirective,
    NzPageHeaderModule,
    NzPopconfirmModule,
    NzSpinModule,
    NzTagModule,
  ],
  providers: [NzModalService],
})
export class Project1Component extends ProjectComponent implements OnDestroy {
  /**
   * 自己再 `inject` 一次 `AccountService`：父类那个是构造函数参数属性、可见性是 private，
   * 子类取不到。注入的是同一个单例，没有第二份状态。
   */
  private readonly accountRef = inject(AccountService);

  /**
   * 保存失败要说话。父类那个也是 private 且**已经叫 `msg`**，取不到 —— 同 `accountRef` 的道理。
   * 名字不与父类重名是**必须**的：子类再声明一个同名 private 是 TS2415
   * （「Types have separate declarations of a private property」），编译不过。
   */
  private readonly messagesRef = inject(NzMessageService);

  /**
   * 交给下面那个 `effect` 用（**必须**显式传 injector，理由见 `ngOnInit`）。
   *
   * 本类**故意不写构造函数**：父类的构造函数是一串参数属性（12 个依赖），子类一旦自己写构造函数，
   * 就得把这 12 个原样再抄一遍并 `super(...)` 转发 —— 父类哪天加一个依赖，这里编译不过。
   * 不写构造函数时 Angular 走 `ɵɵgetInheritedFactory`，直接复用父类的工厂，
   * 子类的字段初始化器照常执行，所以 `inject()` 在这里是可用的（与 `accountRef` 同一个道理）。
   */
  private readonly injector = inject(Injector);

  /** 滚动壳（`.tree-scroll`）。拖动夹取要它的矩形 —— 它是横向上唯一会裁掉卡片的东西 */
  private readonly boardScrollRef = viewChild<ElementRef<HTMLElement>>('boardScroll');

  /** 画布本身。曲线与卡片都以它的左上角为原点，夹取要把可视区换算到这套坐标里 */
  private readonly boardRef = viewChild<ElementRef<HTMLElement>>('board');

  /** 已收起的节点键。**默认全展开** —— 这一页存在的理由就是「一眼看到各自之间的关系」 */
  protected readonly collapsedIds = signal<Set<string>>(new Set());

  /** 树。三个入参都是父类的信号，取数回来就重算 */
  protected readonly graph = computed<GraphNode | null>(() =>
    buildGraph(this.rootSpace(), this.devices(), this.services()),
  );

  /* ----------------------------------------------------------------------------------------------
   * 位置：已存的 / 编辑中的 / 正被拖的
   * ----------------------------------------------------------------------------------------------*/

  /** 落盘的那一份。**不是**服务端，是本机浏览器里这份 */
  private readonly stored = signal<Offsets>({});

  /** 编辑态里的草稿。改位置只改它，「保存布局」才写盘、「退出编辑」就丢掉 */
  protected readonly draft = signal<Offsets>({});

  /** 正在编辑布局 */
  protected readonly editing = signal(false);

  /**
   * 拖动中那一次位移。**不入草稿**，松手才入 —— 于是拖到一半按 Esc、或者拖回原地，
   * 草稿都是干净的（拖回原地时 {@link dragEnded} 会把这一项整个删掉，见那里）。
   *
   * 它是**临时**的却仍然走信号，是因为它要参与 {@link effective} 那个 computed：
   * 卡片位置、曲线、画布尺寸三样都得跟着指针走，而且是同一份坐标算出来的。
   */
  private readonly drag = signal<{ key: string; dx: number; dy: number } | null>(null);

  /** 开拖那张卡在草稿里的原偏移。指针位移要**加在它上面**，不是从 0 开始 */
  private dragBase: Offset | null = null;
  private dragKey = '';

  /**
   * 开拖那一支**不计自己这份偏移**时的包围盒，以及被拖那张卡自己的那一份。整场拖动里
   * 两者都是常数（只有被拖的那一支在动，别的枝一格都不动）。
   *
   * 用途只有一个：给 {@link clampToVisible} 当界限，别让卡片被拖出**看得见的那块板**
   * （只有整支比可视区还大时才退而用「自己那一份」，见那里的注释）。
   */
  private dragBranch: Bounds | null = null;
  private dragSelf: Bounds | null = null;

  /**
   * 开拖那一刻**看得见的那块板**（画布坐标）。拖动中它是常数 —— 卡片被夹住之后够不到
   * 边上，也就不会把视图带得滚起来（自动滚动是另一件事，这一轮不做）。
   *
   * 量不出来就是 {@link UNBOUNDED}（只认画布原点），见那里的注释。
   */
  private dragVisible: Bounds = UNBOUNDED;

  /**
   * 最后碰过的那张卡。**松手也不撤**，直到退出编辑态或换项目。
   *
   * 拖动中那张卡有阴影 + 抬到别的卡之上，松手之后如果把手一撤，它就会被**DFS 序靠后的**
   * 那张卡盖住 —— 落点压在别的卡上时，用户看到的就是「我刚拖的那张卡不见了」。
   * 留着这一层，至少**你动过的那张永远在最上面**；压住的那张可以再去拖开。
   */
  private readonly raised = signal('');

  /** 拖动的起点：这一张（拖它整支跟着走） */
  protected readonly draggingKey = computed(() => this.drag()?.key ?? '');

  /**
   * 要抬到**别的卡之上**的那一支：**最后碰过的那一支**（含它自己）。连线仍在这一层之上
   * （样式表里那两条带），所以抬起来的卡不会盖住自己那条曲线。
   *
   * 是「一支」而不是「一张」—— 因为拖动是**整支跟着走**（{@link effective} 那套祖先累加），
   * 落到别人身上时跟着一起挪过去的还有它的子孙。只抬被抓住的那张的话，子孙照样被
   * DFS 序靠后的卡盖住：**用户拖的是一支，看不见的却是这一支里的某张卡**，症状一模一样。
   *
   * 这一条是在桩页面上量出来的，不是推出来的：`onto` 那个场景里被盖住的正是
   * `dev:em7`（`sp:b1f2` 的子卡），而它爹好好地抬在最上面。
   *
   * 只算**看得见的**那一部分（收起的分支不算）：收起的分支里的卡压根不在画布上，
   * 算进来只是白抬一个不存在的元素。
   */
  protected readonly raisedKeys = computed<ReadonlySet<string>>(() => {
    const top = this.raised();
    if (!this.editing() || !top) {
      return NO_KEYS;
    }
    return this.subtreeKeys(top);
  });

  /**
   * 实际参与布局的那份偏移 = 草稿 + 拖动中那一次临时位移。
   *
   * 拖动中的位移**照样走祖先累加**，于是拖父卡片时子孙在指针底下**实时**跟着走，
   * 而不是松手才跳一下。
   */
  private readonly effective = computed<Offsets>(() => {
    const live = this.drag();
    const base = this.draft();
    return live ? { ...base, [live.key]: { dx: live.dx, dy: live.dy } } : base;
  });

  /**
   * 这一屏的坐标：卡片、曲线、画布尺寸。三个都在 {@link layoutTree} 里算，
   * 读的是**同一份坐标** —— 曲线端点因此不可能与卡片脱开。
   *
   * `null` 表示还没取到数（模板走空态）。
   */
  protected readonly layout = computed<TreeLayout | null>(() => {
    const root = this.graph();
    return root ? layoutTree(root, this.effective(), this.collapsedIds()) : null;
  });

  /* ----------------------------------------------------------------------------------------------
   * 选中：一张卡 + 它旁边那张信息框
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 选中那张卡的键。空串 = 没选（不用 `null`：模板里要写 `selected() === p.key`，
   * 一个字符串让这个比较不必先判空）。
   *
   * **只在看模式下有值** —— 进编辑态与换项目都会清掉（见 `enterEdit` / `reload`），
   * 而且编辑态里 `select()` 直接不写值（那道闸的理由写在那边）。
   * 编辑态的主语是「这张卡摆在哪儿」，一份浮在旁边的详情框只会挡着要拖的地方；
   * 而且拖动时框得跟着卡片一路挪，那是纯粹的噪音。
   */
  protected readonly selected = signal('');

  /**
   * 选中的那一格。**只存键、这里再找回实体**：`devices()` 那几份列表每次取数都是新的对象，
   * 存实体的那份信号会在下一次刷新之后指着一份旧数据说话（名字改了、设备删了都不知道）。
   */
  private readonly selectedNode = computed<GraphNode | null>(() =>
    findNode(this.graph(), this.selected()),
  );

  /**
   * 用户把信息框拖到哪儿了。**画布坐标系里的位移增量**，与卡片那套偏移同一个量纲。
   *
   * 不落盘、也不按卡片分键：它只活在这张卡被选中的这段时间里，换一张卡 / 关掉框就归零
   * （见 `select` / `closePanel`）。理由是这样最不容易用错 —— 一份「上次拖到哪」的记忆，
   * 换到另一张卡上十有八九是错的，用户看到的是一个莫名其妙飘在角落的框。
   */
  private readonly panelDrag = signal<Offset>({ dx: 0, dy: 0 });

  /** 开拖那一刻的位移，指针位移加在它上面（与卡片那边 `dragBase` 同一个理由） */
  private panelDragBase: Offset = { dx: 0, dy: 0 };

  /**
   * 信息框的**内容高度**。摆放要先知道高度（「下面还放不放得下」靠它判断），于是每次渲染后
   * 量一次 `#panelBox` 的 `offsetHeight` 存进这里，`panel()` 拿它当 `panelH`。
   *
   * 框是 `height: auto`（样式表里没有 `max-height`），所以 `offsetHeight` 直接就是内容高度，
   * 一次到位、不需要追赶 —— 正因为没有裁口，不存在「按旧高度裁完再量」的偏差，也不存在那
   * 一两像素的溢出（`border 1px + scrollHeight 不算边框`），内部滚动条这一条就物理上封死了。
   * 这个实测值只进纯函数做落位记账，不绑回 CSS，也就不会自己再搞出滚动条。
   *
   * jsdom 里 `offsetHeight` 恒为 0，所以量测是**浏览器专属**行为；测不到的回落值
   * `PANEL_EST_H` 只进 spec，真机永远在渲染后马上被实测值替掉。信号的值没变就不触发
   * 重渲染，`set` 同名不会打转。
   *
   * `afterRenderEffect` 在这里用**字段初始化**而不是构造函数里挂 —— 组件本身没有构造函数
   * （要重申父类 `ProjectComponent` 那一整串参数），字段初始化就已经在注入上下文里，
   * 直接挂也成立。
   */
  private readonly panelHeight = signal(PANEL_EST_H);
  private readonly panelBoxRef = viewChild<ElementRef<HTMLElement>>('panelBox');
  private readonly measurePanel = afterRenderEffect(() => this.maybeMeasurePanel());

  private maybeMeasurePanel(): void {
    const el = this.panelBoxRef()?.nativeElement;
    if (el && el.offsetHeight > 0) {
      this.panelHeight.set(el.offsetHeight);
    }
  }

  /**
   * 信息框摆哪儿。没选中、或者选中的那张卡**不在画布上**（它所在的支被收起、或者它自己
   * 被收起）就是 `null`。
   *
   * 后一种情况**故意不清 `selected`**：收起来再展开，框还在原处 —— 那是用户自己的两次操作，
   * 中间不该丢东西。派生出来的 `null` 已经把「现在不该显示」这件事表达完了，
   * 再去把状态改掉就是多一份要同步的真相。
   *
   * 落位分两步：`panelSpot` 按卡片与画布算一个**自动位置**，`shiftPanel` 再把用户拖出来的
   * 位移叠上去并夹回画布。两步都是纯函数，各自有用例 —— 这一步算的是「屏幕上那个框在哪」，
   * 与卡片坐标同一套数，所以拖动卡片时框跟着走，不必再为它接屏幕坐标。
   */
  protected readonly panel = computed<(PanelSpot & { node: GraphNode }) | null>(() => {
    const node = this.selectedNode();
    const board = this.layout();
    if (!node || !board) {
      return null;
    }
    const card = board.nodes.find((p) => p.key === node.key);
    if (!card) {
      return null;
    }
    const spot = panelSpot(card, board.w, board.h, this.panelHeight());
    return { node, ...shiftPanel(spot, this.panelDrag(), { w: board.w, h: board.h }) };
  });

  /**
   * 模板绑的画布尺寸：布局那一份**加上信息框伸出去的那一截**。
   *
   * 与 `layout()` 分开是必要的 —— 那个 `w`/`h` 是纯函数算的、被规格套件逐条钉着，
   * 而这一份只是绑给 DOM 的。两者的差只有「框伸出去了多少」（见 `canvasWithPanel`）。
   */
  protected readonly canvasSize = computed<{ w: number; h: number }>(() => {
    const board = this.layout();
    if (!board) {
      return { w: 0, h: 0 };
    }
    return canvasWithPanel({ w: board.w, h: board.h }, this.panel());
  });

  /**
   * 点一张卡：选中它；再点一下取消。**编辑态下整个不成立**（口径见 `selected`）。
   *
   * 这道闸不能省，也不能只靠 `enterEdit` 清一次：编辑态里点卡片照样会走到这里
   * （`(click)` 挂在卡上，与拖动无关），于是框会在你正拖着卡片的时候飘出来挡在
   * 旁边 —— 它是 `z-index: 3`，压在每一张卡之上。更阴的是**退出编辑态之后它还在**，
   * 因为 `selected` 一直没被清过。
   *
   * 挡在这里而不是在 `panel()` 里再判一次：`select` 是唯一能写入非空值的地方，
   * 一个闸就够，两处判反而多一份要同步的真相。
   */
  protected select(key: string): void {
    if (this.editing()) {
      return;
    }
    this.selected.set(this.selected() === key ? '' : key);
    this.panelDrag.set({ dx: 0, dy: 0 });
  }

  /** 关掉信息框。关闭按钮 / 点画布空白 / 按 Esc 都走它 */
  protected closePanel(): void {
    this.selected.set('');
    this.panelDrag.set({ dx: 0, dy: 0 });
  }

  /**
   * 点画布空白处收框。
   *
   * 判 `target === currentTarget`，而不是在卡片与信息框上到处撒 `stopPropagation`：
   * 靠「冒泡到画布就说明点的是空白」来收框，得把拦截写遍每一个子元素，漏一个的症状就是
   * **点哪张卡哪张卡立刻被关掉**。画布自己是个空壳（卡片、连线、信息框全是它的绝对定位子元素），
   * 所以直接落在它身上的点击只可能是空白处 —— 这个判据不用维护。
   */
  protected onCanvasClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closePanel();
    }
  }

  /**
   * Esc 关框。与 `fullscreenchange` 同一个套路（显式挂、显式摘），不写成宿主监听：
   * 一个组件自己的按键口径，摆在 `ngOnInit` / `ngOnDestroy` 这一对里最看得见。
   */
  private readonly onEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      this.closePanel();
    }
  };

  /**
   * 改过没有。「保存布局」按它启用、「退出编辑」按它决定要不要弹确认。
   *
   * 比的是**草稿与落盘那一份**（不是「草稿非空」）：把卡片拖回原位、或者拖完又「恢复默认」，
   * 都算没改过 —— 那种情况下弹「未保存的修改将丢失」是莫名其妙的。
   */
  protected readonly dirty = computed(() => !sameOffsets(this.draft(), this.stored()));

  /* ----------------------------------------------------------------------------------------------
   * 全屏
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 整页是否处于全屏。
   *
   * 与 `dashboard.component` / `home.3d.component` 同一个道理：**状态只能从
   * `document.fullscreenElement` 读，不能自己维护一个布尔量**。用户按 Esc 退出全屏我们收不到
   * 任何回调 —— 只有 `fullscreenchange`。自己记的那个布尔量这时就与浏览器说的不一致了，
   * 按钮会显示成「退出全屏」而实际已经不在全屏。
   */
  readonly fullscreen = signal(false);

  private readonly onFullscreenChange = (): void => {
    this.fullscreen.set(document.fullscreenElement !== null);
  };

  /** 全屏 / 退出全屏。进全屏的请求可能被拒（不是用户手势触发的、iframe 没给权限），吞掉即可 */
  toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    void document.documentElement.requestFullscreen().catch(() => undefined);
  }

  /** 上一次装载的项目 id（与 `account.space()` 比对，变了才重载） */
  private loadedSpaceId = '';

  /**
   * 这一页**没有路由参数**（路由是 `/main/project1`，不带 `:id`），项目始终取「当前项目」。
   * 所以不能照父类那样只订阅一次 `route.params` —— 那只会拿到订阅那一刻的 `account.space()`，
   * 而它在页面构造时可能还是空的，切换项目时更不会变。改用一个 `effect` 盯住这个信号
   * （与 `dashboard.component` 同一个范式）。
   *
   * **`effect` 必须显式收到 `injector`**：`effect()` 不带 injector 时会 `inject(Injector)`，
   * 而那要求一个**活动的注入上下文** —— `ngOnInit` 里没有（`dashboard.component` 那份写在
   * 构造函数里，所以它不用传）。不传就是页面一打开就抛 NG0203，而 `ng build` 抓不到这种错
   * （它是运行时的，不是类型错）。本类又不写构造函数（理由见 `injector` 字段），
   * 于是把注入上下文里取到的 injector 存下来、在这里显式交回去。
   */
  override ngOnInit(): void {
    this.loadedSpaceId = this.accountRef.space().id;
    this.reload(this.loadedSpaceId);

    // 挂上监听顺便对一次现状：初值可能是 true（比如热重载后页面仍在全屏）
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    this.onFullscreenChange();

    document.addEventListener('keydown', this.onEscape);

    effect(
      () => {
        const spaceId = this.accountRef.space().id;
        if (spaceId !== this.loadedSpaceId) {
          this.loadedSpaceId = spaceId;
          this.reload(spaceId);
        }
      },
      { injector: this.injector },
    );
  }

  ngOnDestroy(): void {
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    document.removeEventListener('keydown', this.onEscape);
  }

  /**
   * 换项目时重载。
   *
   * **管理员上下文要跟着取**：信息框里那几个写操作（添加设备 / 添加子空间 / 删除 / 调试）
   * 按 `isAdmin` 显隐，与表格那一版同一个口径。代价是每次进页面多两个请求（`getSpace` +
   * `listAccesses`）—— 上一版这里刻意省掉它们，是因为那一版是只读的、`isAdmin` 一次都没被读到；
   * 现在有了动作按钮，这两个请求就是**必需**的了。失败静默（见父类），非管理员只是少几个按钮。
   *
   * 换项目要**顺带换掉位置**（各项目各摆各的），所以编辑态一并退掉：留着上一个项目的草稿，
   * 「保存布局」会把它写到新项目头上。选中也要清 —— 那个键指的是一棵已经不在屏幕上的树里的格子。
   */
  private reload(spaceId: string): void {
    this.rootId.set(spaceId);
    this.editing.set(false);
    this.drag.set(null);
    this.dragBase = null;
    this.dragKey = '';
    this.raised.set('');
    // 换项目 = 关掉框，连「它被拖到哪」一起忘掉 —— 那是上一个项目的框的位置
    this.closePanel();

    const offsets = this.readStored(spaceId);
    this.stored.set(offsets);
    this.draft.set(offsets);

    if (!spaceId) {
      return;
    }
    this.loadSpaceGraph(spaceId);
    this.loadAdminContext(spaceId);
  }

  /* ----------------------------------------------------------------------------------------------
   * 位置：读写浏览器
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 读这个项目上次摆的位置。**认不出来就当没摆过**，理由与做法在
   * `project1.layout.ts` 的 `decodeOffsets` 里（包括「一个 NaN 会让卡片整个消失」那条）。
   *
   * `localStorage` 本身也可能不可用（隐私模式、站点数据被禁），读的时候会抛 ——
   * 那就当没摆过。存不了是小事，页面打不开是大事。
   */
  private readStored(spaceId: string): Offsets {
    if (!spaceId) {
      return {};
    }
    try {
      return decodeOffsets(localStorage.getItem(POSITION_STORAGE_PREFIX + spaceId));
    } catch {
      return {};
    }
  }

  /**
   * 写盘。**失败时不动 `stored`** —— 于是 {@link dirty} 仍然为真、页面留在编辑态，
   * 用户可以再点一次。反过来（先认了这一次保存）会让一次没落盘的改动看起来已经生效，
   * 刷新之后才发现在，那是最难查的一类「丢数据」。
   */
  private writeStored(spaceId: string, offsets: Offsets): boolean {
    if (!spaceId) {
      return false;
    }
    try {
      localStorage.setItem(POSITION_STORAGE_PREFIX + spaceId, encodeOffsets(offsets));
      return true;
    } catch {
      return false;
    }
  }

  /* ----------------------------------------------------------------------------------------------
   * 编辑态
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 进编辑态：从落盘那份拷一份草稿，并**把选中清掉**。
   *
   * 编辑态的主语是「这张卡摆在哪儿」，信息框浮在旁边只会挡着要拖的地方，而且拖动时它还得
   * 跟着卡片一路挪。两种意图分开，比让它们互相让位简单。
   */
  protected enterEdit(): void {
    this.draft.set({ ...this.stored() });
    this.raised.set('');
    this.closePanel();
    this.editing.set(true);
  }

  /**
   * 退出编辑：草稿整个丢掉，回到落盘那份（点这个按钮前会先确认，见模板）。
   *
   * 顺手把 {@link raised} 清掉 —— 它是「编辑时最后碰过的那张卡」，出了编辑态就没有抬起的理由，
   * 留着会让下一次进来时有一张卡莫名压在最上面。
   */
  protected cancelEdit(): void {
    this.draft.set({ ...this.stored() });
    this.drag.set(null);
    this.dragBase = null;
    this.dragKey = '';
    this.raised.set('');
    this.editing.set(false);
  }

  /**
   * 恢复默认：把**空表装进草稿**。空表 = 没有偏移 = 自动布局（见 `project1.layout.ts`）。
   *
   * 与看板同口径 —— 它只改草稿，用户还得点「保存布局」才生效；在那之前「退出编辑」
   * 就等于什么都没发生过。所以模板里那颗按钮**没有**确认气泡：一个能撤销的动作不必先过一道确认。
   *
   * **留在编辑态**：这是一次「换个起点」而不是「改完了」，用户多半还要接着调。
   */
  protected resetLayout(): void {
    this.draft.set({});
  }

  /**
   * 保存：把草稿写进浏览器，然后退出编辑态。
   *
   * 前两句 guard 是**按钮那边给不了**的：`nz-float-button` 没有 `nzDisabled` 这个输入，
   * 所以「没改过」只能在这里挡住，界面上只把那颗按钮压暗（见模板与样式表）。
   */
  protected saveLayout(): void {
    const spaceId = this.rootId();
    if (!spaceId || !this.dirty()) {
      return;
    }

    if (!this.writeStored(spaceId, this.draft())) {
      this.messagesRef.warning(this.i18n.translate.instant('保存失败，浏览器可能禁用了本地存储'));
      return;
    }

    this.stored.set({ ...this.draft() });
    this.raised.set('');
    this.editing.set(false);
  }

  /* ----------------------------------------------------------------------------------------------
   * 拖卡片
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 开拖：记下这张卡在草稿里的原偏移。指针位移是**加在它上面**的 ——
   * 不加的话，一张已经摆过的卡片一被碰就会跳回自动位置。
   *
   * 顺带把这一支的边界、以及**看得见的那块板**量出来（{@link boundsOf} / {@link visibleBounds}），
   * 拖动中每像素都要用它们夹取。两者整场拖动里都是常数，所以只在这里量一次。
   */
  protected dragStarted(event: CdkDragStart<GraphNode>): void {
    const key = event.source.data.key;
    const own = this.draft()[key];
    this.dragKey = key;
    this.dragBase = own ? { ...own } : { dx: 0, dy: 0 };
    this.raised.set(key);

    // 先把上一场的临时位移清干净**再**量边界：`layout()` 是 computed，带着 `drag` 里的旧值
    // 量出来的边界是错的（同一个节点连着拖两次就会撞上）
    this.drag.set(null);
    const box = this.boundsOf(key, this.dragBase);
    this.dragBranch = box.branch;
    this.dragSelf = box.self;
    this.dragVisible = this.visibleBounds();

    this.drag.set({ key, dx: this.dragBase.dx, dy: this.dragBase.dy });
  }

  /**
   * 拖动中：位置 = 起点偏移 + 指针位移，再**夹进看得见的那块板**。取整是为了存进
   * `localStorage` 的那份好读，顺带让「指针没动」这件事能被下一句认出来。
   *
   * **目标没变就直接返回**：这个回调一个像素发一次，而它下游那个 computed 会连带重算
   * 全部卡片坐标 + 全部曲线 + 画布尺寸。不加这一句，一次拖动就是几百轮全量重算。
   * 夹取放在取整**之后**：夹出来的边界是整数，于是「顶住边界之后指针继续走」这一段
   * 每次算出来的值都一样，正好被这一句吃掉，不会白白重算。
   */
  protected dragMoved(event: CdkDragMove<GraphNode>): void {
    const base = this.dragBase;
    if (!base || !this.dragKey) {
      return;
    }

    const { dx, dy } = clampToVisible(
      this.dragBranch,
      this.dragSelf,
      this.dragVisible,
      Math.round(base.dx + event.distance.x),
      Math.round(base.dy + event.distance.y),
    );

    const current = this.drag();
    if (current && current.dx === dx && current.dy === dy) {
      return;
    }
    this.drag.set({ key: this.dragKey, dx, dy });
  }

  /**
   * 松手：把这次位移落到草稿上。
   *
   * **拖回原位就把这一项删掉**，而不是留一个 `{dx: 0, dy: 0}`：偏移表是稀疏的（没摆过就不在
   * 表里），留一个零值会让「把卡片拖出去又拖回来」被判成「改过」，「退出编辑」白弹一次确认。
   */
  protected dragEnded(): void {
    const live = this.drag();
    const key = this.dragKey;

    this.drag.set(null);
    this.dragBase = null;
    this.dragKey = '';

    if (!live || !key) {
      return;
    }

    this.draft.update((offsets) => {
      const next = { ...offsets };
      if (live.dx === 0 && live.dy === 0) {
        delete next[key];
      } else {
        next[key] = { dx: live.dx, dy: live.dy };
      }
      return next;
    });
  }

  /**
   * 开拖那一支**不计自己这份偏移**时的包围盒，外加被拖那张卡自己的那一份。
   *
   * `branch` 取的是**整支**而不是被拖那一张：拖动是整支一起刚性平移，所以只要整支装得下，
   * 就该让它整个留在可视区里。只夹被拖那一张的话，往上拖根卡片时整棵树会从画布顶上冒出去 ——
   * 夹了个寂寞。`self` 是给「整支比可视区还大」时兜底用的（见 `clampToVisible`）。
   *
   * 减掉 `own` 是因为「这一支现在的位置」里已经含着这张卡自己的偏移了；减掉之后拿到的
   * 才是「没有这次拖动时它们在哪」，正是夹取要比的那个基准。整支平移同一个 `own`，
   * 所以逐张减一遍是对的。
   *
   * 量不出来（还没取到数、键对不上）就给 `null`：夹取会因此**整个跳过**，但页面不会崩 ——
   * 宁可这一次能拖出去，也不要为了一个理论上的边界让整页炸掉。
   */
  private boundsOf(key: string, own: Offset): { branch: Bounds | null; self: Bounds | null } {
    const keys = this.subtreeKeys(key);
    const branch: Point[] = [];
    let self: Point[] = [];

    for (const p of this.layout()?.nodes ?? []) {
      if (!keys.has(p.key)) {
        continue;
      }
      const spot = { x: p.x - own.dx, y: p.y - own.dy };
      branch.push(spot);
      if (p.key === key) {
        self = [spot];
      }
    }

    return { branch: boxOf(branch), self: boxOf(self) };
  }

  /**
   * 开拖那一刻**看得见的那块板**（画布坐标）。
   *
   * 取**滚动壳与窗口视口的交集**，两轴一次量准：横向的边界是滚动壳（`.tree-scroll` 的宽
   * 就是内容区宽度），纵向的边界是窗口（滚动壳的高度由内容撑开，它自己不滚）。两者的交集
   * 正好同时对。
   *
   * 量不出来（jsdom 里 `getBoundingClientRect()` 一律返回 0×0）就是 {@link UNBOUNDED} ——
   * 只认画布原点、右/下不设限，也就是本轮之前的那条口径。**规格套件里每一次挂载用例都会
   * 走这条路**，所以它必须是个正经的语义，而不是「理论上不会发生」。
   */
  private visibleBounds(): Bounds {
    const scroll = this.boardScrollRef()?.nativeElement;
    const board = this.boardRef()?.nativeElement;
    if (!scroll || !board) {
      return UNBOUNDED;
    }

    const s = scroll.getBoundingClientRect();
    const c = board.getBoundingClientRect();
    if (s.width <= 0 || s.height <= 0 || c.width <= 0 || c.height <= 0) {
      return UNBOUNDED;
    }

    return {
      minX: Math.max(s.left, 0) - c.left,
      minY: Math.max(s.top, 0) - c.top,
      maxX: Math.min(s.right, window.innerWidth) - c.left,
      maxY: Math.min(s.bottom, window.innerHeight) - c.top,
    };
  }

  /**
   * 一个节点这一支**现在看得见的那部分**的键（含它自己）。
   *
   * 收起的分支不再往下走：它的子孙在 `layout().nodes` 里根本没有位置，也不会被这次拖动
   * 带着走 —— 它们本来就不在画布上。把它们算进边界会让夹取无谓地收紧。
   */
  private subtreeKeys(key: string): Set<string> {
    const keys = new Set<string>();

    const collect = (node: GraphNode): void => {
      keys.add(node.key);
      if (this.collapsedIds().has(node.key)) {
        return;
      }
      for (const child of node.children) {
        collect(child);
      }
    };

    const target = findNode(this.graph(), key);
    if (target) {
      collect(target);
    }
    return keys;
  }

  /* ----------------------------------------------------------------------------------------------
   * 拖信息框
   *
   * 与拖卡片是两套**互不相干**的拖拽：抓手不同（框上是标题，卡上是整张卡）、落点不同
   * （框落在 `panelDrag` 里，卡落在草稿 `offsets` 里）、生效条件也不同（框随时能拖，
   * 卡片要先进编辑态）。所以各写各的三个回调，只共用「取整 + 没变就返回」这条节奏。
   *
   * 位移**不落盘**：它是「这一次我想把它挪开一点」的临时姿态，换个项目、换张卡就该重来
   * （见 `panelDrag`）。卡片位置是布局，值得存；框的位置是姿势，不值得。
   * ----------------------------------------------------------------------------------------------*/

  /** 抓标题开拖：记下这个框**现在**的位移，指针位移加在它上面（同卡片那边的 `dragBase`） */
  protected panelDragStarted(): void {
    this.panelDragBase = { ...this.panelDrag() };
  }

  /**
   * 拖动中：位移 = 起点位移 + 指针位移。取整、目标没变就直接返回 —— 两条都与卡片同一个理由。
   *
   * **这里不夹取**，夹取留给 {@link shiftPanel}：那是唯一一处同时知道画布尺寸与框尺寸的地方，
   * 两处都夹就是两份要同步的边界。代价是顶到边界之后指针继续走、`panelDrag` 还在变而框不动
   * （一段死行程），与卡片那边「顶住边界之后继续拖也不动」是同一个现象，口径一致。
   */
  protected panelDragMoved(event: CdkDragMove<unknown>): void {
    const base = this.panelDragBase;
    const dx = Math.round(base.dx + event.distance.x);
    const dy = Math.round(base.dy + event.distance.y);
    const current = this.panelDrag();
    if (current.dx === dx && current.dy === dy) {
      return;
    }
    this.panelDrag.set({ dx, dy });
  }

  /**
   * 松手。位移每帧都已经落在信号里了，这里只剩把基准收掉 ——
   * 与卡片不同，**没有「落到草稿」这一步**（见本节开头：框的位置不持久化）。
   */
  protected panelDragEnded(): void {
    this.panelDragBase = { dx: 0, dy: 0 };
  }

  /* ----------------------------------------------------------------------------------------------
   * 模板用的小取数
   * ----------------------------------------------------------------------------------------------*/

  /** 卡片标题：空间名 / 设备显示名（父类那套三级兜底）/ 服务名 */
  protected titleOf(node: GraphNode): string {
    if (node.space) {
      return node.space.name;
    }
    if (node.device) {
      return this.deviceName(node.device);
    }
    return node.service?.name ?? '';
  }

  /** 某个节点是不是当前项目（树顶那张卡）：是的话多显示一行空间代码，与表格页的页头对齐 */
  protected isRootSpace(node: GraphNode): boolean {
    return node.space !== null && node.space.id === this.rootId();
  }

  /* ── 信息框里的取数 ────────────────────────────────────────────────────────
   *
   * 这几条都只有信息框在读：卡片上放不下（它是 200×92 的定高盒），而框里就是要**更细**的那一层。
   * 一律取不到就给空串，由模板显示成 `-` —— 与表格页那几个 `|| '-'` 同一个口径。
   */

  /** 按空间 id 在图里找名字（父空间 / 设备所在空间都要用）。找不到给空串 */
  protected spaceNameById(spaceId: string): string {
    const walk = (node: GraphNode | null): string => {
      if (!node) {
        return '';
      }
      if (node.space?.id === spaceId) {
        return node.space.name;
      }
      for (const child of node.children) {
        const hit = walk(child);
        if (hit) {
          return hit;
        }
      }
      return '';
    };
    return spaceId ? walk(this.graph()) : '';
  }

  /** 设备的子设备台数。口径与父类的 `deviceHasChildren` 一致（同项目内 `parentId` 指向它） */
  protected childDeviceCount(device: DeviceEntity): number {
    return this.devices().filter((d) => d.parentId === device.did && d.did !== device.did).length;
  }

  protected isCollapsed(key: string): boolean {
    return this.collapsedIds().has(key);
  }

  /**
   * 收起 / 展开一个节点（只影响它自己那一棵子树）。
   *
   * 收起会让自动布局重排（收起的节点按叶子占一行，兄弟往上收），**已经摆过的偏移不丢** ——
   * 偏移是相对自动布局的，自动布局挪了，摆过的那张也跟着挪，展开回来还是原样。
   */
  protected toggleCollapse(key: string): void {
    this.collapsedIds.update((set) => {
      const next = new Set(set);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }
}
