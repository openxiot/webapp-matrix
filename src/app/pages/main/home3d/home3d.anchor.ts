import { DeviceEntity } from '../../../typedef/define/device/DeviceEntity';
import { ModelAnchor } from '../../../typedef/define/model/ModelAnchor';
import { SpaceEntity } from '../../../typedef/define/space/SpaceEntity';
import type { MarkerSpec, Vec3 } from './model3d.scene';

/**
 * 锚点数据模型的唯一权威。纯函数，不依赖 Angular，可单测。
 *
 * 三条规则在这里定死，别处不要再实现一遍：
 *
 * 1. **版本不符即失效**（{@link anchorIsValid}）—— 换了模型之后老坐标是无意义的，
 *    静默画到错误位置比不画难查得多，所以一律不渲染。
 * 2. **回退链**（{@link resolveDeviceAnchor}）—— 设备有自己的锚点用自己的，
 *    没有就落到所属空间的锚点。这让「给设备单独标点」变成纯增量：不标也已经在模型上了。
 * 3. **角标不重复计数**（{@link buildMarkers}）—— 单独标了点的设备不再计入
 *    所属空间的角标数字，否则会被数两遍。
 *
 * （「显示设备」打开后同一台设备会在自己位置上和所属空间标签下各出现一次，那是
 * 刻意的展开，不算违反第 3 条 —— 它管的是角标那个数。详见 {@link AnchorMarker}。）
 */

/** 模型标识。与 `public/3d/<id>/scene.glb` 的目录名一致 */
export const MODEL_ID = '001';

/**
 * 模型内容版本。
 *
 * ⚠️ **`scene.glb` 重新导出后必须递增这个值**（重跑 gltf-transform 管线就算）。
 * 同一个 URL 内容变了，坐标就会整体偏移 —— 靠它把老锚点判为失效。
 * 递增后所有已有锚点都需要重新标注，这是刻意的：宁可让人重标，也不画错位置。
 */
export const MODEL_REV = '001.1';

/**
 * 「显示设备」列表的**屏幕**行距（CSS 像素）。
 *
 * 同一个空间下的设备锚点全都落在空间那一个点上，而 CSS2D 默认把标签**中心**钉在
 * 投影点，不给偏移的话它们会完全重叠成一个。这个值比一个标签的高度（12px 字 +
 * 6px 上下内边距 + 边框 ≈ 26px）略大一点，正好一行挨着一行。
 *
 * 注意它是**屏幕**像素而不是模型坐标：无论镜头拉多近多远，行距都一样，
 * 不会被透视压扁或撑开。
 */
export const DEVICE_ROW_PX = 26;

/**
 * 锚点是否可用：模型对得上、版本对得上、坐标是有限数。
 *
 * 三条缺一不可。坐标那条不是为了防手滑 —— 锚点是可以直接往库里塞的，
 * 一个 NaN 会让 `localToWorld` 之后的 CSS2DObject 落在 `translate(NaNpx, ...)`，
 * 标签凭空消失且毫无线索，不如在这里就不认它。
 */
export function anchorIsValid(
  anchor: ModelAnchor | null | undefined,
  model: string = MODEL_ID,
  rev: string = MODEL_REV,
): boolean {
  return (
    !!anchor && anchor.model === model && anchor.rev === rev && isFiniteAnchor(anchor)
  );
}

/** 坐标是否都是有限数 */
export function isFiniteAnchor(anchor: ModelAnchor): boolean {
  return Number.isFinite(anchor.x) && Number.isFinite(anchor.y) && Number.isFinite(anchor.z);
}

/**
 * 由点击到的模型局部坐标造一个锚点。
 *
 * `model` / `rev` 在这里盖章，**调用方没有机会传错** —— 它俩必须永远等于
 * 当前加载的那个模型，一旦能由调用方指定，就会有人把 `001.1` 的坐标写成 `001.0`。
 */
