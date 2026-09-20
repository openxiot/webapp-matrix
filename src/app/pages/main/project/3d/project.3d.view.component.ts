import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewContainerRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalService } from 'ng-zorro-antd/modal';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { TranslatePipe } from '@ngx-translate/core';
import { MainI18nService } from '@app/service/i18n.service';
import { AccountService } from '@app/service/account.service';
import { DeviceDisplayService } from '@app/service/device.display.service';
import { SpaceEntity } from '../../../../typedef/define/space/SpaceEntity';
import {
  Project3dScene,
  type MarkerRect,
  type PickResult,
  type SceneBackground,
  type Vec3,
} from './scene/project.3d.scene';
import { Project3dData } from './data/project.3d.data';
import { type AnchorMarker, devicesInSpace, makeAnchor, spacePath } from './anchor/project.3d.anchor';
import { type AlarmCard, buildAlarmCards } from './alarm/project.3d.alarm';
import {
  type InfoPanel,
  type InfoText,
  type PanelPlacement,
  buildPanels,
  deviceInfo,
  formatPoint,
  placePanel,
  placePanels,
  spaceInfo,
} from './info/project.3d.info';
import { Project3dMenuComponent, type Project3dMenuItem } from './menu/project.3d.menu.component';
import {
  AnchorBindComponent,
  type AnchorBindData,
  type AnchorBindResult,
} from './dialog/project.3d.anchor.bind.component';
import {
  SpaceDevicesComponent,
  type SpaceDevicesData,
  type SpaceDevicesResult,
} from './dialog/project.3d.space.devices.component';
/** 压缩后的模型产物，路径相对于 index.html（见 3d/README.md 的生成管线） */
const MODEL_URL = '3d/001/scene.glb';

/** 菜单开在哪儿、对谁开 */
interface MenuState {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  items: Project3dMenuItem[];
  /** 表面菜单才有：待标注的模型坐标 */
  point: Vec3 | null;
  /** 标记菜单才有：菜单说的是哪个标记 */
  marker: AnchorMarker | null;
}

@Component({
  selector: 'project-3d-view',
  standalone: true,
  templateUrl: './project.3d.view.component.html',
  styleUrl: './project.3d.view.component.less',
  changeDetection: ChangeDetectionStrategy.Eager,
  // Project3dData 不加 providedIn:'root' —— 空间图跟着页面走，离开路由就该被回收。
  // NzModalService 与 project.component 同样列在这里，让弹窗跟随本页生命周期。
  providers: [Project3dData, NzModalService],
  imports: [
    DatePipe,
    FormsModule,
    Project3dMenuComponent,
    NgTemplateOutlet,
    NzAlertModule,
    NzButtonModule,
    NzCheckboxModule,
    NzIconModule,
    NzSpinModule,
    TranslatePipe,
  ],
})
export class Project3dViewComponent implements AfterViewInit, OnDestroy {

  protected readonly loading = signal(true);
  /** 0~100，只用于加载遮罩上的百分比 */
  protected readonly progress = signal(0);
  protected readonly error = signal<{ message: string; detail: string } | null>(null);

  /** 打开的菜单。null = 没开 */
  protected readonly menu = signal<MenuState | null>(null);
  /** 「调整位置」选中的标记：下一次点模型表面是给它换位置，而不是弹表面菜单 */
  protected readonly moving = signal<AnchorMarker | null>(null);
  /** 3D 区域是否处于全屏 */
  protected readonly isFullscreen = signal(false);
  /** 场景背景。只活在本次会话里，刷新回到默认的灰 */
  protected readonly background = signal<SceneBackground>('gray');

  /**
   * 鼠标停着的那个东西。空 = 没悬停，面板就不画。
   *
   * `id` 装的是**实体 id 而不是标记 id**：空间标记就是空间 id，设备标记是设备的
   * **did**（不是标记 id —— 「显示设备」那份标记的 id 是 `空间id@did`，不能当 did 用）。
   *
   * 存 id 不存实体：空间图每次写完都整棵重拉，实体对象是新的，存实体的话面板会
   * 一直指着上一版的那棵树。存 id 则每次都拿当下的图去查，实体真被删掉了就自然
   * 查不到，面板跟着消失。
   */
  private readonly hovered = signal<{ kind: 'space' | 'device'; id: string } | null>(null);

  /**
   * 被悬停的那个标签此刻在画布上的矩形。引擎每帧跟着标签更新它，面板据此贴着走。
   *
   * 与 `hovered` 分开：标签一动（转视角）这个值就变一次，而面板的**内容**没变 ——
   * 混成一个信号会让整块面板每帧重算重画一遍。
   */
  private readonly hoverRect = signal<MarkerRect | null>(null);

  private readonly sceneHost = viewChild.required<ElementRef<HTMLElement>>('sceneHost');
  private readonly sceneWrap = viewChild.required<ElementRef<HTMLElement>>('sceneWrap');
  private readonly i18n = inject(MainI18nService);
  private readonly account = inject(AccountService);
  /** 信息面板要设备的显示名与型号。与 project.3d.space.devices.component 一样直接注入 */
  private readonly display = inject(DeviceDisplayService);
  private readonly modal = inject(NzModalService);
  private readonly viewContainerRef = inject(ViewContainerRef);
  protected readonly data = inject(Project3dData);

