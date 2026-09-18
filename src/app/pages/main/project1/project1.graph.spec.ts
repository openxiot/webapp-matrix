import { SpaceEntity } from '../../../typedef/define/space/SpaceEntity';
import { DeviceEntity } from '../../../typedef/define/device/DeviceEntity';
import { SpaceRef } from '../../../typedef/define/space/SpaceRef';
import { GenericService } from '../../../typedef/define/service/GenericService';
import { GraphNode, buildGraph, deviceNodeKey, findNode, serviceNodeKey, spaceNodeKey } from './project1.graph';

/**
 * 项目树的拼装。要钉住的是**「谁挂在谁下面」这条规则**——它与 `/main/project` 的表格
 * （`ProjectComponent.rows`）是同一套口径，两处必须一致，否则「功能一致」只是句口号。
 *
 * 三种节点各挂在哪儿：
 *
 *   空间 ─┬─ 子空间（递归）
 *         ├─ 本空间设备 ─── 依赖该设备的服务
 *         └─ 兜底服务（依赖的设备已不在本空间）
 */

function space(id: string, children: SpaceEntity[] = [], type = 'room'): SpaceEntity {
  const s = new SpaceEntity();
  s.id = id;
  s.name = `空间${id}`;
  s.type = type;
  s.children = children;
  return s;
}

function device(did: string, spaceId: string): DeviceEntity {
  const d = new DeviceEntity();
  d.did = did;
  d.type = `urn:xiot:device:test:dtu:${did}`;
  const ref = new SpaceRef();
  ref.spaceId = spaceId;
  d.space = ref;
  return d;
}

function service(id: string, spaceId: string, did: string): GenericService {
  const s = new GenericService();
  s.id = id;
  s.name = `服务${id}`;
  s.did = did;
  s.spaceId = spaceId;
  return s;
}

/** 树上一个节点的键，按前序展平（用例里比对形状用） */
function keys(node: GraphNode | null): string[] {
  if (!node) return [];
  return [node.key, ...node.children.flatMap(keys)];
}

describe('buildGraph', () => {
  it('没选项目（root 为空）时给 null，不是一棵空树', () => {
    expect(buildGraph(null, [], [])).toBeNull();
  });

  it('根空间自己也是一格 —— 表格里它不出行，树里它是树顶那张卡', () => {
    const graph = buildGraph(space('p', [], 'site'), [], [])!;

    expect(graph.kind).toBe('space');
    expect(graph.key).toBe(spaceNodeKey('p'));
    expect(graph.space!.id).toBe('p');
    expect(graph.children).toEqual([]);
  });

  it('子空间在前、本空间设备在后（与表格里的行序一致）', () => {
    const graph = buildGraph(
      space('p', [space('c1'), space('c2')]),
      [device('d1', 'p'), device('d2', 'p')],
      [],
    )!;

    expect(graph.children.map((n) => n.kind)).toEqual(['space', 'space', 'device', 'device']);
    expect(graph.children.map((n) => n.key)).toEqual([
      spaceNodeKey('c1'),
      spaceNodeKey('c2'),
      deviceNodeKey('d1'),
      deviceNodeKey('d2'),
    ]);
  });

  it('空间嵌套是递归的：子空间的设备挂在子空间下，不在根下', () => {
    const graph = buildGraph(space('p', [space('c', [], 'floor')]), [device('d1', 'c')], [])!;

    const child = graph.children[0];
    expect(child.key).toBe(spaceNodeKey('c'));
    expect(child.children.map((n) => n.key)).toEqual([deviceNodeKey('d1')]);
    // 根下只有那一个子空间，设备一层都没漏上来
    expect(graph.children).toHaveLength(1);
  });

  it('服务挂到它依赖的那台设备下', () => {
    const graph = buildGraph(
      space('p'),
      [device('d1', 'p'), device('d2', 'p')],
      [service('s1', 'p', 'd1'), service('s2', 'p', 'd2'), service('s3', 'p', 'd1')],
    )!;

    const [first, second] = graph.children;
    expect(first.children.map((n) => n.key)).toEqual([serviceNodeKey('s1'), serviceNodeKey('s3')]);
    expect(second.children.map((n) => n.key)).toEqual([serviceNodeKey('s2')]);
  });

  it('服务身上是 spaceId 与 did 两个字段齐全才算挂上：did 对但 spaceId 不是本空间的，不挂', () => {
    const graph = buildGraph(space('p'), [device('d1', 'p')], [service('s1', 'other', 'd1')])!;

    expect(graph.children.map((n) => n.kind)).toEqual(['device']);
    expect(graph.children[0].children).toEqual([]);
  });

  it('依赖的设备已不在本空间时，服务兜底挂到空间下 —— 整条不丢', () => {
    const graph = buildGraph(
      space('p'),
      [device('d1', 'p')],
      [service('s1', 'p', 'd1'), service('gone', 'p', 'd-不存在')],
    )!;

    expect(graph.children.map((n) => n.key)).toEqual([
      deviceNodeKey('d1'),
      serviceNodeKey('gone'),
    ]);
    // 兜底的那个只出现一次（不是既挂设备又挂空间）
    expect(keys(graph).filter((k) => k === serviceNodeKey('gone'))).toHaveLength(1);
  });

  it('服务只出现一次：认领过的不会再当兜底项冒出来', () => {
    const graph = buildGraph(space('p'), [device('d1', 'p')], [service('s1', 'p', 'd1')])!;

    expect(keys(graph).filter((k) => k === serviceNodeKey('s1'))).toHaveLength(1);
  });

  it('没有子空间 / 设备 / 服务的空间是一格叶子，不是缺一格', () => {
    const graph = buildGraph(space('p', [space('c')]), [], [])!;

    expect(graph.children).toHaveLength(1);
    expect(graph.children[0].children).toEqual([]);
  });

  it('别处的设备不会串进来', () => {
    const graph = buildGraph(space('p'), [device('d1', '别的空间')], [])!;

    expect(graph.children).toEqual([]);
  });

  it('三层的形状：空间 → 子空间 → 设备 → 服务', () => {
    const nested = buildGraph(
      space('p', [space('c', [space('g', [], 'zone')])], 'site'),
      [device('d1', 'g')],
      [service('s1', 'g', 'd1')],
    )!;

    expect(nested.children[0].children[0].key).toBe(spaceNodeKey('g'));
    expect(nested.children[0].children[0].children[0].key).toBe(deviceNodeKey('d1'));
    expect(nested.children[0].children[0].children[0].children[0].key).toBe(serviceNodeKey('s1'));
  });
});

