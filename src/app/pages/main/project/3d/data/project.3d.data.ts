import { Injectable, computed, inject, signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Observable } from 'rxjs';
import { DeviceEntity } from '../../../../../typedef/define/device/DeviceEntity';
import { MoveDeviceRequest } from '../../../../../typedef/define/device/MoveDeviceRequest';
import { ModbusAlarmList, applyHandledAlarm } from '../../../../../typedef/define/modbus/ModbusAlarm';
import { ModelAnchor } from '../../../../../typedef/define/model/ModelAnchor';
import { GenericService } from '../../../../../typedef/define/service/GenericService';
import { SpaceEntity } from '../../../../../typedef/define/space/SpaceEntity';
import { MatrixService } from '../../../../../service/matrix.service';
import { ModbusService } from '../../../../../service/modbus.service';
import { DeviceDisplayService } from '../../../../../service/device.display.service';
import { MainI18nService } from '../../../../../service/i18n.service';
import { type AnchorMarker, buildMarkers } from '../anchor/project.3d.anchor';

/**
 * 查告警的起点。**语义上等于「不限时间」**。
 *
 * 之所以不传 `0`：`getAlarms` 的文档写明「`from` 必填，后端拒无起点的查询」，
 * 而 `0` 算不算「给了起点」得看后端的实现（`!= null` 还是真值判断），是它一句话的事。
 * 给一个明确早于任何一条告警的时刻，就没有这层解释空间了 —— 代价只是它看上去像魔法数。
 *
 * 2000-01-01 UTC：早于本项目所有部署，也早于任何一台设备可能上报的时刻。
 */
const ALARM_FROM = Date.UTC(2000, 0, 1);

/**
 * 一次取多少条。够铺一屏还多；超出的部分后端用 `truncated` 说话，页面照实提示
 * （见模板里那句「异常记录超过上限，只列出最近的部分」）。
 */
const ALARM_LIMIT = 100;

/**
 * 3D 页面的数据面：空间图 + 锚点读写 + 设备搬运。
 *
 * **`@Injectable()` 不带 `providedIn: 'root'`** —— 由 `Project3dViewComponent` 的 `providers` 提供，
 * 生命周期跟着页面走。否则离开路由后整棵空间树还留在根注入器里，
 * 换来换去几个项目就是几份全量图驻留内存。
 */
@Injectable()
export class Project3dData {
  private readonly matrix = inject(MatrixService);
  private readonly modbus = inject(ModbusService);
  private readonly display = inject(DeviceDisplayService);
  private readonly msg = inject(NzMessageService);
  private readonly i18n = inject(MainI18nService);

  readonly spaces = signal<SpaceEntity[]>([]);
  readonly devices = signal<DeviceEntity[]>([]);
  /**
   * 这个项目下的全部服务（精简视图）。
   *
   * 本页自己不用它，纯粹是**告警要归位**才留的：一条告警只带 `serviceId`，得靠
   * `服务 → 服务所在空间 → 空间名` 这条链才说得清「在哪儿出事了」（见 project.3d.alarm.ts）。
   * `getSpaceGraph` 本来就把 `services` 带回来了，接住它**不加任何请求**。
   */
  readonly services = signal<GenericService[]>([]);
  /** 首次拉图进行中（写操作后的静默重载不算） */
  readonly loading = signal(false);

  /** 当前项目根空间 id。空 = 还没选项目 */
  readonly rootId = signal('');

  readonly spaceById = computed(() => new Map(this.spaces().map((space) => [space.id, space])));

  /** 设备 did → 设备。标记菜单要按 did 反查 */
  readonly deviceById = computed(() => new Map(this.devices().map((device) => [device.did, device])));

  /** 服务 id → 服务。告警靠它找到自己属于哪个空间 */
  readonly serviceById = computed(() => new Map(this.services().map((service) => [service.id, service])));

  /**
   * 当前项目里**未处理**的告警清单。`null` = 还没取过（开关关着就是 null）。
   *
   * 由组件在勾上「显示告警」时调 {@link loadAlarms} 取一次，之后**不再自动变新** ——
   * 不轮询、也没有刷新按钮（这是刻意的取舍：全站还没有一个定时器，加它得一并管好
   * 销毁与「正好在处理某一条」的竞争）。关掉开关时组件会把它置回 null。
   */
  readonly alarms = signal<ModbusAlarmList | null>(null);

  /**
   * 告警取数中。
   *
   * **与页面那个 `loading` 分开**：那一个是模型的加载态，管着整屏遮罩。告警取不到
   * 不该把模型那层搅乱，模型照常能看、能转。
   */
  readonly alarmsLoading = signal(false);

  /**
   * 告警取数失败的提示，空串 = 没失败。
   *
   * 在左列里显示一行，**不弹 message**：这一列是挂在墙上的，弹一串提示出来既没人点
   * 也挡模型。但也不能不显示 —— 那样用户会以为「没有告警」，那是错的。
   */
  readonly alarmsError = signal('');

  /** 当前高亮的标记 id。点开标记菜单时设上，用来把它画成选中态 */
  readonly activeMarkerId = signal('');

