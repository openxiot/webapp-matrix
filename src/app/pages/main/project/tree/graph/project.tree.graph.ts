import { SpaceEntity } from '@app/typedef/define/space/SpaceEntity';
import { DeviceEntity } from '@app/typedef/define/device/DeviceEntity';
import { GenericService } from '@app/typedef/define/service/GenericService';

/*
 * 项目树（`/main/project`）的**图模型**：把空间图那三份扁平列表拼成一棵可递归渲染的树。
 *
 * 这一层是纯函数，不认识 Angular、不读信号、不碰 DOM —— 组件那边只负责把 `rootSpace()` /
 * `devices()` / `services()` 三个信号喂进来，把结果交给模板。拼树的规则有几种边界（设备挂谁、
 * 服务挂谁、设备没了服务怎么办），摆在纯函数里才好一条条写用例钉住。
 *
 * **层级口径与 `/main/project` 的表格逐字一致**（那边是 `ProjectComponent.rows`，这边是
 * `buildGraph`）：
 *
 *   空间 ─┬─ 子空间（递归）
 *         ├─ 本空间设备 ─── 依赖该设备的服务
 *         └─ 兜底服务（依赖的设备已不在本空间 / 已被删除）
 *
 * 两处的差别只在**形状**：表格是展平成一维、按 `expandedIds` 懒展开；树是一次拼完整棵、
 * 由 `collapsedIds` 控制收起。谁挂谁下面这条规则两边必须一样，否则「功能一致」就是空话。
 */

/** 空间类型 -> 中文名。服务端给的空间类型是英文枚举，这里出的是**界面词条的键**（可翻译） */
export const SPACE_TYPE_LABELS: Record<string, string> = {
  site: '项目',
  building: '楼栋',
  floor: '楼层',
  room: '房间',
  zone: '区域',
};

/** 空间类型 -> 图标名（`assets/outline/` 下有同名 svg） */
export function spaceIcon(type: string): string {
  switch (type) {
    case 'site':
      return 'home';
    case 'building':
      return 'bank';
    case 'floor':
      return 'table';
    case 'room':
      return 'appstore';
    case 'zone':
      return 'global';
    default:
      return 'folder';
  }
}

/** 树上的一格是什么：空间 / 设备 / 服务 */
export type GraphNodeKind = 'space' | 'device' | 'service';

/**
 * 树上的一格。三类节点共用一个结构，靠 `kind` 区分（`space` / `device` / `service` 里只有
 * 对应的那一个是非空的）—— 与 `ProjectComponent` 里那个 `TreeNode` 同一个套路，好处是
 * 模板里一份递归够用，不必为三种节点各写一遍布局。
 *
 * 没有 `level`：树形布局的层级是**递归结构本身**表达的（缩进 / 连线由 DOM 嵌套给），
 * 不像表格那样需要把层级算成一个数字再喂给 `nzIndentSize`。
 */
export interface GraphNode {
  /** `@for` 的 track 键。加前缀是为了让空间 id / 设备 did / 服务 id 三类 id 不互相撞 */
  key: string;
  kind: GraphNodeKind;
  space: SpaceEntity | null;
  device: DeviceEntity | null;
  service: GenericService | null;
  /** 子节点。三个来源的顺序：子空间 → 设备 → 兜底服务（与表格里的行序一致） */
  children: GraphNode[];
}

/** 空间节点的键 */
export function spaceNodeKey(spaceId: string): string {
  return `space:${spaceId}`;
}

/** 设备节点的键 */
export function deviceNodeKey(did: string): string {
  return `device:${did}`;
}

/** 服务节点的键 */
export function serviceNodeKey(serviceId: string): string {
  return `service:${serviceId}`;
}

/** 一棵树最多多少层。父子 id 成环时（脏数据）靠它兜底，免得递归到爆栈。 */
const MAX_DEPTH = 32;

/**
 * 按键在树里找回那一格，找不到给 `null`。
 *
 * 两处用到，都是「我手上只有一个键」的场合：选中的那张卡（组件里只存键，不存实体 ——
 * 重新取数之后实体就旧了），以及拖动要算的那一支（`subtreeKeys`）。
 * 各写一遍递归的话，哪天节点的形状变了（比如加一层包装），漏改一处就是「点了没反应」。
 */
export function findNode(root: GraphNode | null, key: string): GraphNode | null {
  if (!root || !key) {
    return null;
  }
  if (root.key === key) {
    return root;
  }
  for (const child of root.children) {
    const hit = findNode(child, key);
    if (hit) {
      return hit;
    }
  }
  return null;
}

/**
 * 把空间图的三份扁平列表拼成一棵树。`root` 为空（没选项目 / 还没取到数）时返回 `null`。
 *
 * **根空间自己也是一格**（树顶那张卡）：表格那边根空间不出行，是因为它的代码 / 名称 / 类型 /
 * 设备数 / 服务数已经摆在页头的 `nz-descriptions` 里了；树这边整棵树就是主角，把根藏起来
 * 反而让「这棵树属于谁」没地方看。
 */
export function buildGraph(
  root: SpaceEntity | null,
  devices: DeviceEntity[],
  services: GenericService[],
): GraphNode | null {
  if (!root) {
    return null;
  }

  const devicesOf = (spaceId: string): DeviceEntity[] =>
    devices.filter((d) => d.space?.spaceId === spaceId);

  const servicesOf = (spaceId: string): GenericService[] =>
    services.filter((s) => s.spaceId === spaceId);

  const serviceNode = (service: GenericService): GraphNode => ({
    key: serviceNodeKey(service.id),
    kind: 'service',
    space: null,
    device: null,
    service,
    children: [],
  });

  const buildSpace = (space: SpaceEntity, depth: number): GraphNode => {
    const children: GraphNode[] = [];

    if (depth < MAX_DEPTH) {
      for (const child of space.children) {
        children.push(buildSpace(child, depth + 1));
      }

      const spaceServices = servicesOf(space.id);
      /** 已经被某台设备认领的服务 id：剩下的就是「设备不在了」的兜底服务 */
      const attached = new Set<string>();

      for (const device of devicesOf(space.id)) {
        const own = spaceServices.filter((s) => s.did === device.did);
        own.forEach((s) => attached.add(s.id));
        children.push({
          key: deviceNodeKey(device.did),
          kind: 'device',
          space: null,
          device,
          service: null,
          children: own.map(serviceNode),
        });
      }

      // 依赖的设备已不在本空间（被移走 / 被删除）的服务：挂到空间下，不至于整条消失。
      // 与表格那边同一句兜底，见 ProjectComponent.rows 里的 `attached`。
      for (const service of spaceServices.filter((s) => !attached.has(s.id))) {
        children.push(serviceNode(service));
      }
    }

    return {
      key: spaceNodeKey(space.id),
      kind: 'space',
      space,
      device: null,
      service: null,
      children,
    };
  };

  return buildSpace(root, 0);
}
