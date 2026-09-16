import { DeviceEntity } from '../../../typedef/define/device/DeviceEntity';
import { ModelAnchor } from '../../../typedef/define/model/ModelAnchor';
import { SpaceEntity } from '../../../typedef/define/space/SpaceEntity';
import { MODEL_ID, MODEL_REV, buildMarkers } from './home3d.anchor';
import {
  type InfoPanel,
  type InfoText,
  deviceInfo,
  formatPoint,
  placePanel,
  spaceInfo,
} from './home3d.info';
import type { MarkerRect } from './model3d.scene';

/**
 * 悬停信息面板的内容。
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
