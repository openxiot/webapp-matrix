import { SpecSource, joinPid, specProperties, splitPid } from './device.spec.service';

/**
 * 设备卡的属性名与单位从哪来。
 *
 * 钉住的是**两处会安静地错**的地方：
 * - pid 的切法。`did` 自己可能带点，「按 `.` 分段」在那种 did 上会切出一个**另一个属性**，
 *   而屏幕上只是显示了一个看着正常的名字与单位 —— 没有任何报错；
 * - 规格摊平时两级 `iid` 有没有搬对。搬错的表现是查不到属性（卡片退回 pid 原文），
 *   或者更糟：查到隔壁那个属性的名字。
 *
 * `DeviceSpecService` 自己的那点逻辑（幂等、缓存、语言回退）没在这里验：它靠 `inject()`
 * 取 `ProductService` 与 i18n，单测要先搭 TestBed 与 HttpClient，而它做的事就是
 * 「调 {@link specProperties}，然后从 Map 里查」—— 真正的逻辑都在下面这两个纯函数里。
 */
describe('device.spec.service', () => {
  describe('splitPid', () => {
    it('`<did>.<siid>.<piid>` 切成后两段', () => {
      expect(splitPid('did-1', 'did-1.1.1')).toEqual({ siid: 1, piid: 1 });
      expect(splitPid('did-1', 'did-1.12.34')).toEqual({ siid: 12, piid: 34 });
    });

    it('did 自己带点也切得对（按 did 前缀切，不按 `.` 分段）', () => {
      // 这是这个函数存在的全部理由：按 `.` 分三段取后两段，在这里会得到 `{siid: 2, piid: 3}` ——
      // 也就是**另一个属性**，卡片会显示它的名字与单位，而且看不出错
      expect(splitPid('a.b.c', 'a.b.c.1.1')).toEqual({ siid: 1, piid: 1 });
      expect(splitPid('192.168.1.7', '192.168.1.7.2.3')).toEqual({ siid: 2, piid: 3 });
    });

    it('前缀对不上（pid 是别的设备的）→ undefined，卡片退回 pid 原文', () => {
      expect(splitPid('did-1', 'did-2.1.1')).toBeUndefined();
      // 差一个字符也算对不上：不能靠「去除公共前缀」那种模糊匹配
      expect(splitPid('did-1', 'did-12.1.1')).toBeUndefined();
    });

    it('did 为空 → undefined（空前缀会匹配上一切）', () => {
      expect(splitPid('', 'did-1.1.1')).toBeUndefined();
    });

    it('后两段不齐 / 不是整数 → undefined', () => {
      expect(splitPid('did-1', 'did-1.1')).toBeUndefined();
      expect(splitPid('did-1', 'did-1.')).toBeUndefined();
      expect(splitPid('did-1', 'did-1.a.1')).toBeUndefined();
      expect(splitPid('did-1', 'did-1.1.b')).toBeUndefined();
      // 多一段：前缀对上了，但剩下的不是一个 `siid.piid`，收下它只会切错
      expect(splitPid('did-1', 'did-1.1.2.3')).toBeUndefined();
    });

    it('末段为空 → undefined（空串会被 Number 当成 0，那会切出一个看着合法的 `piid: 0`）', () => {
      expect(splitPid('did-1', 'did-1.1.')).toBeUndefined();
    });

    it('带空白 / 十六进制的段不收（线格式里 iid 就是十进制整数）', () => {
      // `Number()` 会把这些都当数：`' 1'` → 1、`'0x10'` → 16。收下它们只是掩盖服务端的一次改动
      expect(splitPid('did-1', 'did-1. 1.1')).toBeUndefined();
      expect(splitPid('did-1', 'did-1.0x1.1')).toBeUndefined();
    });

    it('pid 就是 did 本身 → undefined（没有可切的后两段）', () => {
      expect(splitPid('did-1', 'did-1')).toBeUndefined();
    });
  });

  describe('joinPid', () => {
    it('与 splitPid 是一对（拼出来的能切回去）', () => {
      const pid = joinPid('did-1', 3, 7);
      expect(pid).toBe('did-1.3.7');
      expect(splitPid('did-1', pid)).toEqual({ siid: 3, piid: 7 });
    });

    it('did 带点时也拼得对（拼接不歧义，切的时候才要格外小心）', () => {
      const pid = joinPid('a.b.c', 1, 2);
      expect(pid).toBe('a.b.c.1.2');
      expect(splitPid('a.b.c', pid)).toEqual({ siid: 1, piid: 2 });
    });
  });

  describe('specProperties', () => {
    /** 一份规格：两个服务、共三个属性（第二个服务里那个没有单位与描述） */
    function spec(): SpecSource {
      return {
        services: new Map([
          [
            1,
            {
              iid: 1,
              properties: new Map([
                [1, { iid: 1, unit: '℃', description: new Map([['zh-CN', '温度']]) }],
                [2, { iid: 2, unit: null, description: new Map([['zh-CN', '开关']]) }],
              ]),
            },
          ],
          [4, { iid: 4, properties: new Map([[9, { iid: 9 }]]) }],
        ]),
      };
    }

    it('摊平成属性表，两级 iid 各就各位（与 pid 中间/最后那两段一一对应）', () => {
      expect(specProperties(spec()).map((p) => [p.siid, p.piid])).toEqual([
        [1, 1],
        [1, 2],
        [4, 9],
      ]);
    });

    it('单位缺失给空串、描述缺失给空 Map（调用方不必判 null）', () => {
      const [, , third] = specProperties(spec());
      expect(third.unit).toBe('');
      expect(third.description.size).toBe(0);
      expect(specProperties(spec())[1].unit).toBe('');
    });

    it('描述整份拷贝：改结果不会动到规格里那一份', () => {
      const source = spec();
      const properties = specProperties(source);
      properties[0].description.set('zh-CN', '改过了');
      expect(source.services?.get(1)?.properties?.get(1)?.description?.get('zh-CN')).toBe('温度');
    });

    it('规格还没到 / 没有服务 / 服务没有属性 → 空数组，不抛', () => {
      expect(specProperties(undefined)).toEqual([]);
      expect(specProperties({})).toEqual([]);
      expect(specProperties({ services: null })).toEqual([]);
      expect(specProperties({ services: new Map([[1, { iid: 1 }]]) })).toEqual([]);
    });
  });
});
