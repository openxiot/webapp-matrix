import { Location } from '@angular/common';
import { CdkDragMove, CdkDragStart } from '@angular/cdk/drag-drop';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { of } from 'rxjs';
import { icons } from '../../../../icons-provider';
import { AccountService } from '@app/service/account.service';
import { DtuService } from '@app/service/dtu.service';
import { MainI18nService } from '@app/service/i18n.service';
import { MatrixService } from '@app/service/matrix.service';
import { ModbusService } from '@app/service/modbus.service';
import { ProductService } from '@app/service/product.service';
import { DeviceEntity } from '../../../../typedef/define/device/DeviceEntity';
import { SpaceEntity } from '../../../../typedef/define/space/SpaceEntity';
import { GenericService } from '../../../../typedef/define/service/GenericService';
import { GraphNode } from './graph/project.tree.graph';
import { CANVAS_PAD, NODE_H, NODE_W, Offsets, PANEL_GAP, PANEL_W, TreeLayout } from './layout/project.tree.layout';
import { ProjectTreeViewComponent } from './project.tree.view.component';

/*
 * 这一份是**挂载用例**（`TestBed.createComponent`），与 `project.tree.graph.spec.ts`（树拼得对不对）、
 * `project.tree.layout.spec.ts`（坐标算得对不对）互补：那两份钉的是纯函数，这一份钉的是
 * **这个页面跑不跑得起来、接线接对了没有**。
 *
 * 写它的直接原因是踩过一次：`effect()` 写在 `ngOnInit` 里、又没传 `injector`，一进页面就抛
 * NG0203。**`ng build` 抓不到这种错**（它不是类型错，是运行时错，而且只在 `ngDevMode` 下断言），
 * 只有真正把组件建出来才会炸。
 *
 * ── 这一版为什么把 DOM 断言写多了 ─────────────────────────────────────────────
 *
 * 上一版（肘形折线那版）这里只有几条「渲染出来了」的断言，因为递归模板的形状不是这一页的
 * 重点。这一版不同：**拖动**这条链路上有好几处「接线错了也照样渲染」的地方 ——
 * `[cdkDragDisabled]` 接反（看模式反而能拖）、`[style.left]` 忘了绑（卡片全叠在左上角）、
 * 编辑态那组按钮漏了一颗。它们都不会抛异常，只会让页面**看起来不对**，
 * 而那正是最该被钉住的一类。
 *
 * 拖动本身的**坐标**口径（祖先累加、画布跟随）在 `project.tree.layout.spec.ts` 里逐条钉着，
 * 这里只钉「指针事件进来了、落到草稿上了没有」这一段接线。
 */

/** 一棵最小的树：根 + 2 个子空间 + 1 个设备（带 1 个服务），够把三种节点都渲染一遍 */
function fixture(): { spaces: SpaceEntity[]; devices: DeviceEntity[]; services: GenericService[] } {
  const space = (id: string, name: string, parentId: string) =>
    Object.assign(new SpaceEntity(), { id, name, parentId, type: 'floor', updateTime: '2026-09-18 10:00:00' });

  const device = Object.assign(new DeviceEntity(), {
    did: 'd1',
    type: 'urn:ox:acme:sensor',
    space: { spaceId: 'sp1' },
    lastOnline: '2026-09-18 10:00:00',
  });

  const service = Object.assign(new GenericService(), {
    id: 'sv1',
    name: '照明节能',
    spaceId: 'sp1',
    did: 'd1',
  });

  return {
    // 首元素为根（buildTree 的口径）
    spaces: [space('sp1', '总部项目', ''), space('sp2', '1 号楼', 'sp1'), space('sp3', '2 号楼', 'sp1')],
    devices: [device],
    services: [service],
  };
}

/**
 * `protected` 成员的取用口。
 *
 * 这些成员在模板里用得到、在测试里也一样要用，但 Angular 的 `protected` 是**编译期**的约束，
 * 运行时不挡。与其为了测试把它们改成 `public`（那就等于向所有调用方敞开），
 * 不如在这里开一个显式的口子 —— 改错了编译期就报，比 `as any` 一路捅下去强。
 */
type Internals = {
  graph: () => { children: unknown[] } | null;
  layout: () => TreeLayout | null;
  editing: () => boolean;
  dirty: () => boolean;
  /** 选中那张卡的键（空串 = 没选） */
  selected: { (): string; set(value: string): void };
  /** 信息框的落位（含 `maxH`：内容高度，仅供落位记账，不绑回 CSS 裁口），`null` = 没选 / 选中的卡不在布局里 */
  panel: () => { x: number; y: number; maxH: number; flipped: boolean; node: GraphNode } | null;
  closePanel: () => void;
  canvasSize: () => { w: number; h: number };
  draft: { (): Offsets; set(value: Offsets): void };
  /** 抬起的那张卡的键。**不经过编辑态判定**的那一份，用来单独验 `raisedKeys` 里那道闸 */
  raised: { (): string; set(value: string): void };
  draggingKey: () => string;
  enterEdit: () => void;
  cancelEdit: () => void;
  resetLayout: () => void;
  saveLayout: () => void;
  /** 换项目（`rootId` 变了就会走它）：退出编辑态，位置也整份换掉 */
  reload: (spaceId: string) => void;
  dragStarted: (event: CdkDragStart<GraphNode>) => void;
  dragMoved: (event: CdkDragMove<GraphNode>) => void;
  dragEnded: () => void;
  /** 拖信息框那三个。**不接 `source`**：抓手是框上的标题，没有 `data.key` 可取 */
  panelDragStarted: () => void;
  panelDragMoved: (event: CdkDragMove<unknown>) => void;
  panelDragEnded: () => void;
};

const STORAGE_KEY = 'project.tree.positions.sp1';

