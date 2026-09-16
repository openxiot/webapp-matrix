import { DeviceEntity } from '../../../typedef/define/device/DeviceEntity';
import { ModelAnchor } from '../../../typedef/define/model/ModelAnchor';
import { SpaceEntity } from '../../../typedef/define/space/SpaceEntity';
import { type AnchorMarker, MODEL_ID, MODEL_REV, buildMarkers } from './home3d.anchor';
import {
  type InfoPanel,
  type InfoText,
  buildPanels,
  deviceInfo,
  formatPoint,
  isMarkerVisible,
  placePanel,
  placePanels,
  spaceInfo,
} from './home3d.info';
import type { MarkerRect } from './model3d.scene';

/**
 * 信息面板的内容与摆位。
 *
 * 这些行错了也**不会报错，只是显示成另一个数**，所以用例盯的是三处最容易走偏的：
 *
 * 1. **「设备数量」是不是「这个空间拥有几台」** —— 它必须与空间角标、菜单的
 *    「设备 N 台」、空间设备弹窗是同一个数（都走 `devicesInSpace`）。早先菜单读的是
 *    角标快照，于是「显示设备」一勾上（角标不画了）就变成恒定的「设备 0 台」。
 * 2. **失效的锚点不该报出坐标** —— 模型换了版本之后老坐标不会被画在模型上，
 *    面板里却列出来，会让人以为标记丢了。
 * 3. **空值那行不画** —— 比如型号取不到时，只剩一个「产品型号：」的空壳。
 */

/** 翻译直通：断言里读到的就是键本身，省得对着译文猜 */
const TEXT: InfoText = {
  t: (key) => key,
  deviceName: (device) => `名:${device.did}`,
  deviceModel: (device) => device.type,
};

function anchor(x: number, y: number, z: number, rev = MODEL_REV): ModelAnchor {
  const a = new ModelAnchor();
  a.model = MODEL_ID;
  a.rev = rev;
  a.x = x;
  a.y = y;
  a.z = z;
  return a;
}

function space(id: string, name: string, a: ModelAnchor | null = null, ancestors: string[] = []) {
  const s = new SpaceEntity();
  s.id = id;
  s.name = name;
  s.anchor = a;
  s.ancestors = ancestors;
  return s;
}

function device(did: string, spaceId: string, a: ModelAnchor | null = null): DeviceEntity {
  const d = new DeviceEntity();
  d.did = did;
  d.space.spaceId = spaceId;
  d.anchor = a;
  d.type = `urn:org:model:${did}`;
  return d;
}

function spaceMap(...spaces: SpaceEntity[]): Map<string, SpaceEntity> {
  return new Map(spaces.map((s) => [s.id, s]));
}

/** 找一行的值；那行没画就是 undefined（用于断言「某行不该出现」） */
function rowValue(panel: InfoPanel, label: string): string | undefined {
  return panel.rows.find((row) => row.label === label)?.value;
}

function rowTone(panel: InfoPanel, label: string): string | undefined {
  return panel.rows.find((row) => row.label === label)?.tone;
}

describe('spaceInfo', () => {
  it('标题是空间名，副标题是树里的路径', () => {
    const root = space('r', '园区');
    const leaf = space('s1', '3层', anchor(1, 2, 3), ['r']);
    const panel = spaceInfo(leaf, spaceMap(root, leaf), [], TEXT);
    expect(panel.title).toBe('3层');
    expect(panel.subtitle).toBe('园区 / 3层');
  });

  it('「设备数量」是这个空间拥有的台数，与角标同源', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    // 7 台里 3 台自己单独标过点 —— 角标和这一行都得报 7（拥有数），不是 4
    const devices = [
      device('d1', 's1', anchor(1, 0, 0)),
      device('d2', 's1', anchor(2, 0, 0)),
      device('d3', 's1', anchor(3, 0, 0)),
      device('d4', 's1'),
      device('d5', 's1'),
      device('d6', 's1'),
      device('d7', 's1'),
      device('别家的', 's2'),
    ];
    const badge = Number(
      buildMarkers([s], devices).find((m) => m.id === 's1')?.spec.badge ?? 0,
    );

    const panel = spaceInfo(s, spaceMap(s), devices, TEXT);
    expect(rowValue(panel, '设备数量')).toBe('7');
    // 角标也必须是 7（它曾经只数「没自己锚点的」那 4 台，于是同一块画面两个数）。
    // 这条断言 + 上面那条是 0.9.20「设备 0 台」和本轮「标注过的不算」两个 bug 的看门人
    expect(badge).toBe(7);
  });

  it('有锚点才出「模型位置」', () => {
    const withAnchor = space('s1', 'A栋', anchor(1.5, -2.25, 3));
    const panel = spaceInfo(withAnchor, spaceMap(withAnchor), [], TEXT);
    expect(rowValue(panel, '模型位置')).toBe('1.500, -2.250, 3.000');
  });

  it('没有锚点的空间也出面板，只是没有「模型位置」那一行', () => {
    const bare = space('s1', 'A栋');
    const panel = spaceInfo(bare, spaceMap(bare), [], TEXT);
    expect(panel.title).toBe('A栋');
    expect(rowValue(panel, '模型位置')).toBeUndefined();
    expect(rowValue(panel, '设备数量')).toBe('0');
  });

  it('锚点版本对不上就不报坐标 —— 那个位置根本没画在模型上', () => {
    const stale = space('s1', 'A栋', anchor(1, 2, 3, '000.9'));
    const panel = spaceInfo(stale, spaceMap(stale), [], TEXT);
    expect(rowValue(panel, '模型位置')).toBeUndefined();
  });
});