export function makeAnchor(
  point: Vec3,
  ry?: number,
  model: string = MODEL_ID,
  rev: string = MODEL_REV,
): ModelAnchor {
  const anchor = new ModelAnchor();
  anchor.model = model;
  anchor.rev = rev;
  anchor.x = point.x;
  anchor.y = point.y;
  anchor.z = point.z;
  if (ry !== undefined) {
    anchor.ry = ry;
  }
  return anchor;
}

/** 空间的有效锚点（未标注或已失效都返回 null） */
export function spaceAnchor(
  space: SpaceEntity,
  model: string = MODEL_ID,
  rev: string = MODEL_REV,
): ModelAnchor | null {
  return anchorIsValid(space.anchor, model, rev) ? space.anchor : null;
}

/** 设备自己的有效锚点（不看空间） */
export function deviceAnchor(
  device: DeviceEntity,
  model: string = MODEL_ID,
  rev: string = MODEL_REV,
): ModelAnchor | null {
  return anchorIsValid(device.anchor, model, rev) ? device.anchor : null;
}

/** 锚点应该落在哪儿，以及它是从哪一级来的（用于提示「位置来自所属空间」） */
export interface ResolvedAnchor {
  anchor: ModelAnchor;
  from: 'device' | 'space';
  /** from === 'space' 时，是哪个空间提供的 */
  space?: SpaceEntity;
}

/**
 * 回退链：设备自己的锚点优先，没有就落到它所属空间的锚点。
 * 返回 `null` 表示这台设备在模型上无处安放。
 */
export function resolveDeviceAnchor(
  device: DeviceEntity,
  spaceById: Map<string, SpaceEntity>,
  model: string = MODEL_ID,
  rev: string = MODEL_REV,
): ResolvedAnchor | null {
  const own = deviceAnchor(device, model, rev);
  if (own) {
    return { anchor: own, from: 'device' };
  }

  const spaceId = device.space?.spaceId;
  const space = spaceId ? spaceById.get(spaceId) : undefined;
  const inherited = space ? spaceAnchor(space, model, rev) : null;
  return inherited ? { anchor: inherited, from: 'space', space } : null;
}

/** 空间在树里的可读路径，如 `园区 / A栋 / 3层` */
export function spacePath(space: SpaceEntity, spaceById: Map<string, SpaceEntity>): string {
  const names: string[] = [];
  for (const id of space.ancestors ?? []) {
    const name = spaceById.get(id)?.name;
    if (name) {
      names.push(name);
    }
  }
  names.push(space.name);
  return names.join(' / ');
}

/** 场景里的一个标记，连带它代表的业务对象 */
export interface AnchorMarker {
  spec: MarkerSpec;
  kind: 'space' | 'device';
  /**
   * 标记自身的唯一键，与 `spec.id` 相同。
   *
   * ⚠️ **设备标记上它不一定等于 did。** 「显示设备」打开后，一台自己也有锚点的
   * 设备会同时出现在两处（模型上它自己的位置 + 所属空间标签下的列表），两处位置
   * 不同、必须是两个标记；而引擎 `setMarkers` 是按 id 做增删的，同 id 会被合并成
   * 一个。所以空间下那份的 id 由 {@link spaceDeviceKey} 生成：`空间id@did`。
   *
   * 要设备 did 请用 {@link AnchorMarker.deviceId}，不要用这个。
   */
  id: string;
  /**
   * 设备标记才有：真正的设备 did。
   *
   * 所有写库操作（`setDeviceAnchor` / `clearDeviceAnchor`）只认它 —— 拿 `id` 去写
   * 会静默地把锚点存到一台不存在的设备上，而且看不出错。
   */
  deviceId?: string;
  /**
   * 设备标记才有：位置是来自设备自己的锚点，还是借的所属空间的。
   *
   * 菜单据此分岔：借来的只能「在模型上单独标点」，自己的才能「调整位置 / 取消标注」。
   */
  anchorFrom?: 'device' | 'space';
  name: string;
  /** 这个标记所属的空间 id（设备标记也有；空间标记就是它自己） */
  spaceId: string;
}

