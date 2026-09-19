import { DeviceEntity } from '../../../../../typedef/define/device/DeviceEntity';
import { ModelAnchor } from '../../../../../typedef/define/model/ModelAnchor';
import { SpaceEntity } from '../../../../../typedef/define/space/SpaceEntity';
import type { MarkerSpec, Vec3 } from '../scene/project.3d.scene';

/**
 * 锚点数据模型的唯一权威。纯函数，不依赖 Angular，可单测。
 *
 * 四条规则在这里定死，别处不要再实现一遍：
 *
 * 1. **版本不符即失效**（{@link anchorIsValid}）—— 换了模型之后老坐标是无意义的，
 *    静默画到错误位置比不画难查得多，所以一律不渲染。
 * 2. **位置的回退链**（{@link buildMarkers}）—— 设备自己标了点就画在自己的坐标上；
 *    **没有就跟着所属空间走**（挂在空间标签下）。所以「给设备单独标点」是纯增量动作，
 *    不标也在模型上找得到它。
 * 3. **一台设备只出现一次**（{@link buildMarkers}）—— 自己标过点的那些**不再**列进
 *    所属空间的设备列表，否则同一台设备在画面上有两处、用户分不清哪个是真的。
 * 4. **角标说的是「这个空间拥有几台」**（{@link buildMarkers}）—— 数的是
 *    {@link devicesInSpace} 那批，与设备有没有单独标点**无关**。这和菜单的
 *    「设备 N 台」、悬停面板的「设备数量」、空间设备弹窗是同一个口径，
 *    四处必须永远一致。（角标只在「显示设备」关着时才画，理由见下。）
 *
 * 「哪个设备算在这个空间里」也只有一份实现，就是 {@link devicesInSpace} ——
 * 它曾经在三个地方各写了一遍（角标计数、悬停面板、空间设备弹窗），
 * 而口径一分家就会出现「角标说 4、菜单说 7」这种没人能解释的数字。
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
 * 列表里那几行**都落在空间这一个点**上（它们没有自己的锚点，位置是借的），
 * 而 CSS2D 默认把标签**中心**钉在投影点，不给偏移的话它们会完全重叠成一个。
 * 这个值比一个标签的高度（12px 字 + 6px 上下内边距 + 边框 ≈ 26px）略大一点，
 * 正好一行挨着一行。
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

/**
 * 这个空间**拥有**的全部设备。
 *
 * 「哪个设备算在这个空间里」**只有这一份实现** —— 角标、空间菜单的「设备 N 台」、
 * 悬停信息面板的「设备数量」、空间设备弹窗，四处说的必须是同一批设备。
 *
 * ⚠️ 它回答的是**归属**，与「设备画在哪儿」是两件事：位置归
 * {@link anchorIsValid} / {@link resolveDeviceAnchor} 那条链管。所以一台单独标过点、
 * 已经画在别处的设备**照样算在这个空间的拥有数里**。
 */
export function devicesInSpace(devices: DeviceEntity[], spaceId: string): DeviceEntity[] {
  return devices.filter((device) => device.space?.spaceId === spaceId);
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
   * ⚠️ **设备标记上它不一定等于 did。** 「显示设备」列在空间标签下的那些设备的 id
   * 由 {@link spaceDeviceKey} 生成：`空间id@did`，为的是与设备**自己那份**标记
   * （id 就是 did）永不撞脸 —— 引擎 `setMarkers` 是按 id 做增删的，同 id 会被
   * 合并成一个。
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
   * 与 {@link buildMarkers} 的趟次一一对应（① 一律 `'device'`、③ 一律 `'space'`），
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
 * 为什么不直接用 did：引擎 `setMarkers` 按 id 增删，**同 id 会被合并成一个**。
 * 今天「列在空间下」与「自己单独标了点」是互斥的（见 {@link buildMarkers} 规则 3），
 * 所以不加前缀也不会撞；但这个前缀让**列表行**与**设备自己的标记**永远是两个
 * 命名空间 —— 将来哪一趟又画了两处，也不会被引擎悄悄并成一个。
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
   * **藏起来是调用方的选择**；应用层那个「默认勾选」归 `Project3dData.showSpaces` 管。
   *
   * 为 false 时**只有 pass ② 不画**：pass ① 和 ③ 都不受影响 —— 两层是独立的，
   * 空间标签关掉后，空间下那串设备名照常出现，只是头顶少了空间名。见 {@link buildMarkers}。
   */
  showSpaces?: boolean;
  /**
   * 「显示设备」：把这个空间**还没单独标点**的设备逐个列成标签，而不是只出一个角标数。
   *
   * 默认 false。为 false 时本函数的行为与加这个开关之前**完全一致**（都是只出角标）。
   *
   * ⚠️ 它**只管「把角标展开成列表」这一件事** —— 自己单独标过点的设备（pass ①）
   * 一直显示，这个开关和「显示空间」都管不着。两颗开关因此是**不对称**的，
   * 这是刻意的：pass ① 的行为在加「显示设备」之前就存在，一直不动它。
   */
  showDevices?: boolean;
  model?: string;
  rev?: string;
}