  private scene?: Project3dScene;
  private resizeObserver?: ResizeObserver;
  private destroyed = false;

  /**
   * 场景容器底部要贴齐的页脚高度（px）。与样式表顶部的 `@footer-height: 70px` 同值。
   */
  private static readonly FOOTER_H = 70;

  private readonly onViewportResize = (): void => this.fitSceneHeight();

  /**
   * 场景容器**不能**写死成「视口 − 页头 − 页脚」：`project-3d-view` 上方还压着一层
   * 宿主的 `nz-page-header`（返回 + 面包屑 + segmented），它的高度随面包屑换行可长可短，
   * 没有常量可取。写死的话内容会比可视区高出那一截，`nz-content`（overflow:auto）
   * 就冒一条页面滚动条。
   *
   * 这里在布局稳定后量出容器自身顶部，算出「到页脚为止」还剩多少，就地写死到元素上。
   * 全屏时则清空内联高度，交还样式表里 `.scene-wrap:fullscreen { height: 100vh }` 那条
   * （它有 position:fixed + inset:0，比作者写的高度方案更该负责全屏时的铺满）。
   */
  private fitSceneHeight(): void {
    const wrap = this.sceneWrap().nativeElement;
    if (document.fullscreenElement === wrap) {
      wrap.style.height = '';
      return;
    }
    if (wrap.clientWidth === 0) {
      return; // 布局未就绪（比如首次进入时还没排好）
    }
    const available = window.innerHeight - wrap.getBoundingClientRect().top - Project3dViewComponent.FOOTER_H;
    if (available > 0) {
      wrap.style.height = `${available}px`;
    }
  }

  /**
   * 全屏状态只能从 `document.fullscreenElement` 读，不能自己维护一个布尔量。
   *
   * 用户按 Esc、或者浏览器因为别的原因退出全屏时，我们收不到任何回调 —— 只有
   * `fullscreenchange`。自己记的布尔量在这种时候就跟浏览器说的不一致了，按钮会
   * 显示成「退出全屏」而实际已经不在全屏。
   *
   * 退出全屏顺带把背景复位成灰：背景切换按钮**只在全屏里可用**（非全屏时可见但
   * 置灰），那它改出来的黑底也只该活在全屏里 —— 不退的话页面就卡在「一片黑、而
   * 按钮已经点不动了」。再进全屏是灰的、得重新切一次，这是刻意的。
   *
   * ⚠️ `ngAfterViewInit` 会主动调一次本方法来对初值，那时通常不是全屏 → 会走到
   * 复位那一条。此刻背景本来就是灰的，所以无害；但要是以后有人把 `background` 的
   * 初值改成别的颜色，这次复位就会把它抹掉 —— 那行初值得跟着一起改。
   */
  private readonly onFullscreenChange = (): void => {
    const fullscreen = document.fullscreenElement === this.sceneWrap().nativeElement;
    this.isFullscreen.set(fullscreen);
    if (!fullscreen) {
      this.background.set('gray');
    }
    // 进全屏：清掉内联高度交给 :fullscreen 规则；退全屏：重新按「页脚为止」量回来。
    // 不然内联高度（非全屏那份）会盖过 :fullscreen，全屏反而铺不满。
    this.fitSceneHeight();
  };

  /** 读一下 currentLang 让它在 zoneless 下跟着语言切换重算 */
  private readonly errorTitle = computed(() => {
    this.i18n.currentLang();
    return this.i18n.translate.instant('模型加载失败');
  });

  /** 「调整位置」进行中的提示，让人知道下一次点击会被吃掉 */
  protected readonly movingHint = computed(() => {
    const marker = this.moving();
    if (!marker) {
      return '';
    }
    this.i18n.currentLang();
    return this.i18n.translate.instant('点击模型上新的位置') + '：' + marker.name;
  });

  /**
   * 全屏时顶部中间那条项目名。空串 = 不画。
   *
   * 读的就是 `account.space()` —— **当前项目本身就是一个 `SpaceEntity`**（见
   * account.service 的 space 信号），所以不加请求、不新增状态，切项目这里跟着变。
   *
   * 只读 `name` 不读 `id`：项目没选中时 `space()` 是一个空的 `SpaceEntity`，
   * 名字自然是空串，一条空的深色底片比不画更难看。
   *
   * **这个名字不是文案，不翻译**：它和空间名、设备名一样是用户起的。
   */
  protected readonly projectName = computed(() => this.account.space().name);

  /**
   * 「显示信息」：不悬停也把每个标记的信息面板铺开。
   *
   * **放组件里，不放 `Project3dData`。** 「显示空间」「显示设备」那两颗在 data 里，
   * 是因为它们要喂 `markers()` —— 它们决定画面上**有哪些标记**。这一颗不增删任何
   * 标记，只决定那些标记的信息画不画，所以是纯展示层的事。
   *
   * 默认关：开着是给大屏看的，平时刷一下页面就铺一片面板反而碍事。只活在本次会话里。
   */
  protected readonly showInfo = signal(false);