  /**
   * 「显示空间」：空间标签（连带角标）画不画。
   *
   * **默认 true** —— 空间标签本来就是一直显示的，这个开关给的是「关掉」的能力：
   * 关掉之后是一张干净的模型，用来把模型本身给人看。
   *
   * ⚠️ 它管的是空间标签这一层，**管不着自己单独标过点的设备** —— 那些设备有自己的
   * 锚点、不挂在任何空间标签下，一直显示。想「一个标签都没有」是做不到的。
   * 详见 `buildMarkers` 上面那张分工表。
   */
  readonly showSpaces = signal(true);

  /**
   * 「显示设备」：把这个空间里**还没单独标点**的设备逐个列成标签，而不是只出一个角标数。
   *
   * 放在这里而不是组件里，是因为它要喂给下面的 `markers()` —— 那是本类的 computed。
   * 只活在本次会话里，刷新回到关闭。
   *
   * ⚠️ 与 `showSpaces` **不是**一对对称的图层切换：它只管「把角标展开成列表」，
   * 自己单独标过点的设备不受它管（那些设备本来就画在自己的坐标上）。
   */
  readonly showDevices = signal(false);

  /**
   * 场景标记。空间图、设备显示名、当前选中项、两个图层开关任一变化都会重算 ——
   * 设备名是异步补的，所以这个 computed 在名字到位后自己会再算一遍。
   */
  readonly markers = computed<AnchorMarker[]>(() =>
    buildMarkers(this.spaces(), this.devices(), {
      deviceName: (device) => this.display.name(device),
      activeId: this.activeMarkerId(),
      showSpaces: this.showSpaces(),
      showDevices: this.showDevices(),
    }),
  );

