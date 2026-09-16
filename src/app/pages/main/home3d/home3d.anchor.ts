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
 * 3. **一台设备只出现一次**（{@link buildMarkers}）—— 单独标了点的设备不再计入
 *    所属空间的角标数字，否则会被数两遍。
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
  /** 空间 id 或设备 did，与 spec.id 相同 */
  id: string;
  name: string;
  /** 这个标记所属的空间 id（设备标记也有；空间标记就是它自己） */
  spaceId: string;
}

export interface BuildMarkersOptions {
  /** 设备显示名解析。默认用 did —— 只在拿不到更好的名字时才这么显示 */
  deviceName?: (device: DeviceEntity) => string;
  /** 当前选中的标记 id */
  activeId?: string;
  model?: string;
  rev?: string;
}

/**
 * 把空间图算成一组标记。
 *
 * - 标了有效锚点的空间 → 一个标记，角标是**「折叠」进来的设备数**
 * - 自己标了有效锚点的设备 → 各自一个标记
 *
 * 该设备数只算没有自己锚点的那些设备，所以「所有角标之和 + 独立设备标记数 = 设备总数」，
 * 一台设备不会既在角标里、又在自己点位上被数两遍。
 */
export function buildMarkers(
  spaces: SpaceEntity[],
  devices: DeviceEntity[],
  options: BuildMarkersOptions = {},
): AnchorMarker[] {
  const model = options.model ?? MODEL_ID;
  const rev = options.rev ?? MODEL_REV;
  const activeId = options.activeId ?? '';
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
      name,
      spaceId: device.space?.spaceId ?? '',
      spec: {
        id: device.did,
        point: toVec3(anchor),
        label: name,
        tone: device.did === activeId ? 'active' : 'default',
      },
    });
  }

  // ② 没有自己点位的设备，按所属空间折叠计数
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
    if (!anchor) {
      continue;
    }
    const count = collapsed.get(space.id) ?? 0;
    markers.push({
      kind: 'space',
      id: space.id,
      name: space.name,
      spaceId: space.id,
      spec: {
        id: space.id,
        point: toVec3(anchor),
        label: space.name,
        badge: count > 0 ? String(count) : undefined,
        tone: space.id === activeId ? 'active' : 'default',
      },
    });
  }

  return markers;
}

function toVec3(anchor: { x: number; y: number; z: number }): Vec3 {
  return { x: anchor.x, y: anchor.y, z: anchor.z };
}