describe('deviceInfo', () => {
  const s = space('s1', 'A栋', anchor(0, 0, 0));

  it('标题与标记上的名字同源', () => {
    const panel = deviceInfo(device('d1', 's1'), spaceMap(s), TEXT);
    expect(panel.title).toBe('名:d1');
  });

  it('在线时状态行写「在线」并带上色标', () => {
    const d = device('d1', 's1');
    d.online = true;
    const panel = deviceInfo(d, spaceMap(s), TEXT);
    expect(rowValue(panel, '状态')).toBe('在线');
    expect(rowTone(panel, '状态')).toBe('online');
  });

  it('离线时反过来 —— 状态不能只靠颜色', () => {
    const d = device('d1', 's1');
    d.online = false;
    const panel = deviceInfo(d, spaceMap(s), TEXT);
    expect(rowValue(panel, '状态')).toBe('离线');
    expect(rowTone(panel, '状态')).toBe('offline');
  });

  it('所在空间走副标题，不再单出一行', () => {
    const panel = deviceInfo(device('d1', 's1'), spaceMap(s), TEXT);
    expect(panel.subtitle).toBe('A栋');
    expect(panel.rows.map((row) => row.label)).not.toContain('所在空间');
  });

  it('空间查不到时不炸，只是没有副标题', () => {
    const panel = deviceInfo(device('d1', '早没了'), spaceMap(s), TEXT);
    expect(panel.subtitle).toBe('');
    expect(rowValue(panel, '设备ID')).toBe('d1');
  });

  it('取不到型号的那一行不画，不留个空壳', () => {
    const d = device('d1', 's1');
    d.type = '';
    const panel = deviceInfo(d, spaceMap(s), TEXT);
    expect(rowValue(panel, '产品型号')).toBeUndefined();
    expect(rowValue(panel, '设备ID')).toBe('d1');
  });

  it('型号取得到就写上去', () => {
    const panel = deviceInfo(device('d1', 's1'), spaceMap(s), TEXT);
    expect(rowValue(panel, '产品型号')).toBe('urn:org:model:d1');
  });
});

describe('formatPoint', () => {
  it('三位小数，负数保留符号', () => {
    expect(formatPoint({ x: 1.23456, y: -2.25, z: 3 })).toBe('1.235, -2.250, 3.000');
  });
});

/**
 * 「显示信息」铺开的那一片：给每个标记配一块面板。
 *
 * 盯的是两件事：**认哪个 id**（设备标记的 id 可能是 `空间id@did`，拿它去查设备必然
 * 查不到，而且是静默地少画一块），以及**查不到实体时不画**（空间图每次写完都整棵重拉，
 * 标记和实体之间有短暂空档）。
 */