/*
 * `findNode` 是「我手上只有一个键」时的那个入口：选中那张卡、拖动要算的那一支。
 * 它替代了两处各写一遍的递归 —— 所以钉的是**两件事**：找得准，以及找不到时给 `null`
 * 而不是抛（脏键、空树、空串都会走到那儿）。
 */
describe('findNode', () => {
  /** 一棵够深的树：p → c → g（空间三层）+ 设备 d1 → 服务 s1 */
  const tree = () =>
    buildGraph(
      space('p', [space('c', [space('g', [], 'zone')])], 'site'),
      [device('d1', 'g')],
      [service('s1', 'g', 'd1')],
    );

  it('三种键都能找回对应的那一格', () => {
    const root = tree()!;

    expect(findNode(root, spaceNodeKey('p'))!.space!.id).toBe('p');
    expect(findNode(root, spaceNodeKey('g'))!.space!.id).toBe('g');
    expect(findNode(root, deviceNodeKey('d1'))!.device!.did).toBe('d1');
    expect(findNode(root, serviceNodeKey('s1'))!.service!.id).toBe('s1');
  });

  it('找回来的就是树上那一格本身（不是复制一份）', () => {
    const root = tree()!;
    const g = findNode(root, spaceNodeKey('g'));

    expect(g).toBe(root.children[0].children[0]);
  });

  it('找不到就是 null：脏键 / 别的项目的键 / 前缀写错', () => {
    const root = tree()!;

    expect(findNode(root, spaceNodeKey('没有这个'))).toBeNull();
    // 前缀撞上也不行：`device:d1` 是设备那一格，`space:d1` 谁都不是
    expect(findNode(root, spaceNodeKey('d1'))).toBeNull();
    expect(findNode(root, 'd1')).toBeNull();
  });

  it('空树 / 空键给 null，不抛', () => {
    expect(findNode(null, spaceNodeKey('p'))).toBeNull();
    const root = tree()!;
    // 空串是「没选」的表达（`selected` 的初值就是这个），等于没找
    expect(findNode(root, '')).toBeNull();
  });

  it('叶子上的键照样找得到，不必是中间节点', () => {
    const root = tree()!;
    const leaf = findNode(root, serviceNodeKey('s1'))!;

    expect(leaf.children).toEqual([]);
    expect(findNode(root, leaf.key)).toBe(leaf);
  });
});