/**
 * 把空间图算成一组标记。
 *
 * 三趟，各归各的开关管：
 *
 * | 趟 | 画什么 | 谁管 |
 * |---|---|---|
 * | ① | 自己单独标过点的设备（在**自己的坐标**上） | **一直显示**，两颗开关都管不着 |
 * | ② | 空间标签（含角标） | `showSpaces`（角标还要 `!showDevices`，见下） |
 * | ③ | 空间标签下的设备列表（**位置借 ② 的锚点**） | `showDevices` |
 *
 * ⚠️ 两个开关**不是**一对对称的图层切换，这是刻意的：① 的行为在加这两个开关之前
 * 就存在，一直没动过；`showDevices` 只管「把角标展开成列表」这一件事。
 * 想「整张画面上一个标签都没有」是做不到的 —— 自己标过点的设备总在。
 *
 * **一台设备只会落到 ① 或 ③ 之一**（判据都是「自己有没有有效锚点」，共用 `placed`），
 * 所以画面上它**正好出现一次**：标过点的在自己坐标上，没标过的跟着所属空间走。
 * 于是「某空间下的行数 + 该空间里独立标记数 = 这个空间拥有的设备数」。
 *
 * 角标数的是 {@link devicesInSpace} 那批 —— **拥有数**，与谁单独标过点无关，
 * 因为用户问的是「这个空间里有几台设备」。它和菜单的「设备 N 台」、悬停面板的
 * 「设备数量」、空间设备弹窗永远是同一个数。
 *
 * ⚠️ 但角标只在 `!showDevices` 时画：列表展开的时候角标还挂着，就会出现
 * 「角标 7、下面只列了 4 行」（另外 3 台画在自己坐标上）这种看着像坏了的画面。
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

  // ① 自己标了点的设备，画在自己的坐标上
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

  // ② 标了点的空间
  for (const space of spaces) {
    const anchor = spaceAnchor(space, model, rev);
    // ⚠️ 这一跳**与 showSpaces 无关**：锚点是 ②③ 共同的**位置来源**，
    // 空间标签不画的时候，③ 那串设备名仍然要落在它这个点上。
    if (!anchor) {
      continue;
    }
    const point = toVec3(anchor);

    // ② 空间标签本身。⚠️「显示空间」只管这一趟，**管不着 ③** ——
    // 两层是独立的：空间标签关掉后，那串设备名照常出现，只是头顶少了空间名。
    if (showSpaces) {
      const count = devicesInSpace(devices, space.id).length;
      markers.push({
        kind: 'space',
        id: space.id,
        name: space.name,
        spaceId: space.id,
        spec: {
          id: space.id,
          point,
          label: space.name,
          badge: !showDevices && count > 0 ? String(count) : undefined,
          kind: 'space',
          tone: space.id === activeId ? 'active' : 'default',
        },
      });
    }

    // ③ 「显示设备」：这个空间里**还没单独标点**的每一台单出一行
    if (!showDevices) {
      continue;
    }
    let row = 0;
    for (const device of devices) {
      if (device.space?.spaceId !== space.id) {
        continue;
      }
      // ⚠️ 自己标过点的那些画在自己的坐标上（见 ①），不再列在这里 ——
      //    一台设备只出现一次。它仍然算在这个空间的「拥有数」里，角标照数它。
      //    判据与 ① 共用 `placed`：两处一旦分家，就会出现「既不在自己位置上、
      //    也不在列表里」的隐身设备。
      if (placed.has(device.did)) {
        continue;
      }
      row += 1;
      const name = deviceName(device);
      const id = spaceDeviceKey(space.id, device.did);
      markers.push({
        kind: 'device',
        id,
        deviceId: device.did,
        // 走到这里就说明它没有自己的锚点，位置是借空间的
        anchorFrom: 'space',
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