describe('buildPanels', () => {
  function marker(
    kind: 'space' | 'device',
    id: string,
    spaceId: string,
    deviceId?: string,
  ): AnchorMarker {
    return {
      spec: { id, point: { x: 0, y: 0, z: 0 }, label: id, kind },
      kind,
      id,
      deviceId,
      name: id,
      spaceId,
    };
  }

  const s1 = space('s1', 'A栋', anchor(0, 0, 0));

  it('空间标记出空间面板，设备标记出设备面板', () => {
    const panels = buildPanels(
      [marker('space', 's1', 's1'), marker('device', 'd1', 's1', 'd1')],
      spaceMap(s1),
      new Map([['d1', device('d1', 's1')]]),
      [device('d1', 's1')],
      TEXT,
    );
    expect(panels.map((item) => item.id)).toEqual(['s1', 'd1']);
    expect(panels[0].panel.title).toBe('A栋');
    expect(panels[1].panel.title).toBe('名:d1');
  });

  it('设备认 deviceId 不认 id —— 列表行的 id 是 `空间id@did`', () => {
    // 「显示设备」列在 A栋 下面的那一行。id 是 s1@d1，**不是** did
    const listed = marker('device', 's1@d1', 's1', 'd1');
    const panels = buildPanels(
      [listed],
      spaceMap(s1),
      new Map([['d1', device('d1', 's1')]]),
      [device('d1', 's1')],
      TEXT,
    );
    // 面板 id 仍然是标记 id（摆位要按它查矩形），但内容来自 d1
    expect(panels).toHaveLength(1);
    expect(panels[0].id).toBe('s1@d1');
    expect(panels[0].panel.title).toBe('名:d1');
  });

  it('拿不到 deviceId 的设备标记不画，也不炸', () => {
    const panels = buildPanels(
      [marker('device', 's1@d1', 's1')],
      spaceMap(s1),
      new Map([['d1', device('d1', 's1')]]),
      [],
      TEXT,
    );
    expect(panels).toEqual([]);
  });

  it('实体查不到的标记跳过 —— 空间图刚换过一轮时会碰上', () => {
    const panels = buildPanels(
      [marker('space', 's1', 's1'), marker('space', '早没了', '早没了')],
      spaceMap(s1),
      new Map(),
      [],
      TEXT,
    );
    expect(panels.map((item) => item.id)).toEqual(['s1']);
  });

  it('顺序与标记一致 —— 铺开时面板的先后要跟画面上的一致', () => {
    const s2 = space('s2', 'B栋', anchor(1, 0, 0));
    const panels = buildPanels(
      [
        marker('space', 's2', 's2'),
        marker('device', 'd1', 's1', 'd1'),
        marker('space', 's1', 's1'),
      ],
      spaceMap(s1, s2),
      new Map([['d1', device('d1', 's1')]]),
      [device('d1', 's1')],
      TEXT,
    );
    expect(panels.map((item) => item.id)).toEqual(['s2', 'd1', 's1']);
  });

  it('没有标记就没有面板', () => {
    expect(buildPanels([], spaceMap(s1), new Map(), [], TEXT)).toEqual([]);
  });

  it('空间面板里的「设备数量」与角标同源，不另算一套', () => {
    // 铺开的那块和悬停的那块必须是同一个数 —— 两处都走 spaceInfo
    const devices = [device('d1', 's1'), device('d2', 's1'), device('别家的', 's2')];
    const panels = buildPanels([marker('space', 's1', 's1')], spaceMap(s1), new Map(), devices, TEXT);
    expect(rowValue(panels[0].panel, '设备数量')).toBe('2');
  });

  it('同一个 id 只出一块 —— 模板按 id 跟踪，重复会静默少画一块', () => {
    // 引擎那边 markers 是 Map，天生去重；这里要是直出两条，
    // `@for ... track view.id` 撞键只会 console.warn，然后丢掉一块
    const panels = buildPanels(
      [marker('space', 's1', 's1'), marker('space', 's1', 's1'), marker('device', 'd1', 's1', 'd1')],
      spaceMap(s1),
      new Map([['d1', device('d1', 's1')]]),
      [device('d1', 's1')],
      TEXT,
    );
    expect(panels.map((item) => item.id)).toEqual(['s1', 'd1']);
  });
});

/**
 * 摆位。核心那条是**没有矩形的面板不许画** —— 引擎还没报第一帧时表是空的，
 * 放过去的话面板会闪在容器左上角。
 */
