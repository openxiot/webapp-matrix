import { DeviceEntity } from '../../../typedef/define/device/DeviceEntity';
import { ModelAnchor } from '../../../typedef/define/model/ModelAnchor';
import { SpaceEntity } from '../../../typedef/define/space/SpaceEntity';
import {
  MODEL_ID,
  MODEL_REV,
  anchorIsValid,
  buildMarkers,
  makeAnchor,
  resolveDeviceAnchor,
  spacePath,
} from './home3d.anchor';

/**
 * 锚点数据模型的规则。
 *
 * 这些函数错了**不会报错，只会悄悄不对**，而且两种错法方向相反、都很难看出来：
 *
 * - **回退链**错了 → 没单独标点的设备集体从模型上消失（看起来像「设备没建好」）
 * - **折叠计数**错了 → 角标数字偏大或偏小（菜单说 3 台、角标画 2 台）
 *
 * 所以断言盯着三处：版本校验的边界（`rev` 差一位）、
 * 回退链的两级优先级、以及「角标之和 + 独立设备标记 = 设备总数」这条不变量。
 */

function anchor(x: number, y: number, z: number, rev = MODEL_REV): ModelAnchor {
  const a = new ModelAnchor();
  a.model = MODEL_ID;
  a.rev = rev;
  a.x = x;
  a.y = y;
  a.z = z;
  return a;
}

function space(id: string, name: string, a: ModelAnchor | null = null): SpaceEntity {
  const s = new SpaceEntity();
  s.id = id;
  s.name = name;
  s.anchor = a;
  return s;
}

function device(did: string, spaceId: string, a: ModelAnchor | null = null): DeviceEntity {
  const d = new DeviceEntity();
  d.did = did;
  d.space.spaceId = spaceId;
  d.anchor = a;
  return d;
}

function spaceMap(...spaces: SpaceEntity[]): Map<string, SpaceEntity> {
  return new Map(spaces.map((s) => [s.id, s]));
}

/** 角标里的数（没有角标算 0） */
function badgeOf(markers: ReturnType<typeof buildMarkers>, id: string): number {
  const marker = markers.find((m) => m.id === id);
  return Number(marker?.spec.badge ?? 0);
}

describe('anchorIsValid', () => {
  it('模型与版本都对得上就是有效的', () => {
    expect(anchorIsValid(anchor(1, 2, 3))).toBe(true);
  });

  it('没标过（null/undefined）算无效', () => {
    expect(anchorIsValid(null)).toBe(false);
    expect(anchorIsValid(undefined)).toBe(false);
  });

  it('版本差一位就整个作废 —— 模型重导出后坐标不再可信', () => {
    // 这是本期最重要的保护：宁可标记消失让人重标，也不能画到错误的位置
    expect(anchorIsValid(anchor(1, 2, 3, '001.0'))).toBe(false);
    expect(anchorIsValid(anchor(1, 2, 3, '001.2'))).toBe(false);
  });

  it('模型标识对不上也算无效（将来有 002 时不能混用）', () => {
    const a = anchor(1, 2, 3);
    a.model = '002';
    expect(anchorIsValid(a)).toBe(false);
  });

  it('坐标里有 NaN 就不认 —— 手塞进库的脏数据不该把标签画到 translate(NaNpx)', () => {
    expect(anchorIsValid(anchor(Number.NaN, 2, 3))).toBe(false);
    expect(anchorIsValid(anchor(1, Number.POSITIVE_INFINITY, 3))).toBe(false);
    expect(anchorIsValid(anchor(1, 2, Number.NaN))).toBe(false);
  });

  it('坐标是 0 是合法的（模型原点附近也是位置）', () => {
    expect(anchorIsValid(anchor(0, 0, 0))).toBe(true);
  });
});

describe('makeAnchor', () => {
  it('自己盖 model / rev 的章，调用方无从传错', () => {
    const a = makeAnchor({ x: 1.5, y: 2, z: -3 });
    expect(a.model).toBe(MODEL_ID);
    expect(a.rev).toBe(MODEL_REV);
    expect(a.x).toBe(1.5);
    expect(a.y).toBe(2);
    expect(a.z).toBe(-3);
  });

  it('不传 ry 就是 undefined，而不是 0', () => {
    // 0 会被当成「真的朝正北」，而「没朝向」和「朝北」是两回事
    expect(makeAnchor({ x: 0, y: 0, z: 0 }).ry).toBeUndefined();
  });

  it('传了 ry 就带上（弧度）', () => {
    expect(makeAnchor({ x: 0, y: 0, z: 0 }, 1.57).ry).toBe(1.57);
  });
});

