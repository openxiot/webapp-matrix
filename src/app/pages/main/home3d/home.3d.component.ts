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
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalService } from 'ng-zorro-antd/modal';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { TranslatePipe } from '@ngx-translate/core';
import { MainI18nService } from '../../../service/i18n.service';
import { AccountService } from '../../../service/account.service';
import { SpaceEntity } from '../../../typedef/define/space/SpaceEntity';
import {
  Model3dScene,
  type PickResult,
  type SceneBackground,
  type Vec3,
} from './model3d.scene';
import { Home3dData } from './home3d.data';
import { type AnchorMarker, makeAnchor, spacePath } from './home3d.anchor';
import { Home3dMenuComponent, type Home3dMenuItem } from './menu/home3d.menu.component';
import {
  AnchorBindComponent,
  type AnchorBindData,
  type AnchorBindResult,
} from './dialog/anchor.bind.component';
import {
  SpaceDevicesComponent,
  type SpaceDevicesData,
  type SpaceDevicesResult,
} from './dialog/space.devices.component';

/** 压缩后的模型产物，路径相对于 index.html（见 3d/README.md 的生成管线） */
const MODEL_URL = '3d/001/scene.glb';

/** 坐标显示：三位小数够定位到厘米级，再长菜单里排不下 */
function formatPoint(point: Vec3): string {
  const round = (value: number) => value.toFixed(3);
  return `${round(point.x)}, ${round(point.y)}, ${round(point.z)}`;
}

/** 菜单开在哪儿、对谁开 */
interface MenuState {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  items: Home3dMenuItem[];
  /** 表面菜单才有：待标注的模型坐标 */
  point: Vec3 | null;
  /** 标记菜单才有：菜单说的是哪个标记 */
  marker: AnchorMarker | null;
}

@Component({
  selector: 'main-home3d',
  standalone: true,
  templateUrl: './home.3d.component.html',
  styleUrl: './home.3d.component.less',
  changeDetection: ChangeDetectionStrategy.Eager,
  // Home3dData 不加 providedIn:'root' —— 空间图跟着页面走，离开路由就该被回收。
  // NzModalService 与 project.component 同样列在这里，让弹窗跟随本页生命周期。
  providers: [Home3dData, NzModalService],
  imports: [
    FormsModule,
    Home3dMenuComponent,
    NzAlertModule,
    NzButtonModule,
    NzCheckboxModule,
    NzIconModule,
    NzSpinModule,
    TranslatePipe,
  ],
})
export class Home3dComponent implements AfterViewInit, OnDestroy {
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

  private readonly sceneHost = viewChild.required<ElementRef<HTMLElement>>('sceneHost');
  private readonly sceneWrap = viewChild.required<ElementRef<HTMLElement>>('sceneWrap');
  private readonly i18n = inject(MainI18nService);
  private readonly account = inject(AccountService);
  private readonly modal = inject(NzModalService);
  private readonly viewContainerRef = inject(ViewContainerRef);
  protected readonly data = inject(Home3dData);

  private scene?: Model3dScene;
  private resizeObserver?: ResizeObserver;
  private destroyed = false;

  /**
   * 全屏状态只能从 `document.fullscreenElement` 读，不能自己维护一个布尔量。
   *
   * 用户按 Esc、或者浏览器因为别的原因退出全屏时，我们收不到任何回调 —— 只有
   * `fullscreenchange`。自己记的布尔量在这种时候就跟浏览器说的不一致了，按钮会
   * 显示成「退出全屏」而实际已经不在全屏。
   */
  private readonly onFullscreenChange = (): void => {
    this.isFullscreen.set(document.fullscreenElement === this.sceneWrap().nativeElement);
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

  /** 已加载的项目 id（与 account.space() 比对，变了才重载） */
  private currentSpaceId = '';

  constructor() {
    this.currentSpaceId = this.account.space().id;
    this.data.load(this.currentSpaceId);

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
  }

  ngOnDestroy(): void {
    this.destroyed = true;
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
   */
  protected toggleBackground(): void {
    this.background.update((current) => (current === 'gray' ? 'black' : 'gray'));
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
    const items: Home3dMenuItem[] = isSpace
      ? [
          { id: 'devices', label: this.t('设备 {{count}} 台', { count: this.deviceCount(marker) }) },
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
  private deviceItems(marker: AnchorMarker): Home3dMenuItem[] {
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
   * 这个标记「折叠」了几台设备。
   *
   * 直接读角标，**不在这里重算一遍** —— 「哪些设备算折叠」的规则只该在
   * `buildMarkers` 里有一份，两处实现迟早对不上（菜单说 3 台、角标画 2 台）。
   */
  private deviceCount(marker: AnchorMarker): number {
    return marker.kind === 'device' ? 1 : Number(marker.spec.badge ?? 0);
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

  private initScene(): void {
    const host = this.sceneHost().nativeElement;
    if (this.scene || host.clientWidth === 0 || host.clientHeight === 0) {
      return;
    }

    const scene = new Model3dScene(host);
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
    this.scene = scene;
    // 空间图可能比场景先到。markers() 是 computed，这里读到的是当前值；
    // 此刻 root 还没载入，引擎会把它缓存下来，模型到位后再灌。
    scene.setMarkers(this.data.markers().map((marker) => marker.spec));
    // 引擎默认就是灰的，这行是为了「先切了背景、场景后来才建好」也能对上
    scene.setBackground(this.background());
    scene.resize();
    void this.loadModel(scene);
  }

  private async loadModel(scene: Model3dScene): Promise<void> {
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