describe('placePanels', () => {
  const CONTAINER = { width: 1000, height: 600 };

  function entry(id: string): { id: string; panel: InfoPanel } {
    return { id, panel: { title: id, subtitle: '', rows: [] } };
  }

  const rect = (x: number, y: number, width = 80, height = 22): MarkerRect => ({
    x,
    y,
    width,
    height,
  });

  it('没有矩形的面板直接丢掉 —— 不能画在 (0,0)', () => {
    const views = placePanels([entry('a')], new Map(), CONTAINER);
    expect(views).toEqual([]);
  });

  it('只丢掉没有矩形的那几块，其余照画', () => {
    const views = placePanels(
      [entry('a'), entry('b')],
      new Map([['b', rect(100, 100)]]),
      CONTAINER,
    );
    expect(views.map((view) => view.id)).toEqual(['b']);
  });

  it('摆位就是 placePanel 的结果（靠上的标签锚 top）', () => {
    const r = rect(100, 100);
    const views = placePanels([entry('a')], new Map([['a', r]]), CONTAINER);
    expect(views[0].placement).toEqual(placePanel(r, CONTAINER));
    expect(views[0].placement.top).toBe(100);
  });

  it('摆位就是 placePanel 的结果（靠下的标签锚 bottom）', () => {
    const r = rect(100, 500);
    const views = placePanels([entry('a')], new Map([['a', r]]), CONTAINER);
    expect(views[0].placement).toEqual(placePanel(r, CONTAINER));
    expect(views[0].placement.bottom).toBe(78); // 600 - 500 - 22
  });

  it('矩形比面板多是正常的（标记刚被删、这帧还没重报），不影响输出', () => {
    const views = placePanels(
      [entry('a')],
      new Map([
        ['a', rect(100, 100)],
        ['已经没了的标记', rect(0, 0)],
      ]),
      CONTAINER,
    );
    expect(views.map((view) => view.id)).toEqual(['a']);
  });

  it('零尺寸的矩形丢掉 —— 那是转到镜头背后的标记', () => {
    // CSS2DRenderer 给镜头背后的标记 display:none，量出来四个数全是 0，
    // 减掉画布原点就是一对负数。放过去会摆出一块没有主的空面板
    const views = placePanels(
      [entry('a')],
      new Map([['a', { x: -120, y: -60, width: 0, height: 0 }]]),
      CONTAINER,
    );
    expect(views).toEqual([]);
  });

  it('整个在容器外的矩形丢掉 —— 否则会夹出一块没有标签的面板', () => {
    // 标签在画布右边外面：placePanel 的「翻到左边」分支会把它夹回容器内，
    // 摆出一块位置正当、附近却没有标签的面板
    const outside = placePanels([entry('a')], new Map([['a', rect(1100, 100)]]), CONTAINER);
    expect(outside).toEqual([]);

    // 同一批里容器内的那块照画，只丢出界的那块
    const mixed = placePanels(
      [entry('a'), entry('b')],
      new Map([
        ['a', rect(1100, 100)],
        ['b', rect(100, 100)],
      ]),
      CONTAINER,
    );
    expect(mixed.map((view) => view.id)).toEqual(['b']);
  });

  it('内容原样带过去，不重算', () => {
    const panel: InfoPanel = {
      title: 'A栋',
      subtitle: '园区 / A栋',
      rows: [{ label: '设备数量', value: '7' }],
    };
    const views = placePanels([{ id: 's1', panel }], new Map([['s1', rect(1, 2)]]), CONTAINER);
    expect(views[0].panel).toBe(panel);
  });

  it('没有面板就没有视图', () => {
    expect(placePanels([], new Map([['a', rect(1, 2)]]), CONTAINER)).toEqual([]);
  });
});

/**
 * 一个矩形算不算「画面上真看得见的一个标签」。
 *
 * 这是铺开那一片的看门人：漏掉哪一条，画面上就会多出一块**没有主的空面板**
 * —— 而且只在特定角度/位置才看得见，靠肉眼很难发现。
 */