/**
 * 「显示设备」列表里，设备挂在所属空间标签下的那个标记 id。
 *
 * 为什么不直接用 did：一台自己也有锚点的设备会同时在两处，而引擎按 id 增删、
 * 同 id 会被合并成一个。加个空间前缀，两处就是两个互不相干的标记。
 */
export function spaceDeviceKey(spaceId: string, did: string): string {
  return `${spaceId}@${did}`;
}

export interface BuildMarkersOptions {
  /** 设备显示名解析。默认用 did —— 只在拿不到更好的名字时才这么显示 */
  deviceName?: (device: DeviceEntity) => string;
  /** 当前选中的标记 id */
  activeId?: string;
  /**
   * 「显示空间」：空间标签（连带角标）画不画。
   *
   * **默认 `true`** —— 空间标签本来就是一直显示的，这个开关给的是「关掉」的能力。
   * 默认值之所以放在「画」这一边，是因为本函数的职责是把数据算成标记，
   * **藏起来是调用方的选择**；应用层那个「默认勾选」归 `Home3dData.showSpaces` 管。
   *
   * 为 false 时**只有 pass ③ 不画**：pass ① 和 ④ 都不受影响 —— 两层是独立的，
   * 空间标签关掉后，空间下那串设备名照常出现，只是头顶少了空间名。见 {@link buildMarkers}。
   */
  showSpaces?: boolean;
  /**
   * 「显示设备」：把每个空间下的设备逐个列成标签，而不是只出一个角标数。
   *
   * 默认 false。为 false 时本函数的行为与加这个开关之前**完全一致**。
   *
   * ⚠️ 它**只管「把角标展开成列表」这一件事** —— 自己单独标过点的设备（pass ①）
   * 一直显示，这个开关和「显示空间」都管不着。两颗开关因此是**不对称**的，
   * 这是刻意的：pass ① 的行为在加「显示设备」之前就存在，本次不动它。
   */
  showDevices?: boolean;
  model?: string;
  rev?: string;
}

/**
 * 把空间图算成一组标记。
 *
 * 四趟，各归各的开关管：
 *
 * | 趟 | 画什么 | 谁管 |
 * |---|---|---|
 * | ① | 自己单独标过点的设备 | **一直显示**，两颗开关都管不着 |
 * | ② | 折叠计数 | 不给谁看，只为 ③ 的角标备数 |
 * | ③ | 空间标签（含角标） | `showSpaces` |
 * | ④ | 空间标签下的设备列表 | `showDevices`（位置借 ③ 的锚点） |
 *
 * ⚠️ 两个开关**不是**一对对称的图层切换，这是刻意的：① 的行为在加这两个开关之前
 * 就存在，一直没动过；`showDevices` 只管「把角标展开成列表」这一件事。
 * 想「整张画面上一个标签都没有」是做不到的 —— 自己标过点的设备总在。
 *
 * 角标只算没有自己锚点的那些设备，所以「所有角标之和 + 独立设备标记数 = 设备总数」，
 * 一台设备不会在角标里被数两遍。
 *
 * ⚠️ 但 pass ④ 的展开列表是**全部**设备，所以一台自己也有锚点的设备会同时出现在
 * 自己的位置上和所属空间标签下 —— 这是刻意的（「这个空间里有哪些设备」要一个完整
 * 答案，不能因为它在模型上另有位置就不算这个空间的）。两处的 `id` 不同、`deviceId`
 * 相同，理由见 {@link AnchorMarker}。
 */