  /**
   * 「显示告警」：左侧竖排一列**未处理**的告警框。
   *
   * **放组件里，不放 `Project3dData`**，理由与 `showInfo` 完全相同 —— 它一个标记都不增删，
   * 只决定左列画不画，所以是纯展示层的事，也不走 `onLayerToggle()`。
   *
   * **默认开**（与「显示空间」一致；「显示设备」「显示信息」默认关）。这个页面是挂墙上
   * 盯着一片场地的，出事的时候没人会去翻告警页那张表格 —— 进页面就该看得见。
   * 没有未处理的告警时这一列是个**空壳**（没有框、没有标题、自己也透明），
   * 画面上什么都不会多出来，所以默认开着不脏。
   *
   * ⚠️ 默认开**必须配 constructor 里那一次 `loadAlarms()`**，光把这里改成 true 是不够的：
   * 取数原先只挂在 `toggleAlarms()` 上，那样默认勾着的开关底下会是一条空列，
   * 一直等到用户自己去关一下再开才出现。
   *
   * 只活在本次会话里。
   */
  protected readonly showAlarms = signal(true);

  /**
   * 正在处理的那条告警 id（按钮转圈，同时挡住重复点）。空串 = 没有在处理的。
   *
   * 一条一条地处理：转圈期间其他框的按钮照点不误，但同一个框点不出第二发。
   */
  protected readonly handling = signal('');

  /**
   * 左列要画的那一排框。
   *
   * `currentLang()` 那行不能省，理由与 `hover` 里那行一样：级别文案（提示/警告/严重）
   * 是 instant 拼出来的，不读这个信号切语言后这一列不会重算。**告警文本本身不翻**
   * （它是用户数据，见 project.3d.alarm.ts）。
   */
  protected readonly alarmCards = computed<AlarmCard[]>(() => {
    this.i18n.currentLang();
    const list = this.data.alarms();
    if (!list) {
      return [];
    }
    return buildAlarmCards(list.items, this.data.serviceById(), this.data.spaceById(), (key) =>
      this.t(key),
    );
  });

  /**
   * 这一批里还有更早的告警没取回来（见 `Project3dData` 的 `ALARM_LIMIT`）。
   *
   * 列内滚动只在**已取回的这批**里滚，所以必须说一句 —— 否则用户以为「就这么多」。
   * 不给跳转告警页的链接：那是另一件事，要做再说。
   */
  protected readonly alarmsTruncated = computed(() => this.data.alarms()?.truncated === true);

  /**
   * 全部标记此刻在画布上的矩形，由引擎每帧报上来（见引擎的 `setRectSync`）。
   *
   * 只有「显示信息」打开时引擎才会报，所以关着的时候这个信号是空的、也不会被写 ——
   * 不转视角、不铺面板时一次变更检测都不多跑。
   */
  private readonly rects = signal<ReadonlyMap<string, MarkerRect>>(new Map());

  /**
   * 铺开的面板**内容**。只跟标记、语言、设备名走，**不读 `rects`**。
   *
   * 与下面的 `infoViews` 拆成两个 computed 是这里唯一的性能要点：`rects` 每帧都可能
   * 变，混成一个的话**每块面板的内容**都会跟着每帧重算一遍 —— 而 `spaceInfo` 要
   * 遍历祖先链、还要 filter 整个设备表（`devicesInSpace`）。几十个标记 × 60fps 白烧。
   * 拆开之后，每帧只重跑 `placePanel` 那点算术。
   */
  private readonly infoEntries = computed(() => {
    if (!this.showInfo()) {
      return [];
    }
    this.i18n.currentLang();
    return buildPanels(
      this.data.markers(),
      this.data.spaceById(),
      this.data.deviceById(),
      this.data.devices(),
      this.infoText(),
    );
  });

  /**
   * 铺开的面板：内容 + 该摆哪儿。模板 `@for` 的就是它。
   *
   * 空列表直接返回，**不去读容器尺寸**：`containerSize()` 要读 `clientWidth`，
   * 那是一次强制回流。没面板可摆的时候（开关关着，这是绝大多数时候）不该为它付钱。
   */
  protected readonly infoViews = computed(() => {
    const entries = this.infoEntries();
    return entries.length === 0 ? [] : placePanels(entries, this.rects(), this.containerSize());
  });

  /**
   * 悬停面板：内容 + 该摆哪儿。查不到实体就整个不画（悬停的标记可能刚被删掉，
   * 空间图也可能刚换过一轮）。
   *
   * 内容与位置**算在一起**，不拆成两个 computed：拆开的话模板会先看到「有内容、
   * 没位置」的中间态，面板会闪一下在左上角（`.h3d-info` 是绝对定位且没有默认
   * top/left，没给位置就落在容器的静态位置）。
   *
   * 用 computed 而不是在模板里调方法：设备显示名是**先返回占位名、随后异步补上**
   * 的（见 DeviceDisplayService.name），computed 的依赖收集是确定的，名字到位后
   * 这里会自己重算；模板里调方法就得指望模板那层的响应式上下文正好覆盖到它。
   * （`markers()` 接异步名字用的也是这个办法。）
   *
   * `currentLang()` 那行不能省：面板上的标签是 instant 拼出来的，不读这个信号
   * 切语言后面板不会重算，会停在上一种语言 —— 与上面 `movingHint` 同一个理由。
   *
   * **「显示信息」打开时这里返回 null。** 那时每块标记的面板都已经由 `infoViews`
   * 铺出来了，悬停的那块自然也在里面；这里再画一块，同一个标记就被画两遍，
   * 而且两块会重叠在一起 —— 看着像重影。
   *
   * 至于**悬停这条路径为什么只有一块面板**：一次只有一样东西被指着（见
   * `onMarkerHover`），空间面板和设备面板永远不会同时出现，所以它们本来就该是
   * 同一块卡片换内容。铺开那条路径（`infoViews`）不受此限，一次画 N 块。
   */
  protected readonly hover = computed<{ panel: InfoPanel; placement: PanelPlacement } | null>(
    () => {
      // 这一行必须在读 hovered / hoverRect **之前**：computed 的依赖是这次求值
      // 真的读到的那些信号。放在后面的话，铺开期间引擎每帧写 hoverRect 都会把
      // 这个 computed 拖起来重算一遍，只为了走到下面立刻返回 null。
      if (this.showInfo()) {
        return null;
      }
      const hovered = this.hovered();
      const rect = this.hoverRect();
      if (!hovered || !rect) {
        return null;
      }
      this.i18n.currentLang();

      const panel = this.infoPanelFor(hovered);
      if (!panel) {
        return null;
      }
      return { panel, placement: placePanel(rect, this.containerSize()) };
    },
  );