  /**
   * 拉当前项目的整张空间图。
   *
   * `rootId` 为空时**直接清空、不发请求** —— 项目没选中的时候 `GET .../graph/`
   * 是个没有意义的地址，打过去只会换来一个 404 或者一棵别的树。
   */
  load(rootId: string): void {
    this.rootId.set(rootId);
    if (!rootId) {
      this.spaces.set([]);
      this.devices.set([]);
      this.services.set([]);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.matrix.getSpaceGraph(rootId).subscribe({
      next: (graph) => {
        // 快速连点几个项目时，先发的请求可能后到。认 rootId 不认先来后到，
        // 否则页面会显示上一个项目的树。
        if (this.rootId() !== rootId) {
          return;
        }
        this.spaces.set(graph.spaces);
        this.devices.set(graph.devices);
        // `?? []` 不能省：老后端 / 异常响应里可能没有这个键。它只喂告警的归位，
        // 空着最多是告警框少显示一个空间名，不该让整页崩在一条 undefined 上
        this.services.set(graph.services ?? []);
        this.loading.set(false);
        // 名字是异步补的，标记和列表会自己重算
        this.display.resolve(graph.devices);
      },
      error: (e) => {
        if (this.rootId() !== rootId) {
          return;
        }
        this.loading.set(false);
        this.spaces.set([]);
        this.devices.set([]);
        this.services.set([]);
        this.msg.error(e?.message ?? e);
      },
    });
  }

  /** 重新拉一次当前项目的图。写完之后用 */
  reload(): void {
    this.load(this.rootId());
  }

  /* ----------------------------------------------------------------------------------------------
   * 告警。取数与处理都只动本页左列，不碰空间图
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 取一次当前项目里**未处理**的告警。
   *
   * `handled: false` 就是「只看未处理的」—— 后端把「不传」与「传 false」当两件事，
   * 传 null 会连已处理的一起回来。
   *
   * `from` 与 `limit` 见上面两个常量的注释。**不传 `to`**（= 到现在）。
   *
   * 形状照抄 `load()`：`subscribe` + 同一个 `rootId` 过期守卫。切项目时先发的那个请求
   * 可能后到，不守的话左列会显示上一个项目的告警 —— 而且这种错**看起来完全正常**，
   * 只是内容不对。
   */
  loadAlarms(): void {
    const rootId = this.rootId();
    if (!rootId) {
      // 没选项目就没有可查的地址。loading 也一并复位 —— 上一次请求可能是给另一个
      // 项目发的，那个响应回来时会被下面的守卫丢掉，不复位就永远停在 true 上
      this.alarms.set(null);
      this.alarmsError.set('');
      this.alarmsLoading.set(false);
      return;
    }

    this.alarmsLoading.set(true);
    this.alarmsError.set('');
    this.modbus
      .getAlarms(rootId, ALARM_FROM, null, { handled: false, limit: ALARM_LIMIT })
      .subscribe({
        next: (list) => {
          if (this.rootId() !== rootId) {
            return;
          }
          this.alarms.set(list);
          this.alarmsLoading.set(false);
        },
        error: (e: unknown) => {
          if (this.rootId() !== rootId) {
            return;
          }
          this.alarms.set(null);
          this.alarmsLoading.set(false);
          this.alarmsError.set((e as { message?: string })?.message ?? String(e));
        },
      });
  }

  /**
   * 处理一条告警（回执，不是改配置）。成功后**就地换掉那一行、不重取整列**。
   *
   * 「就地换」走 {@link applyHandledAlarm}（告警页同一个函数）：那一行被换成后端回的新行，
   * 于是 `handled` 变成 true，左列就不再画它了（见 `buildAlarmCards`）—— **框的消失是
   * 数据变了的结果，不是展示层记了一笔「这条摘掉了」**，所以切语言、重算 computed
   * 都不会把它放回来。
   *
   * 不重取整列有两个理由：**重取慢**，而且会把用户没碰过的那些框也一起换掉
   * （顺序变了、框会跳）。**也不走 `write()`** —— 那个是锚点写入的收尾器，成功后
   * `reload()` 重拉整张空间图；处理告警一个字都没改空间图，走它等于白拉一次全量图。
   *
   * `onDone` **成功与失败都会调一次**，组件拿它复位按钮的转圈。做成回调而不是让组件
   * 自己订阅：`msg` 与 `i18n` 都在本类里，提示该和 `write()` 一个出处。
   */
  handleAlarm(id: string, onDone: () => void): void {
    const spaceId = this.rootId();
    if (!spaceId || !id) {
      onDone();
      return;
    }
    this.modbus.handleAlarm(spaceId, id).subscribe({
      // 这里**不做 rootId 过期守卫**：这个动作与「当前是哪个项目」无关，切了项目也该让
      // 按钮停止转圈。真处理到别处去了后端自己会拒（告警不属于该空间子树时它不认）
      next: (updated) => {
        const list = this.alarms();
        if (list) {
          this.alarms.set(applyHandledAlarm(list, updated));
        }
        this.msg.success(this.i18n.translate.instant('操作成功'));
        onDone();
      },
      error: (e: unknown) => {
        this.msg.error((e as { message?: string })?.message ?? String(e));
        onDone();
      },
    });
  }

  /* ----------------------------------------------------------------------------------------------
   * 锚点。四条都走专用端点，只动 anchor 一个字段 —— 不经过 `PUT /space/one`
   * 那个「整体替换」的接口，所以改名字之类的操作不会误伤锚点
   * ----------------------------------------------------------------------------------------------*/

  /** 给空间标一个位置 */
  setSpaceAnchor(spaceId: string, anchor: ModelAnchor): void {
    this.write(this.matrix.setSpaceAnchor(spaceId, anchor), '标注成功');
  }

  /** 取消空间的位置标注 */
  clearSpaceAnchor(spaceId: string): void {
    this.write(this.matrix.clearSpaceAnchor(spaceId), '已取消标注');
  }

  /** 给设备单独标一个位置。它比所属空间的锚点优先 */
  setDeviceAnchor(spaceId: string, did: string, anchor: ModelAnchor): void {
    this.write(this.matrix.setDeviceAnchor(spaceId, did, anchor), '标注成功');
  }

  /** 清掉设备自己的位置，让它退回所属空间的锚点 */
  clearDeviceAnchor(spaceId: string, did: string): void {
    this.write(this.matrix.clearDeviceAnchor(spaceId, did), '已取消标注');
  }

  /** 把一批设备搬进某个空间。空间图刷新后这些设备的落点就跟着变了 */
  moveDevices(spaceId: string, dids: string[]): void {
    if (dids.length === 0) {
      return;
    }
    const req = new MoveDeviceRequest();
    req.spaceId = spaceId;
    req.dids = dids;
    this.write(this.matrix.moveDevices(req), '绑定成功');
  }

  /**
   * 新建一个子空间，并立刻把它标在模型上。
   *
   * 两步必须串行 —— 拿到新空间的 id 才能挂锚点。第二步失败会留下一个「建好了但没标注」
   * 的空空间：不理想，但比反过来（锚点指着一个不存在的空间）好收拾得多，
   * 用户回到这个位置再标一次就行。
   */
  createSpaceWithAnchor(space: SpaceEntity, anchor: ModelAnchor): void {
    this.matrix.createSpace(space).subscribe({
      next: (created) => {
        if (!created?.id) {
          // 没有 id 就挂不上锚点。别静默当成成功 —— 用户会以为标好了
          this.msg.error(this.i18n.translate.instant('空间已创建，但没有返回空间 ID，标注未生效'));
          this.reload();
          return;
        }
        this.setSpaceAnchor(created.id, anchor);
      },
      error: (e: unknown) => {
        this.msg.error((e as { message?: string })?.message ?? String(e));
      },
    });
  }

  /**
   * 所有写操作的统一出口：成功提示 + 重拉空间图，失败提示。
   *
   * 重拉而不是就地改内存里的树：一次绑定会连带改掉设备的 `space` / `parentId` /
   * `rootId`，手工同步这几处太容易漏，第一期先老老实实重拉（实测慢了再说）。
   */
  private write(request: Observable<void>, okText: string): void {
    request.subscribe({
      next: () => {
        this.msg.success(this.i18n.translate.instant(okText));
        this.reload();
      },
      error: (e: unknown) => {
        // 权限不足等后端拒绝在这里落地。非管理员点「绑定设备」走的就是这条路
        this.msg.error((e as { message?: string })?.message ?? String(e));
      },
    });
  }
}