describe('resolveDeviceAnchor', () => {
  it('设备自己有锚点就用自己的', () => {
    const s = space('s1', 'A栋', anchor(1, 1, 1));
    const d = device('d1', 's1', anchor(9, 9, 9));

    const resolved = resolveDeviceAnchor(d, spaceMap(s));
    expect(resolved?.from).toBe('device');
    expect(resolved?.anchor.x).toBe(9);
  });

  it('设备没锚点就落到所属空间的锚点', () => {
    const s = space('s1', 'A栋', anchor(5, 0, 5));
    const d = device('d1', 's1');

    const resolved = resolveDeviceAnchor(d, spaceMap(s));
    expect(resolved?.from).toBe('space');
    expect(resolved?.anchor).toBe(s.anchor);
    expect(resolved?.space).toBe(s);
  });

  it('设备和空间都没锚点 → null（这台设备在模型上无处安放）', () => {
    const s = space('s1', 'A栋');
    expect(resolveDeviceAnchor(device('d1', 's1'), spaceMap(s))).toBeNull();
  });

  it('设备的锚点版本失效时，退回空间锚点而不是直接消失', () => {
    const s = space('s1', 'A栋', anchor(5, 0, 5));
    const d = device('d1', 's1', anchor(9, 9, 9, '001.0'));

    const resolved = resolveDeviceAnchor(d, spaceMap(s));
    expect(resolved?.from).toBe('space');
  });

  it('设备的空间不在图里（比如被删了）→ 不抛异常，返回 null', () => {
    const d = device('d1', 'gone', anchor(9, 9, 9));
    // 自己的锚点还在，所以仍然有位置 —— 不依赖空间能否查到
    expect(resolveDeviceAnchor(d, spaceMap())?.from).toBe('device');

    const noAnchor = device('d2', 'gone');
    expect(resolveDeviceAnchor(noAnchor, spaceMap())).toBeNull();
  });
});

describe('spacePath', () => {
  it('沿 ancestors 拼出可读路径', () => {
    const park = space('p', '园区');
    const building = space('b', 'A栋');
    const floor = space('f', '3层');
    floor.ancestors = ['p', 'b'];

    expect(spacePath(floor, spaceMap(park, building, floor))).toBe('园区 / A栋 / 3层');
  });

  it('ancestors 里有查不到的 id 就跳过，不要拼出 `园区 / undefined / 3层`', () => {
    const park = space('p', '园区');
    const floor = space('f', '3层');
    floor.ancestors = ['p', 'missing'];

    expect(spacePath(floor, spaceMap(park, floor))).toBe('园区 / 3层');
  });

  it('顶层空间就只有自己的名字', () => {
    const park = space('p', '园区');
    expect(spacePath(park, spaceMap(park))).toBe('园区');
  });
});