  /**
   * 摆面板用的容器尺寸。
   *
   * ⚠️ 两条路径（悬停一块、铺开一片）**必须都读这里**。引擎量矩形用的是画布
   * （`renderer.domElement`）的矩形，而这里是 `.scene-wrap` 的 —— 两者若有细微差别
   * （边框之类），也该让两条路径**一起**偏；各读各的会出现「悬停时贴这边、铺开时贴那边」。
   */
  private containerSize(): { width: number; height: number } {
    const wrap = this.sceneWrap().nativeElement;
    return { width: wrap.clientWidth, height: wrap.clientHeight };
  }

  /** 悬停的东西对应的信息面板内容。实体查不到就 null */
  private infoPanelFor(hovered: { kind: 'space' | 'device'; id: string }): InfoPanel | null {
    if (hovered.kind === 'space') {
      const space = this.data.spaceById().get(hovered.id);
      return space
        ? spaceInfo(space, this.data.spaceById(), this.data.devices(), this.infoText())
        : null;
    }
    const device = this.data.deviceById().get(hovered.id);
    return device ? deviceInfo(device, this.data.spaceById(), this.infoText()) : null;
  }

  /** 已加载的项目 id（与 account.space() 比对，变了才重载） */
  private currentSpaceId = '';

  constructor() {
    this.currentSpaceId = this.account.space().id;
    this.data.load(this.currentSpaceId);
    // 左列默认开着（见 showAlarms），所以进页面就得取一次告警 —— 少了这一句，
    // 那颗默认勾上的开关底下会是一条空列，要等用户自己关一下再开才出得来。
    // **必须在 `load()` 之后**：`loadAlarms()` 查的是 `load()` 设进去的 `rootId`，
    // 反过来写的话第一次请求会因为「没选项目」被直接挡掉（而且挡得静悄悄）。
    this.data.loadAlarms();

    // 切换项目（或退出到未选中）时跟着换空间图
    effect(() => {
      const spaceId = this.account.space().id;
      if (spaceId !== this.currentSpaceId) {
        this.currentSpaceId = spaceId;
        this.data.load(spaceId);
        // 换了项目，菜单和「调整位置」针对的东西都不存在了
        this.menu.set(null);
        this.moving.set(null);
        this.data.activeMarkerId.set('');
        // 左列的告警也得跟着换。**只在开关开着时取** —— 关着时清单本来就是 null，
        // 不该为了一列不显示的东西去打一次请求。服务清单不用另外触发：
        // 它跟着上面的 load() 一起回来（`services` 就是空间图的一部分）。
        if (this.showAlarms()) {
          this.data.loadAlarms();
        }
      }
    });

    // 空间图 / 设备名解析 / 选中态一变就把标记全量重灌。
    // 场景还没建好时这里是空转 —— initScene 建完会自己补一次。
    effect(() => {
      const markers = this.data.markers();
      this.scene?.setMarkers(markers.map((marker) => marker.spec));
    });

    // 同上：换背景也要等场景建好，initScene 会补上当前值。
    //
    // ⚠️ 信号必须**无条件**读到，不能写成 `this.scene?.setBackground(this.background())` ——
    // 可选链会把参数一起短路掉，场景还没建好时 `this.background()` 压根不会被执行，
    // effect 就一条依赖都没记上，从此再也不会重跑（点按钮自然毫无反应）。
    // 而场景恰恰总是后建的：initScene() 在容器尺寸为 0 时直接返回，等 ResizeObserver 来叫。
    effect(() => {
      const background = this.background();
      this.scene?.setBackground(background);
    });
  }

