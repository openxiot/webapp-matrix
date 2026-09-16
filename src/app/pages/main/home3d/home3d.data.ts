import { Injectable, computed, inject, signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Observable } from 'rxjs';
import { DeviceEntity } from '../../../typedef/define/device/DeviceEntity';
import { MoveDeviceRequest } from '../../../typedef/define/device/MoveDeviceRequest';
import { ModelAnchor } from '../../../typedef/define/model/ModelAnchor';
import { SpaceEntity } from '../../../typedef/define/space/SpaceEntity';
import { MatrixService } from '../../../service/matrix.service';
import { DeviceDisplayService } from '../../../service/device.display.service';
import { MainI18nService } from '../../../service/i18n.service';
import { type AnchorMarker, buildMarkers } from './home3d.anchor';

/**
 * 3D 页面的数据面：空间图 + 锚点读写 + 设备搬运。
 *
 * **`@Injectable()` 不带 `providedIn: 'root'`** —— 由 `Home3dComponent` 的 `providers` 提供，
 * 生命周期跟着页面走。否则离开路由后整棵空间树还留在根注入器里，
 * 换来换去几个项目就是几份全量图驻留内存。
 */
@Injectable()
export class Home3dData {
  private readonly matrix = inject(MatrixService);
  private readonly display = inject(DeviceDisplayService);
  private readonly msg = inject(NzMessageService);
  private readonly i18n = inject(MainI18nService);

  readonly spaces = signal<SpaceEntity[]>([]);
  readonly devices = signal<DeviceEntity[]>([]);
  /** 首次拉图进行中（写操作后的静默重载不算） */
  readonly loading = signal(false);

  /** 当前项目根空间 id。空 = 还没选项目 */
  readonly rootId = signal('');

  readonly spaceById = computed(() => new Map(this.spaces().map((space) => [space.id, space])));

  /** 设备 did → 设备。标记菜单要按 did 反查 */
  readonly deviceById = computed(() => new Map(this.devices().map((device) => [device.did, device])));

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
   * 「显示设备」：把每个空间下的设备逐个列成标签，而不是只出一个角标数。
   *
   * 放在这里而不是组件里，是因为它要喂给下面的 `markers()` —— 那是本类的 computed。
   * 只活在本次会话里，刷新回到关闭。
   *
   * ⚠️ 与 `showSpaces` **不是**一对对称的图层切换：它只管「把角标展开成列表」，
   * 自己单独标过点的设备不受它管。
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
        this.msg.error(e?.message ?? e);
      },
    });
  }

  /** 重新拉一次当前项目的图。写完之后用 */
  reload(): void {
    this.load(this.rootId());
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