describe('buildMarkers', () => {
  it('只给标了点的空间画标记', () => {
    const a = space('s1', 'A栋', anchor(1, 0, 1));
    const b = space('s2', 'B栋');

    const markers = buildMarkers([a, b], []);
    expect(markers).toHaveLength(1);
    expect(markers[0].id).toBe('s1');
    expect(markers[0].kind).toBe('space');
  });

  it('角标数的是折叠进这个空间的设备', () => {
    const a = space('s1', 'A栋', anchor(1, 0, 1));
    const markers = buildMarkers([a], [device('d1', 's1'), device('d2', 's1')]);

    expect(markers).toHaveLength(1);
    expect(markers[0].spec.badge).toBe('2');
  });

  it('没有折叠设备时不出角标，而不是画一个 0', () => {
    const a = space('s1', 'A栋', anchor(1, 0, 1));
    const markers = buildMarkers([a], [device('d1', 's2')]);

    expect(badgeOf(markers, 's1')).toBe(0);
    expect(markers[0].spec.badge).toBeUndefined();
  });

  it('自己标了点的设备单独出标记，且不再计入空间角标（不被数两遍）', () => {
    const a = space('s1', 'A栋', anchor(1, 0, 1));
    const devices = [
      device('d1', 's1', anchor(2, 0, 2)), // 自己标了
      device('d2', 's1'), // 折叠
      device('d3', 's1'), // 折叠
    ];

    const markers = buildMarkers([a], devices);
    const d1 = markers.find((m) => m.id === 'd1');

    expect(d1?.kind).toBe('device');
    expect(d1?.spaceId).toBe('s1');
    expect(badgeOf(markers, 's1')).toBe(2); // 不是 3
  });

  it('不变量：所有角标之和 + 独立设备标记数 = 有归属的设备总数', () => {
    const a = space('s1', 'A栋', anchor(1, 0, 1));
    const b = space('s2', 'B栋', anchor(2, 0, 2));
    const devices = [
      device('d1', 's1', anchor(3, 0, 3)),
      device('d2', 's1'),
      device('d3', 's1'),
      device('d4', 's2'),
      device('d5', 's2', anchor(4, 0, 4)),
    ];

    const markers = buildMarkers([a, b], devices);
    const badges = markers.reduce((sum, m) => sum + Number(m.spec.badge ?? 0), 0);
    const alone = markers.filter((m) => m.kind === 'device').length;

    expect(badges + alone).toBe(devices.length);
    expect(badges).toBe(3); // s1 收到 d2、d3；s2 收到 d4
    expect(alone).toBe(2); // d1、d5
  });

  it('空间没标点时，里面的设备一个都不出现（回退链没有落点）', () => {
    const a = space('s1', 'A栋');
    const markers = buildMarkers([a], [device('d1', 's1')]);

    expect(markers).toHaveLength(0);
  });

  it('没有空间的孤儿设备（spaceId 为空）不进任何角标，也不独自出现', () => {
    const a = space('s1', 'A栋', anchor(1, 0, 1));
    const markers = buildMarkers([a], [device('d1', ''), device('d2', 's1')]);

    expect(badgeOf(markers, 's1')).toBe(1);
  });

  it('设备显示名走 deviceName，默认退回 did', () => {
    const a = space('s1', 'A栋', anchor(1, 0, 1));
    const devices = [device('d1', 's1', anchor(2, 0, 2))];

    expect(buildMarkers([a], devices)[0].name).toBe('d1');
    expect(
      buildMarkers([a], devices, { deviceName: () => '温度计-01' })[0].name,
    ).toBe('温度计-01');
  });

  it('选中的标记 tone 为 active，其余为 default', () => {
    const a = space('s1', 'A栋', anchor(1, 0, 1));
    const b = space('s2', 'B栋', anchor(2, 0, 2));

    const markers = buildMarkers([a, b], [], { activeId: 's2' });
    expect(markers.find((m) => m.id === 's1')?.spec.tone).toBe('default');
    expect(markers.find((m) => m.id === 's2')?.spec.tone).toBe('active');
  });

  it('空间标记的坐标就是它的锚点坐标', () => {
    const a = space('s1', 'A栋', anchor(1.5, -2.25, 3));
    expect(buildMarkers([a], [])[0].spec.point).toEqual({ x: 1.5, y: -2.25, z: 3 });
  });
});