  ngAfterViewInit(): void {
    const host = this.sceneHost().nativeElement;

    // 挂上监听顺便对一次现状：初值可能是 true（比如热重载后元素仍在全屏）
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    this.onFullscreenChange();

    // 首次渲染时容器可能还没完成布局（clientWidth/clientHeight 为 0），
    // 此时建 WebGL 上下文会拿到 0×0 的绘制缓冲、白白吃一个 context 名额。
    // 跟 echarts 指令一样，交给 ResizeObserver 在尺寸非零后再初始化。
    this.resizeObserver = new ResizeObserver(() => {
      if (this.scene) {
        this.scene.resize();
      } else {
        this.initScene();
      }
    });
    this.resizeObserver.observe(host);
    this.initScene();

    // 量出真实可用高度写死到 wrap 上，避免页面滚动条；视口变化时重量。先把滚动容器
    // 拉回顶部，否则在别的视图上滚过的话，getBoundingClientRect().top 会带着那段滚动
    // 偏移量出来，算出来的高度就偏大了。
    this.sceneWrap().nativeElement.closest('nz-content')?.scrollTo(0, 0);
    this.fitSceneHeight();
    window.addEventListener('resize', this.onViewportResize);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    window.removeEventListener('resize', this.onViewportResize);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.scene?.dispose();
    this.scene = undefined;

    // 全屏元素被移出 DOM 时浏览器通常自己会退出全屏，但「通常」不够 ——
    // 万一没退，用户看到的就是一块摘不掉的空白全屏，而且已经没有任何按钮了。
    // 只处理自己这个元素：全局还有别处全屏时不该由我们来退。
    if (document.fullscreenElement === this.sceneWrap().nativeElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }

  protected resetView(): void {
    this.scene?.resetView();
    this.scene?.clearSelection();
    this.closeMenu();
  }

  /**
   * 黑 / 灰背景互切。
   *
   * 灰是默认，也是 `.scene-wrap` 的 CSS 底色。改 CSS 那层是为了 canvas 没铺满时
   * （首次布局、缩放瞬间、进出全屏的过渡帧）露出来的仍是同一个颜色，不闪。
   *
   * 按钮在非全屏时置灰不可用（见模板），退出全屏会自动复位成灰（见 onFullscreenChange）。
   */
  protected toggleBackground(): void {
    this.background.update((current) => (current === 'gray' ? 'black' : 'gray'));
  }

  /** 「显示空间」。关掉后空间标签和角标一起没了，但自己标过点的设备仍在 */
  protected toggleSpaces(show: boolean): void {
    this.data.showSpaces.set(show);
    this.onLayerToggle();
  }

  /** 「显示设备」：把这个空间里还没单独标点的设备逐行列出来，不再只出一个角标数 */
  protected toggleDevices(show: boolean): void {
    this.data.showDevices.set(show);
    this.onLayerToggle();
  }

  /**
   * 「显示信息」：把每个标记的信息面板铺开，不用鼠标去碰标签。
   *
   * **不走 `onLayerToggle()`** —— 那个的职责是「层翻了之后菜单和『调整位置』可能悬空」，
   * 因为翻那两颗开关会增删标记。这一颗一个标记都不动，菜单指着的那个还在原处，
   * 没有要收尾的东西。
   *
   * 引擎那边要跟着打开/关闭矩形上报：铺开的面板全靠每帧的矩形摆位，
   * 而渲染是按需的 —— 关着时引擎一帧都不出，也就没有矩形。
   */
  protected toggleInfo(show: boolean): void {
    this.showInfo.set(show);
    // 把记着的悬停清掉。**两个方向都需要**：
    //  - 关掉时，若这里还记着「刚才指着谁」（开着的时候照样在记，见 onMarkerHover），
    //    面板会凭一个早就过期的位置突然冒出来，而鼠标可能根本不在那儿；
    //  - 打开时，留着它也没有意义 —— 铺开的列表已经涵盖所有标记了。
    // 清掉之后，关掉开关画面就是干净的；真要再看某一块，把鼠标移上去自然会重新记。
    this.hovered.set(null);
    this.hoverRect.set(null);
    // 记着的矩形也一起丢掉。**两个方向都需要**：关着的时候画面照样在动，
    // 重新打开时若还留着上一轮的表，那一片面板会先按**旧镜头**的位置画一帧、
    // 下一帧再集体跳到正确的位置上 —— 一片面板同时抖一下，比晚一帧出现难看得多。
    // 丢掉之后，第一帧就没有面板（没有矩形），引擎报上来才画，位置天生是对的。
    this.rects.set(new Map());
    this.scene?.setRectSync(show);
  }

  /**
   * 「显示告警」：在画面左侧竖着铺一列未处理的告警框。
   *
   * **同样不走 `onLayerToggle()`**：这一列一个标记都不增删，也没有菜单指着它。
   *
   * **只在勾上时取一次**（`loadAlarms`），之后画面不动 —— 不轮询、也没有刷新按钮，
   * 想看最新的就关一下再开。这是与用户确认过的取舍：全站还没有一个定时器，
   * 加它得一并管好销毁、以及「正在处理某一条时又来了一批」的竞争。
   * （进页面时还会取一次 —— 这颗开关默认开着，见 `showAlarms` 与 constructor。）
   *
   * **关掉时把清单丢掉**：留着的话再打开会先闪一下上一轮的旧告警，然后才被新响应替掉。
   * 顺带把「正在处理」也复位 —— 关掉开关之后那颗转圈的按钮已经不在画面上了。
   */
  protected toggleAlarms(show: boolean): void {
    this.showAlarms.set(show);
    if (show) {
      this.data.loadAlarms();
      return;
    }
    this.data.alarms.set(null);
    this.data.alarmsError.set('');
    this.handling.set('');
  }

  /**
   * 处理一条告警。与告警页一致：**不弹二次确认**，按钮转圈 + 「操作成功」提示。
   *
   * 成功之后那一张框会自己消失 —— 消失的机制在数据层（那一条的 `handled` 被就地换成
   * true，`buildAlarmCards` 据此不画它），这里只负责转圈。
   */
  protected onHandleAlarm(card: AlarmCard): void {
    // 没有 id 的框压根不画按钮（见 AlarmCard.canHandle），这一句是形式上兜底；
    // 挡重复点则交给 handling：转圈期间同一个框点不出第二发
    if (!card.canHandle || this.handling()) {
      return;
    }
    this.handling.set(card.id);
    // onDone 成功与失败都会来一次，转圈一定停得下来
    this.data.handleAlarm(card.id, () => this.handling.set(''));
  }

  /**
   * 翻任一图层开关之后的收尾。
   *
   * **菜单一律关掉。** 它是钉在被点那个标记上的，而层一翻，那个标记本身可能就没了
   * （关「显示空间」收掉空间标签，关「显示设备」收掉列在空间下的那些行）——
   * 更糟的是「取消标注」这类写库操作会落在一个已经看不见的标记上，
   * 看不见的东西被改掉，用户没有任何线索。
   *
   * （菜单里的「设备 N 台」不在此列：它是现算的，不读任何快照，层开关也改不了
   * 设备归属。要防的是「菜单指着一个没了的东西」。）
   *
   * **「调整位置」只在目标真的消失时才取消。** 目标还在的话，用户正在做的事完全没
   * 受影响，平白取消掉反而莫名其妙。信号是同步的，所以这里读到的 `markers()` 已经
   * 是新状态了。
   */
  private onLayerToggle(): void {
    this.closeMenu();
    const moving = this.moving();
    if (moving && !this.data.markers().some((marker) => marker.id === moving.id)) {
      this.moving.set(null);
    }
  }

  /** 全屏 / 退出全屏。全屏的是 `.scene-wrap`，所以遮罩、菜单、提示都跟着一起进去 */
  protected toggleFullscreen(): void {
    if (document.fullscreenElement === this.sceneWrap().nativeElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    // 进全屏的请求可能被拒（比如不是用户手势触发的）。吞掉异常即可：
    // 状态由 fullscreenchange 说话，这里报错也没有别的补救动作。
    void this.sceneWrap()
      .nativeElement.requestFullscreen()
      .catch(() => undefined);
  }

  /* ----------------------------------------------------------------------------------------------
   * 菜单
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 点了模型表面。
   *
   * 三种情况：正在「调整位置」→ 拿这次点击当新位置；点到了实体 → 弹表面菜单；
   * 点到空白（`result` 为 null）→ 关菜单。拖拽旋转不会走到这里（引擎里有 5px 阈值）。
   */
  private onSurfacePick(result: PickResult | null): void {
    const moving = this.moving();
    if (result && moving) {
      this.moving.set(null);
      this.applyAnchor(moving, result.point);
      return;
    }

    if (!result) {
      this.closeMenu();
      return;
    }

    this.data.activeMarkerId.set('');
    this.menu.set({
      x: result.screen.x,
      y: result.screen.y,
      title: this.t('模型位置'),
      subtitle: formatPoint(result.point),
      point: result.point,
      marker: null,
      items: [
        { id: 'annotate', label: this.t('在此标注空间') },
        { id: 'dismiss', label: this.t('取消') },
      ],
    });
  }

  /** 点了场景里的标记 */
  private onMarkerPick(marker: AnchorMarker, screen: { x: number; y: number }): void {
    this.data.activeMarkerId.set(marker.id);

    const space = this.data.spaceById().get(marker.spaceId);
    const path = space ? spacePath(space, this.data.spaceById()) : '';
    const isSpace = marker.kind === 'space';

    // 空间标记才有「设备 N 台」和「取消标注」；设备标记的「取消标注」是退回所属空间，
    // 两者语义不同，所以文案和能力都分开
    const items: Project3dMenuItem[] = isSpace
      ? [
          {
            id: 'devices',
            label: this.t('设备 {{count}} 台', { count: this.spaceDeviceCount(marker) }),
          },
          { id: 'move', label: this.t('调整位置') },
          { id: 'unbind', label: this.t('取消标注'), danger: true },
          { id: 'dismiss', label: this.t('取消') },
        ]
      : this.deviceItems(marker);

    this.menu.set({
      x: screen.x,
      y: screen.y,
      title: marker.name,
      subtitle: isSpace ? path : this.deviceSubtitle(marker, path),
      point: null,
      marker,
      items,
    });
  }

  /**
   * 鼠标停到一个标记上，或者移开（两个 `null`）。见 `Project3dScene.onMarkerHover`。
   *
   * 这个回调**同一个 id 会来很多次** —— 标签一动引擎就重报一次位置。所以位置每次都
   * 写（面板要跟着走），而**目标只在真的换了的时候才写**：写的话 `hover()` 那个
   * computed 会重算，转个视角就把面板内容每帧重拼一遍，纯属白干。
   */
  private onMarkerHover(id: string | null, rect: MarkerRect | null): void {
    if (!id || !rect) {
      this.hovered.set(null);
      this.hoverRect.set(null);
      return;
    }
    // 与 onMarkerClick 同一个写法：标记可能刚被删掉（另开一个标签页取消了标注之类），
    // 查不到就当没悬停
    const marker = this.data.markers().find((item) => item.id === id);
    if (!marker) {
      this.hovered.set(null);
      this.hoverRect.set(null);
      return;
    }

    // 一次只有一样东西被指着，所以这里直接覆盖就行，不用分别清
    const kind = marker.kind === 'space' ? 'space' : 'device';
    // ⚠️ 设备认 deviceId 不认 id：设备标记的 id 可能是 `空间id@did`
    const entityId = kind === 'space' ? marker.spaceId : (marker.deviceId ?? '');
    const current = this.hovered();
    if (current?.kind !== kind || current.id !== entityId) {
      this.hovered.set({ kind, id: entityId });
    }
    this.hoverRect.set(rect);
  }

  /**
   * 设备标记的菜单项。
   *
   * 分两种，看位置是哪儿来的：
   *
   * - **借的**（`anchorFrom === 'space'`，就是「显示设备」列在空间标签下的那些）——
   *   它自己根本没有锚点，所以没有位置可调、也没有标注可取消，只能去「单独标点」。
   * - **自有的** —— 和以前一样，调整位置 / 取消标注。
   *
   * 两者走的是同一个 `'move'` 分支（→ `moving` → 点表面 → `applyAnchor`），
   * 只是文案不同，不用新写一套流程。
   */
  private deviceItems(marker: AnchorMarker): Project3dMenuItem[] {
    if (marker.anchorFrom === 'space') {
      return [
        { id: 'move', label: this.t('在模型上单独标点') },
        { id: 'dismiss', label: this.t('取消') },
      ];
    }
    return [
      { id: 'move', label: this.t('调整位置') },
      { id: 'unbind', label: this.t('取消标注'), danger: true },
      { id: 'dismiss', label: this.t('取消') },
    ];
  }

  /**
   * 设备标记的副标题：在线状态 + 空间路径。
   *
   * 设备实体要用 `deviceId` 反查 —— `AnchorMarker` 只带 did 不带实体，而且带的是
   * `deviceId` 那个字段，不是 `id`（空间标签下那份的 id 是 `空间id@did`）。
   * 查不到就只显示能显示的部分：设备可能刚在别处被删掉。
   */
  private deviceSubtitle(marker: AnchorMarker, path: string): string {
    const device = marker.deviceId ? this.data.deviceById().get(marker.deviceId) : undefined;
    const online = device ? this.t(device.online ? '在线' : '离线') : '';
    return [online, path].filter((part) => part).join(' · ');
  }

  protected onMenuPick(id: string): void {
    const state = this.menu();
    if (!state) {
      return;
    }
    // 先关菜单：下面几个分支要么弹窗要么异步写库，菜单留着会挡住新弹的内容
    this.closeMenu();

    switch (id) {
      case 'annotate':
        if (state.point) {
          this.openAnchorBind(state.point);
        }
        return;
      case 'devices':
        if (state.marker) {
          this.openSpaceDevices(state.marker);
        }
        return;
      case 'move':
        if (state.marker) {
          this.moving.set(state.marker);
        }
        return;
      case 'unbind':
        if (state.marker) {
          this.clearAnchor(state.marker);
        }
        return;
      default:
        return;
    }
  }

  protected closeMenu(): void {
    this.menu.set(null);
    this.data.activeMarkerId.set('');
  }

  /* ----------------------------------------------------------------------------------------------
   * 写锚点
   * ----------------------------------------------------------------------------------------------*/

  private applyAnchor(marker: AnchorMarker, point: Vec3): void {
    const anchor = makeAnchor(point);
    if (marker.kind === 'space') {
      this.data.setSpaceAnchor(marker.id, anchor);
      return;
    }
    // ⚠️ 第二参必须是 deviceId，不能是 id。「显示设备」列在空间标签下的那份标记
    // 的 id 是 `空间id@did`，拿它当 did 写进去会静默存到一台不存在的设备上。
    if (marker.deviceId) {
      this.data.setDeviceAnchor(marker.spaceId, marker.deviceId, anchor);
    }
  }

  private clearAnchor(marker: AnchorMarker): void {
    if (marker.kind === 'space') {
      this.data.clearSpaceAnchor(marker.id);
      return;
    }
    // 同上，认 deviceId
    if (marker.deviceId) {
      this.data.clearDeviceAnchor(marker.spaceId, marker.deviceId);
    }
  }

  /**
   * 这个空间下有几台设备。菜单上的「设备 N 台」用它。
   *
   * 与空间标记上那个角标**同一个口径**（都是 {@link devicesInSpace}，即「这个空间
   * 拥有几台」，与设备有没有单独标点无关），也和悬停面板的「设备数量」、空间设备
   * 弹窗同源 —— 四处必须永远是同一个数。
   *
   * ⚠️ 但仍然**不能改读角标**：角标只在「显示设备」关着时才画（展开了就不重复报数），
   * 读它会在勾上开关后变回恒定的 0。早先就是栽在这里：菜单说 4 台、弹窗列了 7 台。
   */
  private spaceDeviceCount(marker: AnchorMarker): number {
    return devicesInSpace(this.data.devices(), marker.spaceId).length;
  }

  /* ----------------------------------------------------------------------------------------------
   * 弹窗
   * ----------------------------------------------------------------------------------------------*/

  /** 「在此标注空间」：选一个已有空间，或者新建一个 */
  private openAnchorBind(point: Vec3): void {
    const spaceById = this.data.spaceById();
    const rootId = this.data.rootId();

    // 锚点只能落在子空间上：根空间就是一个项目，它本身不该有 3D 位置。
    // 顺带也避开了后端 create 时 parentId 为空走的那条「根空间」分支。
    const spaces = this.data.spaces().filter((space) => space.id !== rootId);

    const modal = this.modal.create<AnchorBindComponent, AnchorBindData, AnchorBindResult>({
      nzTitle: this.t('标注空间'),
      nzContent: AnchorBindComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: { spaces, spaceById, defaultParentId: rootId },
      nzFooter: [
        { label: this.t('取消'), onClick: (component) => component!.cancel() },
        {
          label: this.t('确认'),
          type: 'primary',
          disabled: (component) => !component!.valid(),
          onClick: (component) => component!.ok(),
        },
      ],
    });

    modal.afterClose.subscribe((result) => {
      if (!result) {
        return;
      }
      const anchor = makeAnchor(point);
      if (result.kind === 'existing') {
        this.data.setSpaceAnchor(result.spaceId, anchor);
        return;
      }
      const space = new SpaceEntity();
      space.name = result.name;
      space.type = result.type;
      space.parentId = result.parentId;
      space.sortOrder = 0;
      this.data.createSpaceWithAnchor(space, anchor);
    });
  }

  /** 「设备 N 台」：看这个空间有哪些设备，顺手绑几台进来 */
  private openSpaceDevices(marker: AnchorMarker): void {
    const modal = this.modal.create<SpaceDevicesComponent, SpaceDevicesData, SpaceDevicesResult>({
      nzTitle: this.t('空间设备'),
      nzContent: SpaceDevicesComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: {
        spaceId: marker.spaceId,
        spaceName: marker.name,
        devices: this.data.devices(),
      },
      nzFooter: [
        { label: this.t('取消'), onClick: (component) => component!.cancel() },
        {
          label: this.t('绑定'),
          type: 'primary',
          disabled: (component) => component!.selected().length === 0,
          onClick: (component) => component!.ok(),
        },
      ],
    });

    modal.afterClose.subscribe((result) => {
      if (result) {
        this.data.moveDevices(marker.spaceId, result.dids);
      }
    });
  }

  /** 翻译。菜单和弹窗的文案都在运行时拼，所以走 instant 而不是管道 */
  private t(key: string, params?: Record<string, unknown>): string {
    return this.i18n.translate.instant(key, params);
  }

  /**
   * 信息面板要的翻译与取名。
   *
   * 每次现造一个对象、**不缓存**：`deviceName` 背后是异步补名字的
   * （`DeviceDisplayService.name`），缓存住这个对象就等于把「名字后来才到」这件事
   * 挡在响应式之外了。反正只有悬停时才算，代价可以忽略。
   */
  private infoText(): InfoText {
    return {
      t: (key) => this.t(key),
      deviceName: (device) => this.display.name(device),
      deviceModel: (device) => this.display.model(device),
    };
  }

  private initScene(): void {
    const host = this.sceneHost().nativeElement;
    if (this.scene || host.clientWidth === 0 || host.clientHeight === 0) {
      return;
    }

    const scene = new Project3dScene(host);
    scene.onPick((result) => {
      if (!this.destroyed) {
        this.onSurfacePick(result);
      }
    });
    scene.onMarkerClick((id, screen) => {
      if (this.destroyed) {
        return;
      }
      // 标记可能刚被删掉（比如另一个标签页里取消了标注），查不到就当没点
      const marker = this.data.markers().find((item) => item.id === id);
      if (marker) {
        this.onMarkerPick(marker, screen);
      }
    });
    // 悬停面板。这里的 destroyed 守卫是必须的：引擎 dispose() 会把标记逐个摘掉，
    // 摘到正悬着的那个时会补发一个 null 过来。
    scene.onMarkerHover((id, rect) => {
      if (!this.destroyed) {
        this.onMarkerHover(id, rect);
      }
    });
    // 铺开的信息面板。这条**不需要** destroyed 守卫：引擎只在渲染帧里报，
    // 而 dispose() 第一件事就是取消已排队的帧，之后再没有任何上报路径。
    scene.onMarkerRects((rects) => this.rects.set(rects));
    this.scene = scene;
    // 用户的勾选可能比场景先到（场景要等模型列表出来才建）。补一次，别让状态分家。
    scene.setRectSync(this.showInfo());
    // 空间图可能比场景先到。markers() 是 computed，这里读到的是当前值；
    // 此刻 root 还没载入，引擎会把它缓存下来，模型到位后再灌。
    scene.setMarkers(this.data.markers().map((marker) => marker.spec));
    // 引擎默认就是灰的，这行是为了「先切了背景、场景后来才建好」也能对上
    scene.setBackground(this.background());
    scene.resize();
    void this.loadModel(scene);
  }

  private async loadModel(scene: Project3dScene): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.progress.set(0);

    try {
      await scene.load(MODEL_URL, (ratio) => {
        // GLTFLoader 每收到一个 chunk 就回调一次。逐个 set 信号会让 zoneless
        // 下每块数据都跑一轮变更检测，所以只在整数百分比变化时才写。
        const percent = Math.floor(ratio * 100);
        if (percent !== this.progress()) {
          this.progress.set(percent);
        }
      });
    } catch (cause) {
      if (this.destroyed) {
        return;
      }
      // 具体原因留在 detail 里，否则线上只看到「加载失败」四个字没法排查
      this.error.set({
        message: this.errorTitle(),
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      if (!this.destroyed) {
        this.loading.set(false);
      }
    }
  }
}
