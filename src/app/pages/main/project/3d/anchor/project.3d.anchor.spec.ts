import { DeviceEntity } from '../../../../../typedef/define/device/DeviceEntity';
import { ModelAnchor } from '../../../../../typedef/define/model/ModelAnchor';
import { SpaceEntity } from '../../../../../typedef/define/space/SpaceEntity';
import {
  MODEL_ID,
  MODEL_REV,
  anchorIsValid,
  buildMarkers,
  devicesInSpace,
  makeAnchor,
  resolveDeviceAnchor,
  spacePath,
} from './project.3d.anchor';

/**
 * 锚点数据模型的规则。
 *
 * 这些函数错了**不会报错，只会悄悄不对**，而且几种错法方向相反、都很难看出来：
 *
 * - **位置的回退链**错了 → 没单独标点的设备集体从模型上消失（看起来像「设备没建好」），
 *   或者反过来，同一台设备在画面上出现两次
 * - **拥有数**错了 → 角标数字偏大或偏小（菜单说 7 台、角标画 4 台）
 * - **归属**错了 → 上面这些数各说各的（`devicesInSpace` 只有一份实现，就是为了这个）
 *
 * 所以断言盯着四处：版本校验的边界（`rev` 差一位）、回退链的两级优先级、
 * 「一台设备只画一次」、以及「角标 = 这个空间拥有的设备数」。
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

describe('devicesInSpace', () => {
  it('只挑这个空间下的设备', () => {
    const devices = [device('a', 's1'), device('b', 's2'), device('c', 's1')];
    expect(devicesInSpace(devices, 's1').map((d) => d.did)).toEqual(['a', 'c']);
  });

  it('空间 id 不认识时是空的，不是「全部」', () => {
    expect(devicesInSpace([device('a', 's1')], '别的空间')).toEqual([]);
  });

  it('没挂空间的设备不会掉进任何一个空间', () => {
    expect(devicesInSpace([device('a', '')], 's1')).toEqual([]);
  });

  it('自己标过点的也算这个空间的 —— 归属与位置是两件事', () => {
    const devices = [device('a', 's1', anchor(1, 0, 0)), device('b', 's1')];
    expect(devicesInSpace(devices, 's1').map((d) => d.did)).toEqual(['a', 'b']);
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

  it('角标数的是这个空间**拥有**的设备', () => {
    const a = space('s1', 'A栋', anchor(1, 0, 1));
    const markers = buildMarkers([a], [device('d1', 's1'), device('d2', 's1')]);

    expect(markers).toHaveLength(1);
    expect(markers[0].spec.badge).toBe('2');
  });

  it('没有设备时不出角标，而不是画一个 0', () => {
    const a = space('s1', 'A栋', anchor(1, 0, 1));
    const markers = buildMarkers([a], [device('d1', 's2')]);

    expect(badgeOf(markers, 's1')).toBe(0);
    expect(markers[0].spec.badge).toBeUndefined();
  });

  it('自己标过点的设备照样计入角标 —— 角标说的是「有几台」，不是「有几台在这儿」', () => {
    const a = space('s1', 'A栋', anchor(1, 0, 1));
    const devices = [
      device('d1', 's1', anchor(2, 0, 2)), // 自己标了，画在自己的坐标上
      device('d2', 's1'),
      device('d3', 's1'),
    ];

    const markers = buildMarkers([a], devices);
    const d1 = markers.find((m) => m.id === 'd1');

    expect(d1?.kind).toBe('device');
    expect(d1?.spaceId).toBe('s1');
    // 3 台都算 A栋 的。早先这里只数「没自己锚点的」，于是角标说 2、菜单说 3
    expect(badgeOf(markers, 's1')).toBe(3);
  });

  it('角标与 devicesInSpace 同源 —— 别处算出来的数必须一模一样', () => {
    const a = space('s1', 'A栋', anchor(1, 0, 1));
    const devices = [
      device('d1', 's1', anchor(3, 0, 3)), // 自己标过点
      device('d2', 's1'), // 没标
      device('d3', 's1', anchor(4, 0, 4, '000.9')), // 锚点版本失效，等于没标
      device('d4', 's2'), // 别的空间的，不算
    ];

    // 三种情形（自有锚点 / 没有锚点 / 锚点作废）都算 A栋 的，共 3 台
    expect(badgeOf(buildMarkers([a], devices), 's1')).toBe(
      devicesInSpace(devices, 's1').length,
    );
    expect(badgeOf(buildMarkers([a], devices), 's1')).toBe(3);
  });

  it('设备全都自己标了点，角标照样出（拥有数不为 0）', () => {
    const a = space('s1', 'A栋', anchor(1, 0, 1));
    const devices = [device('d1', 's1', anchor(2, 0, 2)), device('d2', 's1', anchor(3, 0, 3))];

    expect(badgeOf(buildMarkers([a], devices), 's1')).toBe(2);
  });

  it('不变量：空间下几行 + 该空间的独立标记数 = 这个空间拥有的设备数', () => {
    const a = space('s1', 'A栋', anchor(1, 0, 1));
    const devices = [
      device('d1', 's1', anchor(3, 0, 3)), // 独立
      device('d2', 's1'), // 列表
      device('d3', 's1'), // 列表
    ];

    const markers = buildMarkers([a], devices, { showDevices: true });
    const listed = markers.filter((m) => m.id.startsWith('s1@')).length;
    const standalone = markers.filter((m) => m.id === 'd1').length;

    expect(listed).toBe(2);
    expect(standalone).toBe(1);
    expect(listed + standalone).toBe(devicesInSpace(devices, 's1').length);
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

  it('打开后空间标记不再出角标 —— 列表已经把它说的事摊开了', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    const ds = [device('d1', 's1'), device('d2', 's1')];
    expect(badgeOf(buildMarkers([s], ds, { showDevices: true }), 's1')).toBe(0);
  });

  it('自己标过点的设备**不再**列在所属空间下 —— 一台设备只画一次', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    const markers = buildMarkers([s], [device('d1', 's1', anchor(9, 9, 9))], {
      showDevices: true,
    });

    // 顺序：pass ① 的独立标记、pass ② 的空间标记。没有 `s1@d1` ——
    // d1 已经画在自己的坐标上了，挂在空间下会是同一台设备的第二个标签
    expect(markers.map((m) => m.id)).toEqual(['d1', 's1']);
    expect(markers.find((m) => m.id === 'd1')?.spec.point).toEqual({ x: 9, y: 9, z: 9 });
  });

  it('不变量：勾上「显示设备」后，每台设备在画面上正好一次', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    const ds = [
      device('d1', 's1', anchor(9, 9, 9)), // 独立
      device('d2', 's1'), // 列表
      device('d3', 's1'), // 列表
    ];

    const markers = buildMarkers([s], ds, { showDevices: true });
    const dids = markers
      .filter((m) => m.kind === 'device')
      .map((m) => m.deviceId)
      .sort();

    // 有重复就是同一台设备被画了两处（画面上两个标签、用户分不清哪个是真的）
    expect(dids).toEqual(['d1', 'd2', 'd3']);
    expect(new Set(dids).size).toBe(dids.length);
  });

  it('自己的锚点版本失效时退回空间列表 —— 老坐标不算数，它跟着空间走', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    const stale = device('d1', 's1', anchor(9, 9, 9, '000.9'));
    const markers = buildMarkers([s], [stale], { showDevices: true });

    // 没有独立的 d1（老坐标不画），但在空间下有一行
    expect(markers.map((m) => m.id)).toEqual(['s1', 's1@d1']);
    expect(markers.find((m) => m.id === 's1@d1')?.spec.point).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('anchorFrom 分清位置是自有的还是借空间的 —— 菜单据此给不同项', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    const ds = [device('d1', 's1'), device('d2', 's1', anchor(9, 9, 9))];
    const markers = buildMarkers([s], ds, { showDevices: true });

    expect(markers.find((m) => m.id === 'd2')?.anchorFrom).toBe('device');
    expect(markers.find((m) => m.id === 's1@d1')?.anchorFrom).toBe('space');
    // d2 自己标了点，所以没有 `s1@d2` 这一份
    expect(markers.find((m) => m.id === 's1@d2')).toBeUndefined();
  });

  it('标过点的设备不占列表的行号 —— 行与行之间不留空档', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    const ds = [
      device('d1', 's1', anchor(9, 9, 9)), // 自己标过点，不参与列表排版
      device('d2', 's1'),
      device('d3', 's1'),
    ];

    const rows = buildMarkers([s], ds, { showDevices: true })
      .filter((m) => m.id.startsWith('s1@'))
      .map((m) => m.spec.offset?.y);
    // 26 / 52 是 DEVICE_ROW_PX 的 1、2 倍（第 0 格留给空间标签）
    expect(rows).toEqual([26, 52]);
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

describe('buildMarkers · 显示空间', () => {
  it('不传 showSpaces 时空间标记照出 —— 默认是「画」，锁住这条', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    expect(buildMarkers([s], [device('d1', 's1')]).map((m) => m.id)).toEqual(['s1']);
  });

  it('关掉后标了锚点的空间一个标记都不出，角标也没了', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    const ds = [device('d1', 's1'), device('d2', 's1')];
    expect(buildMarkers([s], ds, { showSpaces: false })).toEqual([]);
  });

  it('关掉后**不影响**自己单独标过点的设备 —— 它们不挂在任何空间标签下', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    const own = device('d1', 's1', anchor(9, 9, 9));
    const markers = buildMarkers([s], [own], { showSpaces: false });

    expect(markers.map((m) => m.id)).toEqual(['d1']);
    expect(markers[0].kind).toBe('device');
    expect(markers[0].deviceId).toBe('d1');
  });

  it('两层独立：空间标签关掉后，空间下的设备列表照常出，只是头顶没有空间名', () => {
    const s = space('s1', 'A栋', anchor(1, 2, 3));
    const ds = [device('d1', 's1'), device('d2', 's1')];
    const markers = buildMarkers([s], ds, { showSpaces: false, showDevices: true });

    // 空间标记没了，但两台设备都还在
    expect(markers.map((m) => m.id)).toEqual(['s1@d1', 's1@d2']);
    for (const m of markers) {
      expect(m.kind).toBe('device');
      // 位置仍然落在空间那个锚点上 —— 空间标签不画了，锚点还是 ④ 的位置来源
      expect(m.spec.point).toEqual({ x: 1, y: 2, z: 3 });
    }
  });

  it('关掉空间标签不改设备行的行号 —— 第 0 格是留给空间标签的，不能往上挪', () => {
    const s = space('s1', 'A栋', anchor(0, 0, 0));
    const ds = [device('d1', 's1'), device('d2', 's1')];
    const open = buildMarkers([s], ds, { showDevices: true });
    const closed = buildMarkers([s], ds, { showSpaces: false, showDevices: true });

    const rowsOf = (list: ReturnType<typeof buildMarkers>) =>
      list.filter((m) => m.kind === 'device').map((m) => m.spec.offset?.y);
    // 两边一模一样：勾一下开关整串列表不该跳 26px
    expect(rowsOf(closed)).toEqual([26, 52]);
    expect(rowsOf(closed)).toEqual(rowsOf(open));
  });

  it('没有锚点的空间，开关开着也本来就不出 —— 关掉不改变这一点', () => {
    const s = space('s1', 'A栋', null);
    expect(buildMarkers([s], [], { showSpaces: false })).toEqual([]);
    expect(buildMarkers([s], [], { showSpaces: true })).toEqual([]);
  });

  it('多个空间一起关，一个都不剩', () => {
    const a = space('s1', 'A栋', anchor(0, 0, 0));
    const b = space('s2', 'B栋', anchor(1, 0, 0));
    expect(buildMarkers([a, b], [], { showSpaces: false })).toEqual([]);
  });
});