describe('ProjectTreeViewComponent（挂载）', () => {
  /** 用例之间会互相污染的东西只有一个：localStorage。每个用例从干净的一份开始 */
  const originalLocalStorage = window.localStorage;
  let storageBroken = false;

  beforeEach(async () => {
    const graph = fixture();
    originalLocalStorage.clear();

    await TestBed.configureTestingModule({
      imports: [ProjectTreeViewComponent],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'en', fallbackLang: 'en' }),
        // 与 app.config 同一份注册表：`nz-page-header` 那个返回箭头、服务卡与设备兜底头像、
        // 以及编辑态那两颗（`rollback` / `save`）都要靠它。缺了会抛 IconNotFoundError ——
        // 而那是**测试里才看得见**的一类错：浏览器里 `assets/` 那棵 svg 会兜底，
        // jsdom 里既没有 `assets/` 也没有 `provideHttpClient`，没有第二层可走。
        provideNzIcons(icons),
        // 父类那 12 个依赖全部用桩替掉：这一批用例不验证取数与写动作，只验证页面能起来
        {
          provide: AccountService,
          useValue: {
            space: () => ({ id: 'sp1' }),
            organization: () => ({ id: 'org1' }),
            user: () => ({ id: 'u1' }),
            clearCurrentRootSpace: () => {},
          },
        },
        // 三个都给上（哪怕这一页只用第一个）：下面那条「只打一趟」的用例要能**数**调用，
        // 少给一个就变成了 TypeError，那验的就不是「有没有多发请求」了
        {
          provide: MatrixService,
          useValue: {
            getSpaceGraph: () => of(graph),
            getSpace: () => of(null),
            listAccesses: () => of([]),
          },
        },
        // 产品名 / 实例描述那两趟是尽力而为的补充，取不到就走兜底 —— 这里直接让它取不到
        {
          provide: ProductService,
          useValue: {
            getVisibleProducts: () => of([]),
            getProductInstance: () => of({ description: null }),
            getProductByOrgModel: () => of({}),
          },
        },
        { provide: ModbusService, useValue: {} },
        { provide: DtuService, useValue: {} },
        { provide: MainI18nService, useValue: { getCurrentLang: () => 'zh-CN', translate: { instant: (k: string) => k } } },
        { provide: NzMessageService, useValue: { error: () => {}, success: () => {}, warning: () => {} } },
        { provide: NzModalService, useValue: { create: () => ({ afterClose: of(true) }), confirm: () => {} } },
        { provide: Location, useValue: { back: () => {} } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    // 「浏览器禁用了本地存储」那条用例会把 window.localStorage 换成会抛的桩，这里收回来
    if (storageBroken) {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocalStorage });
      storageBroken = false;
    }
    originalLocalStorage.clear();
  });

  /** 建组件 + 跑一次变更检测（`detectChanges` 会触发 `ngOnInit`，`effect` 就是在这时炸的） */
  async function mount(): Promise<ComponentFixture<ProjectTreeViewComponent>> {
    const fixture = TestBed.createComponent(ProjectTreeViewComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const inner = (fixture: ComponentFixture<ProjectTreeViewComponent>): Internals =>
    fixture.componentInstance as unknown as Internals;

  /** 把 window.localStorage 换成一个**取也抛、存也抛**的桩，模拟隐私模式 / 站点数据被禁 */
  function breakStorage(): void {
    storageBroken = true;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('localStorage is disabled');
      },
    });
  }

  /**
   * 模拟一次拖动：CDK 回调只读 `event.source.data.key` 与 `event.distance`，给这两样就够。
   *
   * 末尾那次 `detectChanges()` 是**必需**的：真实浏览器里三个回调后面都跟着一轮变更检测
   * （点击事件之后 CDK 发事件、Angular 跟着刷新）。少了它，`layout()` 之类的 computed 读得到
   * 新值（它们是跟着信号走的），而**绑在 DOM 上的那部分还是旧的** —— 于是「用 API 断言绿、
   * 用 DOM 断言红」，正是最容易把人带偏的那种红。
   */
  function drag(fixture: ComponentFixture<ProjectTreeViewComponent>, key: string, dx: number, dy: number): void {
    const api = inner(fixture);
    const source = { data: { key } } as unknown as CdkDragStart<GraphNode>['source'];
    api.dragStarted({ source } as CdkDragStart<GraphNode>);
    api.dragMoved({ distance: { x: dx, y: dy } } as CdkDragMove<GraphNode>);
    api.dragEnded();
    fixture.detectChanges();
  }

  /** 模拟一次「拖信息框」。与上面那条同一套理由，只是抓手在框上、不需要 `source` */
  function dragPanel(fixture: ComponentFixture<ProjectTreeViewComponent>, dx: number, dy: number): void {
    const api = inner(fixture);
    api.panelDragStarted();
    api.panelDragMoved({ distance: { x: dx, y: dy } } as CdkDragMove<unknown>);
    api.panelDragEnded();
    fixture.detectChanges();
  }

  /**
   * 某个节点这一屏的坐标。找不到就抛 —— 让「键写错了」当场炸，而不是断言一个 undefined。
   *
   * **只吐 `{x, y}`**，不吐整个 `NodePos`：那上面还挂着 `key` 与 `node`（一整个空间实体），
   * 直接拿去 `toEqual({x, y})` 永远不相等，而失败信息会是一大坨实体字段，看不出是坐标错了。
   */
  function posOf(fixture: ComponentFixture<ProjectTreeViewComponent>, key: string): { x: number; y: number } {
    const pos = inner(fixture)
      .layout()
      ?.nodes.find((n) => n.key === key);
    if (!pos) {
      throw new Error(`布局里没有这个节点：${key}`);
    }
    return { x: pos.x, y: pos.y };
  }

  /**
   * 某个节点对应的 `.tree-node` 元素。
   *
   * 靠**顺序**对应：`@for` 迭代的是 `layout().nodes`，DOM 顺序与它一一相同。不用
   * 「按卡片文字找」是因为文字会翻译、会被省略号截断，而键是唯一不会变的那个东西。
   */
  function cardOf(fixture: ComponentFixture<ProjectTreeViewComponent>, key: string): HTMLElement {
    const board = inner(fixture).layout();
    const index = board ? board.nodes.findIndex((n) => n.key === key) : -1;
    if (index < 0) {
      throw new Error(`布局里没有这个节点：${key}`);
    }
    return (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.tree-node')[index];
  }

  /**
   * 把某个元素的 `getBoundingClientRect()` **钉死**成一份真矩形。
   *
   * jsdom 里所有元素的矩形都是 0×0，于是 `visibleBounds()` 每次都走 `UNBOUNDED` ——
   * 可视区夹取因此**永远不会被 jsdom 自己触发**，只测得到它退化之后的那条老口径。
   * 钉一份上去，才谈得上验「量矩形 → 换算到画布坐标 → 夹取」这条线。
   *
   * 钉的是**元素自己**而不是 `Element.prototype`：只有这两个壳被量，别的元素照旧返回 0×0
   * （NG-ZORRO 与 CDK 也会去量东西，把原型改掉是给它们下绊子）。
   */
  function stubRect(el: Element, box: { left: number; top: number; width: number; height: number }): void {
    const rect = { ...box, right: box.left + box.width, bottom: box.top + box.height };
    Object.defineProperty(el, 'getBoundingClientRect', { configurable: true, value: () => rect });
  }

  it('能建出来并跑完 ngOnInit（effect 的注入上下文就在这里）', async () => {
    const fixture = await mount();
    expect(fixture.componentInstance).toBeTruthy();
  });

  /*
   * 画布是**扁平**的：一层 `.tree-node` 绝对定位铺开，不再有 `.node-children` / `.node-branch`
   * 那套嵌套。这条断言顺手钉住了「递归模板真的删干净了」—— 留一半的话卡片会渲染两遍，
   * 张数就对不上了。
   */
  it('把树铺成扁平画布：5 张卡 + 4 条曲线，坐标绑在 left/top 上', async () => {
    const fixture = await mount();
    const el: HTMLElement = fixture.nativeElement;

    // 三种节点各渲染一张卡：根 + 2 个子空间 + 1 个设备 + 1 个服务
    expect(el.querySelectorAll('.node-card.kind-space').length).toBe(3);
    expect(el.querySelectorAll('.node-card.kind-device').length).toBe(1);
    expect(el.querySelectorAll('.node-card.kind-service').length).toBe(1);

    // 5 个节点、4 条父子边（sp1→sp2、sp1→sp3、sp1→d1、d1→sv1）
    const nodes = el.querySelectorAll('.tree-node');
    expect(nodes.length).toBe(5);
    expect(el.querySelectorAll('.tree-links path').length).toBe(4);

    // 位置是**绑上去的**，不是布局引擎算的。4 不写死具体像素（那是 layout.spec 的事），
    // 只要求「有 left/top、并且是 px」—— 漏了绑定的话卡片会全叠在画布左上角，
    // 而画布尺寸、曲线端点都还是对的，光看「渲染出来了」发现不了。
    for (const node of Array.from(nodes)) {
      expect((node as HTMLElement).style.left).toMatch(/^\d+px$/);
      expect((node as HTMLElement).style.top).toMatch(/^\d+px$/);
    }

    // 画布尺寸跟着布局走（不然卡片会被裁在外面的滚动区里）
    const board = inner(fixture).layout()!;
    const canvas = el.querySelector<HTMLElement>('.tree-canvas')!;
    expect(canvas.style.width).toBe(`${board.w}px`);
    expect(canvas.style.height).toBe(`${board.h}px`);
  });

  it('连线层不接指针，免得挡住卡片', async () => {
    const fixture = await mount();
    const el: HTMLElement = fixture.nativeElement;
    // 这一条不在样式表里断言，是因为它是**功能**而不是观感：svg 盖满整个画布，
    // 一旦接指针，整块画布都点不动卡片了
    const svg = el.querySelector('.tree-links')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelectorAll('.tree-links path').length).toBeGreaterThan(0);
  });

  it('根空间那张卡带 is-root 标记，别的空间不带', async () => {
    const fixture = await mount();
    const el: HTMLElement = fixture.nativeElement;

    const roots = el.querySelectorAll('.node-card.is-root');
    expect(roots.length).toBe(1);
    expect(roots[0].classList.contains('kind-space')).toBe(true);
    expect(roots[0].textContent).toContain('总部项目');
  });

  /* --------------------------------------------------------------------------------------------
   * 拖动开关
   * ------------------------------------------------------------------------------------------*/

  /*
   * 下面两条钉的是「**要进编辑布局才能拖**」。这条口径很容易在重构里被抹掉：
   * 把 `[cdkDragDisabled]` 拿去接别的判据、或者干脆删了，页面照常编译、照常渲染，
   * 只是读图的时候手一滑就把布局碰乱了 —— 那正是这一页最不该有的手感。
   *
   * 判据用的是 CDK 自己加的 `.cdk-drag-disabled` 类（它是 `CdkDrag` 的宿主绑定），
   * 所以这两条同时也在验证「CDK 真的接上了」—— 指令没生效的话，两个状态下都没有这个类。
   */
  it('看模式下卡片是死的：挂着 cdk-drag-disabled', async () => {
    const fixture = await mount();
    const el: HTMLElement = fixture.nativeElement;

    expect(inner(fixture).editing()).toBe(false);
    expect(el.querySelectorAll('.tree-node.cdk-drag').length).toBe(5);
    expect(el.querySelectorAll('.tree-node.cdk-drag-disabled').length).toBe(5);
  });

  it('进编辑态之后卡片能拖了：cdk-drag-disabled 全部摘掉', async () => {
    const fixture = await mount();
    const el: HTMLElement = fixture.nativeElement;

    inner(fixture).enterEdit();
    fixture.detectChanges();

    expect(inner(fixture).editing()).toBe(true);
    expect(el.querySelectorAll('.tree-node.cdk-drag').length).toBe(5);
    expect(el.querySelectorAll('.tree-node.cdk-drag-disabled').length).toBe(0);
  });

  /* --------------------------------------------------------------------------------------------
   * 悬浮按钮
   * ------------------------------------------------------------------------------------------*/

  it('看模式两颗悬浮按钮：全屏 + 编辑布局', async () => {
    const fixture = await mount();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('.float-actions')).toBeTruthy();
    expect(el.querySelector('.float-actions.float-edit')).toBeNull();
    expect(el.querySelectorAll('nz-float-button').length).toBe(2);
    expect(el.querySelectorAll('nz-float-button-group').length).toBe(0);
  });

  it('编辑态四颗：全屏 + 一组三颗（恢复默认 / 退出编辑 / 保存布局）', async () => {
    const fixture = await mount();
    const el: HTMLElement = fixture.nativeElement;

    inner(fixture).enterEdit();
    fixture.detectChanges();

    expect(el.querySelector('.float-actions.float-edit')).toBeTruthy();
    // 全屏那颗**不进组**，两个模式下位置相同；组里三颗
    expect(el.querySelectorAll('nz-float-button').length).toBe(4);
    expect(el.querySelector('nz-float-button-group')!.querySelectorAll('nz-float-button').length).toBe(3);

    /*
     * 退出编辑那颗必须**套在壳里**。这不是排版口味：`nz-float-button` 与 `nz-popconfirm`
     * 各声明了一个公开名都叫 `nzIcon` 的输入，写在同一个元素上会被两个指令同时收到，
     * 气泡那头会去解析不存在的 `close-fill` 并抛 IconNotFoundError（修订（十八）踩过）。
     * 把气泡挂到外面的 span 上之后，两个 `nzIcon` 各归各的。
     */
    const confirm = el.querySelector('.float-actions .float-confirm')!;
    expect(confirm).toBeTruthy();
    expect(confirm.querySelectorAll('nz-float-button').length).toBe(1);
  });

  /* --------------------------------------------------------------------------------------------
   * 拖动 → 草稿
   * ------------------------------------------------------------------------------------------*/

  /*
   * 这是这一轮的主角：拖父卡片，**整支跟着走**。
   *
   * 坐标怎么累加在 `project.tree.layout.spec.ts` 里逐条钉着，这里钉的是**接线**：
   * 指针位移有没有从 `cdkDragMoved` 走到布局上、松手有没有落进草稿。
   * 少了任何一段，卡片都会「拖不动」或者「松手弹回去」，而这两种都不会抛异常。
   */
  it('拖父卡片：整支跟着走，而且松手才入草稿', async () => {
    const fixture = await mount();
    const api = inner(fixture);

    const before = {
      root: posOf(fixture, 'space:sp1'),
      child: posOf(fixture, 'space:sp2'),
      grand: posOf(fixture, 'service:sv1'),
    };

    api.enterEdit();
    const source = { data: { key: 'space:sp1' } } as unknown as CdkDragStart<GraphNode>['source'];
    api.dragStarted({ source } as CdkDragStart<GraphNode>);

    // 拖动**中**：指针才走了一半，子孙就已经在跟着走了（不是松手才跳一下）
    api.dragMoved({ distance: { x: 100, y: 40 } } as CdkDragMove<GraphNode>);
    expect(api.draggingKey()).toBe('space:sp1');
    expect(posOf(fixture, 'space:sp1')).toEqual({ x: before.root.x + 100, y: before.root.y + 40 });
    expect(posOf(fixture, 'space:sp2')).toEqual({ x: before.child.x + 100, y: before.child.y + 40 });
    expect(posOf(fixture, 'service:sv1')).toEqual({ x: before.grand.x + 100, y: before.grand.y + 40 });

    // 拖动中**草稿还是干净的** —— 中途松手 / 按 Esc 都不会留下半截状态
    expect(api.draft()).toEqual({});

    api.dragEnded();
    expect(api.draggingKey()).toBe('');
    expect(api.draft()).toEqual({ 'space:sp1': { dx: 100, dy: 40 } });
  });

  it('拖叶子只动它自己那一支', async () => {
    const fixture = await mount();
    const api = inner(fixture);

    const rootBefore = posOf(fixture, 'space:sp1');
    const siblingBefore = posOf(fixture, 'space:sp3');

    api.enterEdit();
    drag(fixture, 'space:sp2', 60, 20);

    expect(posOf(fixture, 'space:sp2')).toEqual({ x: 280 + 60, y: 24 + 20 });
    // 别的枝不在它的祖先链上，一格都不动
    expect(posOf(fixture, 'space:sp1')).toEqual(rootBefore);
    expect(posOf(fixture, 'space:sp3')).toEqual(siblingBefore);
  });

  /*
   * 拖出去又拖回来**不算改过**。偏移表是稀疏的（没摆过就不在表里），松手时留下一个
   * `{dx: 0, dy: 0}` 会让「退出编辑」白弹一次确认 —— 用户看到的是
   * 「我什么都没动，它却问我未保存的修改要不要丢」。
   */
  it('拖回原位不留零值偏移，也就不算改过', async () => {
    const fixture = await mount();
    const api = inner(fixture);

    api.enterEdit();
    // 拖出去 (120, 80)，再原路拖回来 —— 第二次拖动的位移要**抵消掉已有那一份**，
    // 于是最终的绝对偏移是 (0, 0)，而不是「指针没动」
    drag(fixture, 'space:sp2', 120, 80);
    expect(api.dirty()).toBe(true);

    drag(fixture, 'space:sp2', -120, -80);
    expect(api.draft()).toEqual({});
    expect(api.dirty()).toBe(false);
    expect(posOf(fixture, 'space:sp2')).toEqual({ x: 280, y: 24 });
  });

  /*
   * 卡片不许被拖出画板。画布原点是固定的（见 `project.tree.layout.ts` 的文件头），
   * 跑到负坐标就是被滚动容器裁掉 —— 拖出去的东西既看不见也拖不回来。
   *
   * 夹取按**整支**算：拖动是整支刚性平移，只夹被拖那一张的话，往上拖根卡片时
   * 整棵树会从画布顶上冒出去。
   */
  it('不许拖出画板：往左上顶到边界就停住', async () => {
    const fixture = await mount();
    const api = inner(fixture);

    api.enterEdit();
    // 服务卡是叶子，这一支只有它自己；不计自己偏移时它在 (536, 240)
    drag(fixture, 'service:sv1', -9999, -9999);

    expect(posOf(fixture, 'service:sv1')).toEqual({ x: 0, y: 0 });
    expect(api.draft()).toEqual({ 'service:sv1': { dx: -536, dy: -240 } });
  });

  it('拖根卡片时，边界按整棵树算 —— 整支都不会冒出画布', async () => {
    const fixture = await mount();
    const api = inner(fixture);

    api.enterEdit();
    /*
     * 根这一支就是整棵树，所以边界取的是**整棵树**的 min：最左是根自己 (24, …)，
     * 最上是「1 号楼」(…, 24) ⇒ 上下左右各自只剩 PAD 那 24px 可走。
     * 只按根自己那一张算的话（它的 y 是 132），往上能走 132 —— 而那时兄弟卡片
     * 已经被顶到画布外面去了。
     */
    drag(fixture, 'space:sp1', -9999, -9999);
    expect(api.draft()).toEqual({ 'space:sp1': { dx: -24, dy: -24 } });

    // 整支一起被顶住：没有哪张卡跑到负坐标上去
    for (const key of ['space:sp1', 'space:sp2', 'space:sp3', 'device:d1', 'service:sv1']) {
      const p = posOf(fixture, key);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('一张已经摆过的卡片再被碰一下，不会跳回自动位置', async () => {
    const fixture = await mount();
    const api = inner(fixture);

    api.enterEdit();
    drag(fixture, 'space:sp2', 100, 50);
    expect(posOf(fixture, 'space:sp2')).toEqual({ x: 280 + 100, y: 24 + 50 });

    // 第二次拖动：位移要**加在已有偏移上**，而不是从 0 重来
    drag(fixture, 'space:sp2', 30, 10);
    expect(posOf(fixture, 'space:sp2')).toEqual({ x: 280 + 130, y: 24 + 60 });
    expect(api.draft()).toEqual({ 'space:sp2': { dx: 130, dy: 60 } });
  });

  /* --------------------------------------------------------------------------------------------
   * 拖动之后：谁压在谁上面
   * ------------------------------------------------------------------------------------------*/

  /*
   * 「卡片有可能会消失」—— 用户报的两个问题之二，而且是最唬人的那个。
   *
   * 卡片是**扁平一层**、按 DFS 顺序渲染的：都没设 `z-index` 的时候，压在谁上面由 DOM 顺序
   * 说话，也就是**排在后面的那张压住前面的**。拖动中 CDK 会给被拖那张加 `.cdk-drag-dragging`
   * （样式表里抬到别的卡之上），松手这个类就摘掉了 —— 落点压在别的卡上时，被压的那张如果
   * 恰好排得靠后，用户看到的就是「我刚拖的那张卡不见了」。
   *
   * 修法是编辑态里把**最后碰过的那一支**一直抬着（`.is-raised`）。下面两条钉的是
   * 这条状态**什么时候在、什么时候必须不在**：它只活在编辑态里。出了编辑态还抬着，
   * 就是同一张卡莫名其妙浮在别人上面，而且那份视觉与保存下来的布局对不上。
   */
  it('松手之后，那张卡留在连线与别的卡之上（is-raised）', async () => {
    const fixture = await mount();
    const el: HTMLElement = fixture.nativeElement;
    const api = inner(fixture);

    api.enterEdit();
    fixture.detectChanges();
    // 刚进编辑态谁都没碰过，一张都不该抬着
    expect(el.querySelectorAll('.tree-node.is-raised').length).toBe(0);

    api.dragStarted({ source: { data: { key: 'space:sp2' } } as unknown as CdkDragStart<GraphNode>['source'] } as CdkDragStart<GraphNode>);
    fixture.detectChanges();
    expect(cardOf(fixture, 'space:sp2').classList.contains('is-dragging')).toBe(true);

    api.dragMoved({ distance: { x: 40, y: 8 } } as CdkDragMove<GraphNode>);
    api.dragEnded();
    fixture.detectChanges();

    // 松手：拖动那一档摘掉（它只该在指针按着的时候在），但**抬着的那一档留着**
    const card = cardOf(fixture, 'space:sp2');
    expect(card.classList.contains('is-dragging')).toBe(false);
    expect(card.classList.contains('is-raised')).toBe(true);
    expect(el.querySelectorAll('.tree-node.is-raised').length).toBe(1);
  });

  /*
   * 抬的是**一整支**，不是被抓住的那一张。
   *
   * 拖动是整支跟着走，所以落到别人身上时跟着挪过去的还有子孙 —— 只抬被抓住的那张，
   * 子孙照样被 DFS 序靠后的卡盖住，用户那边的症状（「我的卡不见了」）一点没变。
   *
   * 这条是**桩页面上量出来的**，不是推出来的：`onto` 那个场景（把「2 层」拖到「地下车库」上）
   * 里被盖住的正是子卡 `dev:em7`，而它爹好好地抬在最上面。
   */
  it('抬起来的是整支：拖父卡片，子孙跟着一起抬', async () => {
    const fixture = await mount();
    const el: HTMLElement = fixture.nativeElement;
    const api = inner(fixture);

    api.enterEdit();
    drag(fixture, 'device:d1', 30, 20);

    // d1 → sv1：两支都抬着，别的一张都不抬
    expect(el.querySelectorAll('.tree-node.is-raised').length).toBe(2);
    expect(cardOf(fixture, 'device:d1').classList.contains('is-raised')).toBe(true);
    expect(cardOf(fixture, 'service:sv1').classList.contains('is-raised')).toBe(true);
    expect(cardOf(fixture, 'space:sp1').classList.contains('is-raised')).toBe(false);
  });

  it('收起的那一支不算数：收起的分支里的卡不在画布上，也就不必抬', async () => {
    const fixture = await mount();
    const el: HTMLElement = fixture.nativeElement;
    const api = inner(fixture);

    api.enterEdit();
    // 收起 d1 那一支（它下面只有 sv1）
    cardOf(fixture, 'device:d1').querySelector<HTMLButtonElement>('.node-toggle')!.click();
    fixture.detectChanges();

    drag(fixture, 'device:d1', 10, 10);

    expect(el.querySelectorAll('.tree-node.is-raised').length).toBe(1);
    expect(cardOf(fixture, 'device:d1').classList.contains('is-raised')).toBe(true);
  });

  it('抬起来的那张卡，保存 / 退出编辑 / 看模式下都放下', async () => {
    const fixture = await mount();
    const el: HTMLElement = fixture.nativeElement;
    const api = inner(fixture);

    // 保存：写盘、退出编辑态 —— 抬着的那一档跟着一起放下
    api.enterEdit();
    drag(fixture, 'space:sp2', 40, 8);
    api.saveLayout();
    fixture.detectChanges();
    expect(api.editing()).toBe(false);
    expect(el.querySelectorAll('.tree-node.is-raised').length).toBe(0);

    /*
     * 退出编辑：同样要放下。这条单独钉是因为它走的是另一个方法 —— 只清 `editing` 而忘了清
     * `raised` 的话，那张卡的键会一直留到下一次进编辑态（`enterEdit` 会清，但那时已经晚了：
     * 中间这一整段时间 `raisedKeys` 是空集合，看着是对的，直到用户再进来点一下别的卡）。
     */
    api.enterEdit();
    drag(fixture, 'space:sp3', -20, 30);
    expect(el.querySelectorAll('.tree-node.is-raised').length).toBe(1);
    api.cancelEdit();
    fixture.detectChanges();
    expect(el.querySelectorAll('.tree-node.is-raised').length).toBe(0);

    // 换项目（reload）也放下：上一棵树里那张卡的键在新树里可能压根不存在
    api.enterEdit();
    drag(fixture, 'space:sp2', 12, 12);
    api.reload('sp1');
    fixture.detectChanges();
    expect(el.querySelectorAll('.tree-node.is-raised').length).toBe(0);

    /*
     * 最后一道闸：抬不抬**只认编辑态**。上面三条路径都在退编辑态时顺手清了 `raised`，
     * 所以它们绿了也说明不了这道闸在不在 —— 这里直接把键塞进 `raised`（看模式下），
     * 断言一张卡都不抬。它挡的是「哪天某条退出口忘了清」：那种情况下卡片仍不该浮起来。
     */
    api.raised.set('space:sp2');
    fixture.detectChanges();
    expect(api.editing()).toBe(false);
    expect(el.querySelectorAll('.tree-node.is-raised').length).toBe(0);
  });

  /* --------------------------------------------------------------------------------------------
   * 拖动：夹进「看得见的那块板」
   * ------------------------------------------------------------------------------------------*/

  /*
   * 上一组的「顶到边界就停住」夹的是**画布原点**，那在 jsdom 里是唯一的边界 ——
   * 因为 `getBoundingClientRect()` 在 jsdom 里一律返回 0×0，`visibleBounds()` 每次都走
   * `UNBOUNDED` 那条兜底。也就是说：**可视区夹取在 jsdom 里永远不会生效**，
   * 光靠拖动用例是钉不住它的 —— 把 `visibleBounds` 整个删掉，上面那些用例照样全绿。
   *
   * 所以这里把两个壳的矩形**钉死**：`#boardScroll` 与 `#board` 的 `getBoundingClientRect`
   * 换成一份真的矩形，让「量矩形 → 换算到画布坐标 → 夹取」整条线跑起来。
   */
  it('拖到看得见的那块板以外就停住 —— 停的是可视边缘，不是画布边缘', async () => {
    const fixture = await mount();
    const el: HTMLElement = fixture.nativeElement;
    const api = inner(fixture);

    api.enterEdit();
    /*
     * 视口 1024×768（jsdom 默认），滚动壳只占左上角 700×500、画布原点与它重合。
     * 于是「看得见的那块板」在画布坐标里就是 (0,0)–(700,500) —— 比画布小得多，
     * 夹取一定会咬住。取这两个数是为了**比窗口小**，那样 `Math.min(s.right, innerWidth)`
     * 那一步接不上力，断言里可以写死 700 / 500 而不必去问窗口多大。
     */
    stubRect(el.querySelector('.tree-scroll')!, { left: 0, top: 0, width: 700, height: 500 });
    stubRect(el.querySelector('.tree-canvas')!, { left: 0, top: 0, width: 2000, height: 2000 });

    drag(fixture, 'space:sp2', 9999, 9999);

    // sp2 是叶子，这一支只有它自己：右下两条边正好贴住可视区的右下角
    expect(posOf(fixture, 'space:sp2')).toEqual({ x: 700 - NODE_W, y: 500 - NODE_H });
    expect(api.draft()).toEqual({ 'space:sp2': { dx: 700 - NODE_W - 280, dy: 500 - NODE_H - 24 } });
  });

  it('可视区比整支还小的时候，退回只夹被拖那一张卡', async () => {
    const fixture = await mount();
    const el: HTMLElement = fixture.nativeElement;
    const api = inner(fixture);

    api.enterEdit();
    // 一条 300×200 的缝：整棵树（横跨 3 层、几百像素宽）不可能塞进去，
    // 夹整支会得到 lo > hi 这种无解的区间，所以退回夹**被拖的那一张**（永远有解）
    stubRect(el.querySelector('.tree-scroll')!, { left: 0, top: 0, width: 300, height: 200 });
    stubRect(el.querySelector('.tree-canvas')!, { left: 0, top: 0, width: 2000, height: 2000 });

    drag(fixture, 'space:sp1', 9999, 9999);

    /*
     * 断言写成**贴住右下角**而不是「小于 300」：后者在「退回分支没实现」时**照样会绿** ——
     * 夹整支会得到 `hi = 300 - 整棵树的右缘` 这么个负数，根卡片于是被甩到 `x = -388`，
     * 那当然也「小于 300」。真正区分两条分支的，是**手里那张卡在不在缝里**：
     * 一边是贴住右下角（100, 112），一边是远远跑到画布外。
     */
    expect(posOf(fixture, 'space:sp1')).toEqual({ x: 300 - NODE_W, y: 200 - NODE_H });
  });

  /* --------------------------------------------------------------------------------------------
   * 编辑态：恢复默认 / 退出编辑 / 保存布局
   * ------------------------------------------------------------------------------------------*/

  it('恢复默认只清草稿，还得点保存才生效', async () => {
    const fixture = await mount();
    const api = inner(fixture);

    api.enterEdit();
    drag(fixture, 'space:sp2', 100, 50);
    api.saveLayout(); // 先存下一份，好让「恢复默认」有东西可恢复

    api.enterEdit();
    expect(posOf(fixture, 'space:sp2')).toEqual({ x: 280 + 100, y: 24 + 50 });

    api.resetLayout();
    expect(api.draft()).toEqual({});
    expect(posOf(fixture, 'space:sp2')).toEqual({ x: 280, y: 24 });
    // 留在编辑态：这是一次「换个起点」，用户多半还要接着调
    expect(api.editing()).toBe(true);
    // 但**还没落盘** —— 刷新一下就回来了
    expect(JSON.parse(originalLocalStorage.getItem(STORAGE_KEY)!)).toEqual({ 'space:sp2': { dx: 100, dy: 50 } });
  });

  it('退出编辑：草稿整个丢掉，回到落盘那份', async () => {
    const fixture = await mount();
    const api = inner(fixture);

    api.enterEdit();
    drag(fixture, 'space:sp2', 100, 50);
    api.cancelEdit();

    expect(api.editing()).toBe(false);
    expect(api.draft()).toEqual({});
    expect(api.dirty()).toBe(false);
    expect(posOf(fixture, 'space:sp2')).toEqual({ x: 280, y: 24 });
  });

  it('保存布局写进浏览器，重新挂一次还在', async () => {
    const fixture = await mount();
    const api = inner(fixture);

    api.enterEdit();
    drag(fixture, 'space:sp2', 100, 50);
    expect(api.dirty()).toBe(true);
    api.saveLayout();

    expect(api.editing()).toBe(false);
    expect(api.dirty()).toBe(false);

    // 真的写进 localStorage 了（而不是只改了内存里那一份）
    expect(JSON.parse(originalLocalStorage.getItem(STORAGE_KEY)!)).toEqual({ 'space:sp2': { dx: 100, dy: 50 } });

    // 重新挂一次 = 刷新页面：位置要读回来
    const again = await mount();
    expect(posOf(again, 'space:sp2')).toEqual({ x: 280 + 100, y: 24 + 50 });
  });

  it('没改过时点保存不写盘', async () => {
    const fixture = await mount();
    inner(fixture).enterEdit();
    inner(fixture).saveLayout();

    expect(originalLocalStorage.getItem(STORAGE_KEY)).toBeNull();
    // 没改过就不该退出编辑 —— 那颗按钮本来就该是灰的
    expect(inner(fixture).editing()).toBe(true);
  });

  /*
   * 存不进去的时候（隐私模式、站点数据被禁）**不能装作存好了**。
   *
   * 这一条钉的是「先认了这次保存」那种写法：界面退出编辑、按钮变灰，用户以为布局记下了，
   * 刷新之后才发现全没了 —— 那是最难查的一类「丢数据」。正确的做法是留在编辑态，
   * 让用户可以再点一次。
   */
  it('浏览器禁用了本地存储：不认这次保存，留在编辑态', async () => {
    breakStorage();
    const fixture = await mount();
    const api = inner(fixture);

    api.enterEdit();
    drag(fixture, 'space:sp2', 100, 50);
    api.saveLayout();

    expect(api.editing()).toBe(true);
    expect(api.dirty()).toBe(true);
  });

  /*
   * 摆过的位置是**按项目分开存**的。混了的话换个项目会看到上一个项目的摆法 ——
   * 而两棵树的节点键（`space:<id>`）通常不一样，混起来就是一堆认不出来的偏移，
   * 页面看起来像是「布局坏了」。
   */
  it('位置按项目分键，认不出来的键会被丢掉', async () => {
    originalLocalStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ 'space:sp2': { dx: 100, dy: 50 }, 'space:不存在': { dx: 5, dy: 5 } }),
    );
    const fixture = await mount();

    // 认得出来的那个生效
    expect(posOf(fixture, 'space:sp2')).toEqual({ x: 280 + 100, y: 24 + 50 });
    // 认不出来的那个不影响画布尺寸（它要是被算进去，画布会莫名变宽）
    expect(inner(fixture).layout()!.nodes.length).toBe(5);
  });

  it('存着的东西不是合法 JSON 就当没摆过', async () => {
    originalLocalStorage.setItem(STORAGE_KEY, '这不是 JSON');
    const fixture = await mount();

    expect(inner(fixture).layout()!.nodes.length).toBe(5);
    expect(posOf(fixture, 'space:sp2')).toEqual({ x: 280, y: 24 });
    expect(inner(fixture).dirty()).toBe(false);
  });

  /* --------------------------------------------------------------------------------------------
   * 收起 / 展开
   * ------------------------------------------------------------------------------------------*/

  it('收起一个节点：那一支的卡片与曲线整排消失，展开标记翻转', async () => {
    const fixture = await mount();
    const el: HTMLElement = fixture.nativeElement;

    // 树顶那张的收起按钮（DOM 顺序 = 布局顺序 = DFS，第一张就是根）
    const toggle = el.querySelector<HTMLButtonElement>('.tree-node .node-toggle')!;
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    toggle.click();
    fixture.detectChanges();

    // 根下面 4 个节点全没了：2 个子空间 + 1 个设备 + 挂在设备下的 1 个服务
    expect(el.querySelectorAll('.tree-node').length).toBe(1);
    expect(el.querySelectorAll('.tree-links path').length).toBe(0);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.tree-node').length).toBe(5);
    expect(el.querySelectorAll('.tree-links path').length).toBe(4);
  });

  /* --------------------------------------------------------------------------------------------
   * 只读 / 取数
   * ------------------------------------------------------------------------------------------*/

  /*
   * 下面两条钉的是**这一页是只读的**。它们不是「顺手多写的断言」：
   * 卡片上那些动作链接是继承来的成员（父类里一个不少），哪天有人觉得「顺手把这几个链接
   * 加回来吧」，页面照常编译、照常渲染，只有这两条会红。
   */
  it('卡片上没有动作链接，也没有时间', async () => {
    const fixture = await mount();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelectorAll('.node-actions').length).toBe(0);
    expect(el.querySelectorAll('.node-time').length).toBe(0);
    // 三种节点都渲染出来了，但一张卡里都没有 <a>
    expect(el.querySelectorAll('.node-card').length).toBeGreaterThan(0);
    expect(el.querySelectorAll('.node-card a').length).toBe(0);
  });

  /*
   * isAdmin 那两趟**与表格页一致**（本轮定的口径），所以进来就是三趟。这条用例钉的是
   * 「一趟不多、一趟不少」，以及**后面几轮变更检测不再重打** ——
   *
   * 这条曾经是反着写的（那时这一页不加载 admin 上下文，断言只有 `getSpaceGraph` 一趟），
   * 本轮按你的口径改成加载，于是**反过来钉**：多打一趟说明 `loadAdminContext` 被塞进了
   * 某个每轮都会跑的地方（computed / 模板调用），那是每次变更检测都发请求。
   */
  it('进去打三趟取数：空间图 + isAdmin 那两趟，且之后不再重打', async () => {
    const matrix = TestBed.inject(MatrixService) as unknown as Record<string, () => unknown>;
    const called: string[] = [];
    for (const name of ['getSpaceGraph', 'getSpace', 'listAccesses']) {
      const original = matrix[name];
      matrix[name] = () => {
        called.push(name);
        return original();
      };
    }

    const fixture = await mount();
    expect(called).toEqual(['getSpaceGraph', 'getSpace', 'listAccesses']);

    // 再跑两轮：桩是同步 of()，信号早就落定了，不该有任何新请求
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(called).toEqual(['getSpaceGraph', 'getSpace', 'listAccesses']);
  });

  /* ── 选中与信息框 ─────────────────────────────────────────────────────────
   *
   * 落位那套几何（贴右 / 翻左 / 两边界）在 `project.tree.layout.spec.ts` 里逐条钉着，
   * 这里钉的是**接线**：点下去选中没有、框渲染出来没有、框里是不是这张卡的信息、
   * 三种节点各自的按钮对不对、按不按 `isAdmin` 显隐、那几颗按钮点下去是不是真的
   * 走到了父类那几个写动作上。
   *
   * 框里的**字**不做逐字断言（要翻译、还会被省略号截断），只断言「有这几行」——
   * 也就是「这个框是这一类的框」，不是「文案长这样」。
   */

  /** 把当前账号变成项目管理员。`isAdmin` 的第一条分支就是「成员表里自己是 admin」 */
  function asAdmin(): void {
    const matrix = TestBed.inject(MatrixService) as unknown as Record<string, unknown>;
    matrix['listAccesses'] = () => of([{ userId: 'u1', role: 'admin' }]);
  }

  /** 点一下并跑一轮变更检测：真实浏览器里事件之后 Angular 就会刷一次 */
  function click(fixture: ComponentFixture<ProjectTreeViewComponent>, el: HTMLElement): void {
    el.click();
    fixture.detectChanges();
  }

  function panelOf(fixture: ComponentFixture<ProjectTreeViewComponent>): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.node-panel');
  }

  it('点一张卡：那张卡带上 is-selected，旁边弹出它的信息框', async () => {
    const fixture = await mount();
    const el: HTMLElement = fixture.nativeElement;

    // 没点之前：一张选中的都没有，也就没有框
    expect(el.querySelectorAll('.tree-node.is-selected').length).toBe(0);
    expect(panelOf(fixture)).toBeNull();

    click(fixture, cardOf(fixture, 'space:sp2'));

    expect(inner(fixture).selected()).toBe('space:sp2');
    expect(el.querySelectorAll('.tree-node.is-selected').length).toBe(1);
    // 选中的正好是点的那一张，不是「随便哪一张」
    expect(cardOf(fixture, 'space:sp2').classList.contains('is-selected')).toBe(true);

    const panel = panelOf(fixture)!;
    expect(panel).toBeTruthy();
    // 框里是这个空间的那几行（「有这几行」而不是逐字文案）
    const labels = Array.from(panel.querySelectorAll('.panel-label')).map((n) => n.textContent?.trim());
    expect(labels).toContain('空间代码');
    expect(labels).toContain('空间名称');
    // 抬头就是这张卡的名字（桩里的 `translate.instant` 是恒等函数，出来的是原文键）
    expect(panel.querySelector('.panel-name')!.textContent?.trim()).toBe('1 号楼');
  });

  it('点另一张卡：选中换过去，同时仍然只有一张被选中', async () => {
    const fixture = await mount();
    click(fixture, cardOf(fixture, 'space:sp2'));
    click(fixture, cardOf(fixture, 'device:d1'));

    expect(inner(fixture).selected()).toBe('device:d1');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.tree-node.is-selected').length).toBe(1);
    expect(cardOf(fixture, 'space:sp2').classList.contains('is-selected')).toBe(false);
  });

  it('再点同一张卡 = 取消，框跟着收掉', async () => {
    const fixture = await mount();
    click(fixture, cardOf(fixture, 'space:sp2'));
    expect(panelOf(fixture)).toBeTruthy();

    click(fixture, cardOf(fixture, 'space:sp2'));
    expect(inner(fixture).selected()).toBe('');
    expect(panelOf(fixture)).toBeNull();
  });

  it('点画布空白处收框', async () => {
    const fixture = await mount();
    click(fixture, cardOf(fixture, 'space:sp2'));

    const canvas = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.tree-canvas')!;
    click(fixture, canvas);

    expect(inner(fixture).selected()).toBe('');
    expect(panelOf(fixture)).toBeNull();
  });

  /*
   * 框自己身上的点击**不能**把框收掉 —— 那正是 `onCanvasClick` 判
   * `target === currentTarget` 而不是到处 `stopPropagation` 的原因。
   * 这条用例就是那个判据的哨兵：哪天有人图省事把判据去掉，点一下框里的空白处
   * 框就没了，而按钮会变得几乎点不中。
   */
  it('点框自己不会把框关掉', async () => {
    const fixture = await mount();
    click(fixture, cardOf(fixture, 'space:sp2'));

    click(fixture, panelOf(fixture)!.querySelector<HTMLElement>('.panel-fields')!);

    expect(inner(fixture).selected()).toBe('space:sp2');
    expect(panelOf(fixture)).toBeTruthy();
  });

  it('关闭按钮收框', async () => {
    const fixture = await mount();
    click(fixture, cardOf(fixture, 'space:sp2'));

    click(fixture, panelOf(fixture)!.querySelector<HTMLButtonElement>('.panel-close')!);

    expect(inner(fixture).selected()).toBe('');
    expect(panelOf(fixture)).toBeNull();
  });

  it('Esc 收框', async () => {
    const fixture = await mount();
    click(fixture, cardOf(fixture, 'space:sp2'));
    expect(panelOf(fixture)).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(inner(fixture).selected()).toBe('');
    expect(panelOf(fixture)).toBeNull();
  });

  /*
   * `aria-pressed` 是这颗标题按钮**唯一**能被读屏读出来的选中状态
   * （`.is-selected` 那种类名对读屏是不存在的）。axe 不管这条，但少了它
   * 「选中了哪张卡」对读屏用户就是不可知的 —— 所以单钉一条。
   */
  it('选中状态挂到了 aria-pressed 上，不只是一个类名', async () => {
    const fixture = await mount();
    const titleOf = (key: string) =>
      cardOf(fixture, key).querySelector<HTMLButtonElement>('.node-title')!.getAttribute('aria-pressed');

    expect(titleOf('space:sp2')).toBe('false');
    click(fixture, cardOf(fixture, 'space:sp2'));
    expect(titleOf('space:sp2')).toBe('true');
    expect(titleOf('space:sp3')).toBe('false');
  });

  /*
   * 落位的几何不变量，用**卡片自己绑在 DOM 上的那个 left** 去验 —— 不是拿
   * `panelSpot()` 再算一遍（那是纯函数那份用例的活，这里重算等于什么也没验）。
   *
   * 这一棵桩树正好把两种落位都凑齐了（数值见文件头那三个常量）：
   * 最左的根卡 x=24，右边放得下 → 贴右侧；最深的服务卡 x=536，右边顶出画布
   * 而左边装得下 → 翻到左侧。所以这条用例同时钉住了两个分支。
   */
  it('框贴在卡旁边：放得下贴右侧，放不下翻到左侧', async () => {
    const fixture = await mount();

    const geometry = (key: string) => {
      click(fixture, cardOf(fixture, key));
      const spot = inner(fixture).panel()!;
      const cardLeft = parseFloat(cardOf(fixture, key).style.left);
      const panelLeft = parseFloat(panelOf(fixture)!.style.left);
      return { spot, cardLeft, panelLeft };
    };

    // 根卡在最左边：右边整片空着，贴右侧
    const root = geometry('space:sp1');
    expect(root.spot.flipped).toBe(false);
    expect(root.panelLeft).toBe(root.cardLeft + NODE_W + PANEL_GAP);

    // 服务卡在第三层（最右）：右边装不下整只框，翻到左侧
    const deepest = geometry('service:sv1');
    expect(deepest.spot.flipped).toBe(true);
    expect(deepest.panelLeft + PANEL_W).toBe(deepest.cardLeft - PANEL_GAP);
    expect(panelOf(fixture)!.classList.contains('is-flipped')).toBe(true);

    // 翻过去之后仍然在画布左缘之内（翻成负数的那个分支不该发生在这里）
    expect(deepest.panelLeft).toBeGreaterThanOrEqual(0);
  });

  /*
   * 框伸出去的那一截要算进画布宽度 —— 不算的话它会顶在滚动壳的右边缘上被裁掉，
   * 而那一段**滚不到**（`canvasWithPanel` 的注释写了原因）。
   */
  it('框伸出画布时画布跟着变宽，高度不动', async () => {
    const fixture = await mount();
    const before = inner(fixture).canvasSize();
    expect(before).toEqual({ w: inner(fixture).layout()!.w, h: inner(fixture).layout()!.h });

    /*
     * 让画布变宽的是**「两边都放不下」**那一类卡，不是最左那张 ——
     * 最左的根卡（x=24）右边整片空着，框贴上去离画布右缘还有的是地方。
     *
     * 第二层那三张（x=280）才是：右边顶出去 12px（`right + PANEL_W` 比画布宽 12），
     * 左边又差 12px 才够翻（`left = -12`），于是**只能往右伸**。这正是 `panelSpot`
     * 里 `left >= 0` 那道闸放行的结果，也是 `canvasWithPanel` 存在的理由。
     */
    click(fixture, cardOf(fixture, 'space:sp2'));
    expect(inner(fixture).panel()!.flipped).toBe(false);

    const after = inner(fixture).canvasSize();
    expect(after.w).toBeGreaterThan(before.w);
    expect(after.h).toBe(before.h);
    // 伸出去的那一截正好被算进来了（差一点点都会被滚动壳右缘裁掉，而那段滚不到）
    const spot = inner(fixture).panel()!;
    expect(after.w).toBe(spot.x + PANEL_W + CANVAS_PAD);

    // 翻到左边的那张不占额外宽度：框落在画布里面了
    click(fixture, cardOf(fixture, 'service:sv1'));
    expect(inner(fixture).panel()!.flipped).toBe(true);
    expect(inner(fixture).canvasSize().w).toBe(inner(fixture).layout()!.w);
  });

  /* ── 用户看过之后提的两条改进 ──────────────────────────────────────────────
   *
   * 1. 框的标题能拖着走；
   * 2. 卡片在页面下方时，框的下面半截会被画布下缘吃掉。
   *
   * 落位那几条**纯函数**的口径在 `project.tree.layout.spec.ts` 里逐条钉着（下面有多少地方、
   * 不够时怎么往上长、拖完之后夹到哪）；这里钉的是**接线**：抓手指对了没有、位移进没进
   * computed、`max-height` 有没有真的绑到 DOM 上、换张卡会不会把上一个位移带过去。
   * ------------------------------------------------------------------------- */

  it('抓手是标题那一条，不是整条标题栏（关闭按钮不能开拖）', async () => {
    const fixture = await mount();
    click(fixture, cardOf(fixture, 'space:sp1'));

    const panel = panelOf(fixture)!;
    expect(panel.classList.contains('cdk-drag')).toBe(true);

    expect(panel.querySelector('.panel-name')!.classList.contains('cdk-drag-handle')).toBe(true);
    // 关闭按钮就在同一行里：抓手挂到 `.panel-head` 上的话，按关闭键会变成开拖
    expect(panel.querySelector('.panel-close')!.classList.contains('cdk-drag-handle')).toBe(false);
  });

  it('拖标题：框跟着走，卡片一动不动', async () => {
    const fixture = await mount();
    click(fixture, cardOf(fixture, 'space:sp1'));
    const before = inner(fixture).panel()!;
    const card = posOf(fixture, 'space:sp1');

    // 根卡片的框已经落在画布底缘（`y + maxH = board.h`），往下拖会被「底缘不压扁」夹住，
    // 所以往**上 / 右**拖才量得出「跟手」这回事；往下的那条夹取在下面那条用例里钉。
    dragPanel(fixture, 60, -40);

    const after = inner(fixture).panel()!;
    expect({ x: after.x - before.x, y: after.y - before.y }).toEqual({ x: 60, y: -40 });
    // 整只框落在（长过之后的）画布内 —— 用户要的「完整显示」，靠画布兜住框底
    expect(after.y + after.maxH).toBeLessThanOrEqual(inner(fixture).canvasSize()!.h);
    // 框是「贴在卡片旁边」的：挪开它**不该**把卡片一起带走（那是拖卡片那三个回调的活）
    expect(posOf(fixture, 'space:sp1')).toEqual(card);
    // DOM 上也确实动了 —— 只断言 API 的话，`[style.left]` 漏绑也能绿
    expect(parseFloat(panelOf(fixture)!.style.left)).toBe(after.x);
    expect(parseFloat(panelOf(fixture)!.style.top)).toBe(after.y);
  });

  it('拖到左上角会被夹住：抓手始终留在画布里，还能拖回来', async () => {
    const fixture = await mount();
    click(fixture, cardOf(fixture, 'space:sp1'));

    dragPanel(fixture, -9999, -9999);

    expect(inner(fixture).panel()).toMatchObject({ x: 0, y: 0 });
  });

  it('拖到右下角：整只框完整可见、`maxH` 全程不被压扁', async () => {
    const fixture = await mount();
    click(fixture, cardOf(fixture, 'space:sp1'));

    const before = inner(fixture).panel()!;
    dragPanel(fixture, 9999, 9999);

    const spot = inner(fixture).panel()!;
    const size = inner(fixture).canvasSize()!;
    // 拖到底之后：框还是完整的一只（maxH 原样），且左缘 / 顶缘都在画布内 ——
    // 哪怕它撑出了**基**画布，画布也已经在 `canvasSize()` 里长到兜住它，整只都够得着。
    expect(spot.maxH).toBe(before.maxH);
    expect(spot.x).toBeGreaterThanOrEqual(0);
    expect(spot.y).toBeGreaterThanOrEqual(0);
    expect(spot.x + PANEL_W).toBeLessThanOrEqual(size.w);
    expect(spot.y + spot.maxH).toBeLessThanOrEqual(size.h);
  });

  it('关掉框再选回来、或者换一张卡，位移都归零 —— 不带着上一个位置走', async () => {
    const fixture = await mount();
    const sp1 = cardOf(fixture, 'space:sp1');
    click(fixture, sp1);
    const auto = inner(fixture).panel()!;
    dragPanel(fixture, 60, 40);
    expect(inner(fixture).panel()!.x).toBe(auto.x + 60);

    // 换一张卡：新框按**它自己**的几何落位（这张卡会往右顶出画布，所以用
    // 「贴边间距」这条翻不翻都成立的关系来判，而不是写死一个 x）
    click(fixture, cardOf(fixture, 'space:sp3'));
    const other = inner(fixture).panel()!;
    const sp3 = posOf(fixture, 'space:sp3');
    const near = other.flipped ? sp3.x - PANEL_GAP - PANEL_W : sp3.x + NODE_W + PANEL_GAP;
    expect(other.x).toBe(near);
    expect(other.y + other.maxH).toBeLessThanOrEqual(inner(fixture).canvasSize()!.h);

    // 再选回来：落在自动位置，不是刚才拖到的那儿
    click(fixture, cardOf(fixture, 'space:sp3'));
    click(fixture, sp1);
    expect(inner(fixture).panel()).toMatchObject({ x: auto.x, y: auto.y });
  });

  it('每一张卡：框不绑 max-height，`height: auto` 内容多高框多高 —— 物理上没有内部滚动条', async () => {
    const fixture = await mount();
    const board = inner(fixture).layout()!;

    // 这条是「不出现内部滚动条」的回归钉子：框要是绑了 `max-height`（哪怕绑的正是内容高度），
    // 任何 1px 的测量/取整差（`border 1px + scrollHeight 和 border-box 差着边框那两像素`）都可能
    // 逼出一根「总有」的细滚动条。所以宁可**完全不绑**：框 `height: auto`，内容多高它多高，
    // **没有溢出的东西，滚动条就没有机会出现**。`maxH` 只进纯函数做落位记账（翻哪一侧 /
    // 拖到哪儿夹 / 画布长多高），不绑回 CSS 裁口。
    for (const node of board.nodes) {
      click(fixture, cardOf(fixture, node.key));
      const spot = inner(fixture).panel()!;

      expect(spot.maxH).toBeGreaterThan(0);
      expect(spot.y).toBeGreaterThanOrEqual(0);
      expect(spot.y + spot.maxH).toBeLessThanOrEqual(inner(fixture).canvasSize()!.h);
      // 不绑 `max-height`（也不写死 height）—— 没有裁口就没有溢出可控，内部滚动条无从诞生。
      const panel = panelOf(fixture)!;
      expect(panel.style.maxHeight).toBe('');
      expect(panel.style.height).toBe('');
    }
  });

  it('拖框不落盘：框的位置是「姿势」不是布局，刷新就没了', async () => {
    const fixture = await mount();
    click(fixture, cardOf(fixture, 'space:sp1'));
    dragPanel(fixture, 60, 40);

    // 卡片的偏移表动没动，是这一条要钉的东西 —— 拖动过程中一个字节都不该写进去
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(inner(fixture).dirty()).toBe(false);
    expect(inner(fixture).draft()).toEqual({});
  });

  it('三种节点各有自己的字段行与动作按钮', async () => {
    const fixture = await mount();
    const labelsOf = () =>
      Array.from(panelOf(fixture)!.querySelectorAll('.panel-label')).map((n) => n.textContent?.trim());

    click(fixture, cardOf(fixture, 'space:sp2'));
    expect(labelsOf()).toContain('设备数量');
    expect(labelsOf()).toContain('服务数量');

    click(fixture, cardOf(fixture, 'device:d1'));
    expect(labelsOf()).toContain('设备ID');
    expect(labelsOf()).toContain('状态');

    click(fixture, cardOf(fixture, 'service:sv1'));
    expect(labelsOf()).toContain('服务名称');
    expect(labelsOf()).toContain('依赖设备');
  });

  /*
   * 只读的那几颗（详情 / 历史 / 服务）**不看 isAdmin**：与表格页同一口径，
   * 它们本来就不是写操作。这里在**非管理员**下验，正好把「不要顺手给它们也加上
   * isAdmin」这条钉住。
   */
  it('非管理员：只读链接在，写操作一颗都不出现', async () => {
    const fixture = await mount();
    const buttonsOf = () =>
      Array.from(panelOf(fixture)!.querySelectorAll<HTMLElement>('.panel-actions > *')).map((n) =>
        n.textContent?.trim(),
      );

    click(fixture, cardOf(fixture, 'space:sp2'));
    expect(buttonsOf()).toEqual([]);

    click(fixture, cardOf(fixture, 'service:sv1'));
    expect(buttonsOf()).toEqual(['详情', '历史']);

    click(fixture, cardOf(fixture, 'device:d1'));
    expect(buttonsOf()).toEqual(['详情']);
  });

  it('管理员：三种框里的写操作都出来了', async () => {
    asAdmin();
    const fixture = await mount();
    const buttonsOf = () =>
      Array.from(panelOf(fixture)!.querySelectorAll<HTMLElement>('.panel-actions > *')).map((n) =>
        n.textContent?.trim(),
      );

    click(fixture, cardOf(fixture, 'space:sp2'));
    expect(buttonsOf()).toEqual(['添加设备', '添加子空间', '删除']);

    click(fixture, cardOf(fixture, 'service:sv1'));
    expect(buttonsOf()).toEqual(['详情', '历史', '删除']);

    /*
     * 设备那张里**没有「服务」**：它归 `showMapping` 管（DTU + 管理员两条都要），
     * 而桩里那台是 `urn:ox:acme:sensor`（`extractTypeName` 取第 4 段 = `sensor`），
     * 不是 DTU。这一条与 `/main/project` 表格页的守卫逐条对齐 ——
     * 那边也是「服务看 `showMapping`、调试看 `isAdmin`」，不是一刀切都按管理员。
     */
    click(fixture, cardOf(fixture, 'device:d1'));
    expect(buttonsOf()).toEqual(['详情', '调试', '删除']);
  });

  /*
   * 「点操作按钮，进入对应的功能实现」这条要求：树视图**脱离继承**后，那几颗按钮
   * 的功能是这一页自己本地实现的一份（与表格页口径一致，但没有父类可借）。所以这里
   * 验的是：这些方法确实存在于**这一页自己**的类上，而不是一路跑到某个父类上去。
   *
   * 桩里给的 `afterClose: of(true)` 等于用户点了「确认」，于是同步落到 `deleteSpace` 上。
   * 用到的 id 是**框里那张卡**的 id（`sp2`，一个没有子空间的空间 —— 有子空间的那条路
   * 会提前被拦下弹警告），传错了这条就红。
   */
  /*
   * 框里那几颗写操作按钮点下去，进的是**这一页自己**的实现 —— 连同确认对话框、提示文案、
   * 删完重新取数。这正是「可以参考 ProjectComponent 组件页面」那句话的落点：功能是同一个
   * 功能，树这一页按「三视图各自加载」的约定把表格页那批方法就地抄了一份。哪天这里少了
   * 一个同名方法，这条就红了 —— 那正是该被看见的一次分叉。
   */
  it('框里的写操作是这一页自己实现的一份，没有借父类', async () => {
    const fixture = await mount();
    const inst = fixture.componentInstance as unknown as Record<string, unknown>;

    expect(typeof inst['removeSpace']).toBe('function');
    expect(typeof inst['addDevice']).toBe('function');
    expect(typeof inst['addChildSpace']).toBe('function');
    expect(typeof inst['removeDevice']).toBe('function');
    expect(typeof inst['removeService']).toBe('function');
    // 只读的那两条也一样：服务详情 / 历史的链接口径与表格页同一份
    expect(typeof inst['serviceDetailLink']).toBe('function');
    expect(typeof inst['serviceHistoryLink']).toBe('function');
  });

  /*
   * 点下去**真的调到了那个方法上，且参数是框里这张卡**。
   *
   * 这里换掉实例上的方法再点，而不是让它一路跑到确认对话框里去 —— 不是因为那样测不出来，
   * 而是因为**跑不到**：`ProjectTreeViewComponent` 是独立组件，它自己 `imports` 的 `NzModalModule`
   * 会把 `NzModalService` 放在**组件注入器**上，压过测试模块里那份桩。于是组件手上是真货，
   * `TestBed.inject(NzModalService)` 拿到的才是桩 —— 两边不是同一个对象，
   * 「给桩记一笔看组件有没有调」这种写法在这里永远是空数组，一路跑下去只会撞进真对话框
   * （再去 new 一个真 `Location`，jsdom 下直接抛）。
   *
   * 在方法这一层验，钉住的正是模板那一句 `(click)="removeSpace(box.node.space!)"` 的接线：
   * 传的是**这张卡**的实体（`sp2`，不是根、不是邻居），也就够了。
   */
  it('点框里的删除：调的就是父类那个方法，传的是这张卡', async () => {
    asAdmin();
    const fixture = await mount();
    const inst = fixture.componentInstance as unknown as Record<string, unknown>;

    const removed: string[] = [];
    inst['removeSpace'] = (space: SpaceEntity) => {
      removed.push(space.id);
    };

    click(fixture, cardOf(fixture, 'space:sp2'));
    const removeBtn = Array.from(
      panelOf(fixture)!.querySelectorAll<HTMLButtonElement>('.panel-actions button'),
    ).find((b) => b.textContent?.trim() === '删除')!;
    expect(removeBtn).toBeTruthy();

    click(fixture, removeBtn);

    expect(removed).toEqual(['sp2']);
  });

  it('进编辑态清掉选中：框收掉，卡片回到未选中', async () => {
    const fixture = await mount();
    click(fixture, cardOf(fixture, 'space:sp2'));
    expect(panelOf(fixture)).toBeTruthy();

    inner(fixture).enterEdit();
    fixture.detectChanges();

    expect(inner(fixture).selected()).toBe('');
    expect(panelOf(fixture)).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.tree-node.is-selected').length).toBe(0);
  });

  it('编辑态里点卡片也不会选中：框不会飘到正拖着的地方，退出编辑态也不会冒出来', async () => {
    const fixture = await mount();
    inner(fixture).enterEdit();
    fixture.detectChanges();

    click(fixture, cardOf(fixture, 'space:sp2'));

    // 挡在 `select()` 里（不是挡在渲染条件里）—— 于是状态本身就没被写过，
    // 退出编辑态时也就没有一份「陈的选中」在等着冒出来
    expect(inner(fixture).selected()).toBe('');
    expect(panelOf(fixture)).toBeNull();

    inner(fixture).cancelEdit();
    fixture.detectChanges();
    expect(panelOf(fixture)).toBeNull();
  });

  it('换项目清掉选中：框不跟着上一个项目的键留在屏幕上', async () => {
    const fixture = await mount();
    click(fixture, cardOf(fixture, 'space:sp2'));
    expect(panelOf(fixture)).toBeTruthy();

    inner(fixture).reload('sp1');
    fixture.detectChanges();

    expect(inner(fixture).selected()).toBe('');
    expect(panelOf(fixture)).toBeNull();
  });
});