export function buildMarkers(
  spaces: SpaceEntity[],
  devices: DeviceEntity[],
  options: BuildMarkersOptions = {},
): AnchorMarker[] {
  const model = options.model ?? MODEL_ID;
  const rev = options.rev ?? MODEL_REV;
  const activeId = options.activeId ?? '';
  const showSpaces = options.showSpaces ?? true;
  const showDevices = options.showDevices ?? false;
  const deviceName = options.deviceName ?? ((device: DeviceEntity) => device.did);

  const markers: AnchorMarker[] = [];
  const placed = new Set<string>();

  // ① 自己标了点的设备
  for (const device of devices) {
    const anchor = deviceAnchor(device, model, rev);
    if (!anchor) {
      continue;
    }
    placed.add(device.did);
    const name = deviceName(device);
    markers.push({
      kind: 'device',
      id: device.did,
      deviceId: device.did,
      anchorFrom: 'device',
      name,
      spaceId: device.space?.spaceId ?? '',
      spec: {
        id: device.did,
        point: toVec3(anchor),
        label: name,
        kind: 'device',
        tone: device.did === activeId ? 'active' : 'default',
      },
    });
  }

  // ② 没有自己点位的设备，按所属空间折叠计数。
  // 只为 ③ 的角标备数 —— 「显示空间」关掉时这一趟是白算的，但它只是个 Map，
  // 不值得为省它给下面加一层分支。
  const collapsed = new Map<string, number>();
  for (const device of devices) {
    if (placed.has(device.did)) {
      continue;
    }
    const spaceId = device.space?.spaceId;
    if (spaceId) {
      collapsed.set(spaceId, (collapsed.get(spaceId) ?? 0) + 1);
    }
  }

  // ③ 标了点的空间
  for (const space of spaces) {
    const anchor = spaceAnchor(space, model, rev);
    // ⚠️ 这一跳**与 showSpaces 无关**：锚点是 ③④ 共同的**位置来源**，
    // 空间标签不画的时候，④ 那串设备名仍然要落在它这个点上。
    if (!anchor) {
      continue;
    }
    const point = toVec3(anchor);

    // ③ 空间标签本身。⚠️「显示空间」只管这一趟，**管不着 ④** ——
    // 两层是独立的：空间标签关掉后，那串设备名照常出现，只是头顶少了空间名。
    if (showSpaces) {
      const count = collapsed.get(space.id) ?? 0;
      markers.push({
        kind: 'space',
        id: space.id,
        name: space.name,
        spaceId: space.id,
        spec: {
          id: space.id,
          point,
          label: space.name,
          // 角标和展开的列表说的不是同一件事（角标只数没自己锚点的，列表是全部），
          // 一起显示就会出现「角标 3、下面列了 7 台」的矛盾。列出来了就不要角标。
          badge: !showDevices && count > 0 ? String(count) : undefined,
          kind: 'space',
          tone: space.id === activeId ? 'active' : 'default',
        },
      });
    }

    // ④ 「显示设备」：这个空间下的每一台都单出一行
    if (!showDevices) {
      continue;
    }
    let row = 0;
    for (const device of devices) {
      if (device.space?.spaceId !== space.id) {
        continue;
      }
      row += 1;
      const name = deviceName(device);
      const id = spaceDeviceKey(space.id, device.did);
      markers.push({
        kind: 'device',
        id,
        deviceId: device.did,
        // 自己也有锚点的那些，两处都出现；这里标明白位置是从哪来的
        anchorFrom: placed.has(device.did) ? 'device' : 'space',
        name,
        spaceId: space.id,
        spec: {
          id,
          point,
          label: name,
          kind: 'device',
          /*
           * 全都叠在空间这一个点上，靠屏幕像素偏移一行行往下排开。
           *
           * ⚠️ 行号**从 1 起算、与 showSpaces 无关**：第 0 格是留着给空间标签的位置。
           * 所以「显示空间」关掉时第一行上面会空一格 —— 这是刻意留的，行号是「设备在
           * 这个空间列表里的序号」，不该因为空间标签恰好没画就变；否则勾一下开关
           * 整串列表会跳 26px。
           */
          offset: { x: 0, y: row * DEVICE_ROW_PX },
          tone: id === activeId ? 'active' : 'default',
        },
      });
    }
  }

  return markers;
}

function toVec3(anchor: { x: number; y: number; z: number }): Vec3 {
  return { x: anchor.x, y: anchor.y, z: anchor.z };
}