describe('isMarkerVisible', () => {
  const CONTAINER = { width: 1000, height: 600 };
  const at = (x: number, y: number, width = 80, height = 22): MarkerRect => ({
    x,
    y,
    width,
    height,
  });

  it('零尺寸一律不算 —— 那是被 display:none 掉的标记', () => {
    expect(isMarkerVisible({ x: -120, y: -60, width: 0, height: 0 }, CONTAINER)).toBe(false);
    // 只塌了一边也不算：半个标签不该摆出一块完整面板
    expect(isMarkerVisible({ x: 100, y: 100, width: 0, height: 22 }, CONTAINER)).toBe(false);
    expect(isMarkerVisible({ x: 100, y: 100, width: 80, height: 0 }, CONTAINER)).toBe(false);
  });

  it('在容器里就算', () => {
    expect(isMarkerVisible(at(100, 100), CONTAINER)).toBe(true);
    expect(isMarkerVisible(at(0, 0), CONTAINER)).toBe(true);
  });

  it('整个滑出右边不算', () => {
    // 左边正好在 1000 上（容器右边缘）也算出去了：一个像素都没露
    expect(isMarkerVisible(at(1000, 100), CONTAINER)).toBe(false);
    expect(isMarkerVisible(at(1100, 100), CONTAINER)).toBe(false);
  });

  it('露一个像素就算 —— 半张标签压在边上时面板还得跟着', () => {
    expect(isMarkerVisible(at(999, 100), CONTAINER)).toBe(true);
    expect(isMarkerVisible(at(-79, 100), CONTAINER)).toBe(true);
    expect(isMarkerVisible(at(-80, 100), CONTAINER)).toBe(false);
  });

  it('纵向同理', () => {
    expect(isMarkerVisible(at(100, 600), CONTAINER)).toBe(false);
    expect(isMarkerVisible(at(100, 599), CONTAINER)).toBe(true);
    expect(isMarkerVisible(at(100, -22), CONTAINER)).toBe(false);
    expect(isMarkerVisible(at(100, -21), CONTAINER)).toBe(true);
  });
});

/**
 * 面板摆哪儿。
 *
 * 这些数是**数出来的**，错了不会报错，只会让面板压住标签、或者跑到画布外面去，
 * 而且只在特定位置才看得见。所以边界都钉住：
 *
 * - 横向：右边放得下 / 放不下翻到左边 / 左边也放不下贴边
 * - 纵向：上半屏锚 `top`、下半屏锚 `bottom`，以及**中线那一下算哪边**
 */
describe('placePanel', () => {
  const CONTAINER = { width: 1000, height: 600 };
  const label = (x: number, y: number, width = 80, height = 22): MarkerRect => ({
    x,
    y,
    width,
    height,
  });

  it('右边放得下就贴在标签右侧，上边缘对齐标签', () => {
    const p = placePanel(label(100, 100), CONTAINER);
    expect(p.left).toBe(190); // 100 + 80 + 10
    expect(p.top).toBe(100);
    expect(p.bottom).toBeNull();
  });

  it('右边放不下就翻到标签左边', () => {
    // 标签右边缘 940，右边只剩 52 —— 放不下 200 宽的面板
    const p = placePanel(label(860, 100), CONTAINER);
    expect(p.left).toBe(650); // 860 - 10 - 200
    expect(p.top).toBe(100);
  });

  it('左边也放不下就贴住左边界，不跑到容器外', () => {
    // 窄容器里两边都放不下：翻到左边会是 -160
    const p = placePanel(label(50, 100), { width: 300, height: 600 });
    expect(p.left).toBe(8);
  });

  it('正好卡着边距放得下也算放得下（是「≤」不是「<」）', () => {
    const p = placePanel(label(702, 100), CONTAINER);
    expect(p.left).toBe(792);
    expect(p.left + 200).toBe(CONTAINER.width - 8); // 右边缘正好压在 8px 边距上
  });

  it('下半屏锚 bottom —— 面板朝上长，因此不必知道它自己多高', () => {
    const p = placePanel(label(100, 500), CONTAINER);
    expect(p.left).toBe(190);
    expect(p.bottom).toBe(78); // 600 - 500 - 22
    expect(p.top).toBeNull();
  });

  it('标签中心正好压在中线上算下半屏', () => {
    const p = placePanel(label(100, 289), CONTAINER); // 289 + 11 = 300 = 中线
    expect(p.bottom).toBe(289);
    expect(p.top).toBeNull();
  });

  it('中线往上 1px 就翻回上半屏', () => {
    const p = placePanel(label(100, 288), CONTAINER); // 中心 299
    expect(p.top).toBe(288);
    expect(p.bottom).toBeNull();
  });

  it('面板宽度是入参 —— 更宽的面板会把「放不下」的判据一起挪', () => {
    // 同一个位置：200 宽放得下（990 ≤ 992），300 宽放不下
    expect(placePanel(label(700, 100), CONTAINER).left).toBe(790);
    expect(placePanel(label(700, 100), CONTAINER, 300).left).toBe(390);
  });
});