describe('buildMarkers · 显示设备', () => {
  it('默认关闭：和加这个开关之前的行为一模一样（一台设备都没有、只出角标）', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    const ds = [device('d1', 's1'), device('d2', 's1')];
    const markers = buildMarkers([s], ds);

    expect(markers.map((m) => m.id)).toEqual(['s1']);
    expect(badgeOf(markers, 's1')).toBe(2);
  });

  it('打开后每台设备各一行，都挂在空间锚点上、靠屏幕偏移逐行往下排', () => {
    const s = space('s1', 'A栋', anchor(1, 2, 3));
    const ds = [device('d1', 's1'), device('d2', 's1'), device('d3', 's1')];
    const markers = buildMarkers([s], ds, { showDevices: true });

    const listed = markers.filter((m) => m.kind === 'device');
    expect(listed.map((m) => m.id)).toEqual(['s1@d1', 's1@d2', 's1@d3']);
    // 26 是 DEVICE_ROW_PX，和样式表里设备标签那 22px 的高度是配套的。
    // 这里写死数字是故意的：改了行距就得同时确认样式表还对不对得上。
    expect(listed.map((m) => m.spec.offset?.y)).toEqual([26, 52, 78]);
    // 模型坐标还是空间那一个点，区别只在屏幕像素上 ——
    // 所以它们是「排开」而不是「散落在模型各处」
    for (const m of listed) {
      expect(m.spec.point).toEqual({ x: 1, y: 2, z: 3 });
    }
  });

  it('打开后空间标记不再出角标 —— 否则会「角标 2、下面列了 7 台」自相矛盾', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    const ds = [device('d1', 's1'), device('d2', 's1')];
    expect(badgeOf(buildMarkers([s], ds, { showDevices: true }), 's1')).toBe(0);
  });

  it('自己也有锚点的设备会出现在两处：id 不同、deviceId 相同、坐标各是各的', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    const markers = buildMarkers([s], [device('d1', 's1', anchor(9, 9, 9))], {
      showDevices: true,
    });

    // 顺序：pass ① 的独立标记、pass ③ 的空间标记、pass ④ 的空间下那份
    expect(markers.map((m) => m.id)).toEqual(['d1', 's1', 's1@d1']);

    const standalone = markers.find((m) => m.id === 'd1');
    const listed = markers.find((m) => m.id === 's1@d1');
    // 两处位置不同，所以必须是两个标记 —— 引擎按 id 增删，同 id 会被合并成一个
    expect(standalone?.spec.point).toEqual({ x: 9, y: 9, z: 9 });
    expect(listed?.spec.point).toEqual({ x: 0, y: 0, z: 0 });
    // 但写库认的是同一个 deviceId，两处都不能是 `空间id@did`
    expect(standalone?.deviceId).toBe('d1');
    expect(listed?.deviceId).toBe('d1');
  });

  it('anchorFrom 分清位置是自有的还是借空间的 —— 菜单据此给不同项', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    const ds = [device('d1', 's1'), device('d2', 's1', anchor(9, 9, 9))];
    const markers = buildMarkers([s], ds, { showDevices: true });

    expect(markers.find((m) => m.id === 'd2')?.anchorFrom).toBe('device');
    expect(markers.find((m) => m.id === 's1@d1')?.anchorFrom).toBe('space');
    expect(markers.find((m) => m.id === 's1@d2')?.anchorFrom).toBe('device');
  });

  it('空间自己没锚点时，开关打开也一样一台都不出现（回退链没有落点）', () => {
    const s = space('s1', 'A栋', null);
    expect(buildMarkers([s], [device('d1', 's1')], { showDevices: true })).toEqual([]);
  });

  it('没有空间的孤儿设备不进任何列表', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    const markers = buildMarkers([s], [device('d1', '')], { showDevices: true });
    expect(markers.map((m) => m.id)).toEqual(['s1']);
  });

  it('每个空间只列自己的设备，设备夹在自己的空间标记后面', () => {
    const a = space('s1', 'A栋', anchor(0, 0, 0));
    const b = space('s2', 'B栋', anchor(1, 0, 0));
    const ds = [device('d1', 's1'), device('d2', 's2')];
    const markers = buildMarkers([a, b], ds, { showDevices: true });
    expect(markers.map((m) => m.id)).toEqual(['s1', 's1@d1', 's2', 's2@d2']);
  });

  it('勾选态按标记 id 走，空间下那份和设备自己那份互不影响', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    const ds = [device('d1', 's1'), device('d2', 's1')];
    const markers = buildMarkers([s], ds, { showDevices: true, activeId: 's1@d2' });

    expect(markers.find((m) => m.id === 's1@d2')?.spec.tone).toBe('active');
    expect(markers.find((m) => m.id === 's1@d1')?.spec.tone).toBe('default');
  });

  it('空间下那份也用 deviceName 解析出来的名字，不是 did', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    const markers = buildMarkers([s], [device('d1', 's1')], {
      showDevices: true,
      deviceName: (d) => `名-${d.did}`,
    });
    expect(markers.find((m) => m.id === 's1@d1')?.spec.label).toBe('名-d1');
  });

  it('设备标记的 kind 是 device，空间标记是 space（样式表据此分大小）', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    const markers = buildMarkers([s], [device('d1', 's1')], { showDevices: true });
    expect(markers.find((m) => m.id === 's1')?.spec.kind).toBe('space');
    expect(markers.find((m) => m.id === 's1@d1')?.spec.kind).toBe('device');
  });
});
