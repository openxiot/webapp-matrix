import { DashboardLayout } from '../../define/dashboard/DashboardLayout';
import { DashboardLayoutCodec } from './DashboardLayoutCodec';

/**
 * 布局的编解码。断言的重点不是「字段抄全了」，而是三条**错了不会报错、只会悄悄不对**的口径：
 *
 * - **`decode` 什么都不补**：`title` / `refresh` 没设就是 `undefined`，不是空串 / 0。
 *   补了的话「没设」与「设成了空」再也分不开 —— 前者要退回预置名与默认刷新，
 *   后者是用户真的把标题清空了。
 * - **`refresh: 0` 是真值**（= 不自动刷新），与「没设」是两件事。写成 `if (refresh)` 就丢了。
 * - **`encode` 只发该发的**：`w` / `h` 由服务端按 `size` 覆盖，发上去只会让「谁说了算」含糊；
 *   而 `version` 是乐观锁，**必须发** —— 漏了后端按「首次保存」处理，别人的改动被无声覆盖。
 *
 * 还有一条容易忽略的：**编辑器不解读的 config 键必须原样带回去**。用户只改了卡片标题，
 * 不该因为过了一趟前端就把 `serviceId` / `fields` 这些取数侧才读的配置丢掉。
 */
describe('DashboardLayoutCodec', () => {
  describe('decode 的兜底', () => {
    it('整个 data 缺失也能解出一份空布局', () => {
      // 后端异常返回时不该在页面里炸出一个 TypeError，空布局比崩溃好
      const layout = DashboardLayoutCodec.decode(undefined);

      expect(layout.spaceId).toBe('');
      expect(layout.version).toBe(0);
      expect(layout.widgets).toEqual([]);
    });

    it('widgets 缺失 / 不是数组时当空数组', () => {
      expect(DashboardLayoutCodec.decode({ widgets: null }).widgets).toEqual([]);
      expect(DashboardLayoutCodec.decode({ widgets: {} }).widgets).toEqual([]);
    });

    it('不认识的 type 与 size 各退回 stat / S，而不是让它们流到渲染里', () => {
      // 库里存着将来某版本写的 type 时，宁可显示成一张统计卡，也不要一个渲染不出来的空壳
      const widget = DashboardLayoutCodec.decodeWidget({ type: 'sankey', size: 'XXL' });

      expect(widget.type).toBe('stat');
      expect(widget.size).toBe('S');
    });

    it('title / titleKey / refresh 没下发时保持 undefined，不补空值', () => {
      const widget = DashboardLayoutCodec.decodeWidget({ id: 'w1' });

      expect(widget.title).toBeUndefined();
      expect(widget.titleKey).toBeUndefined();
      expect(widget.refresh).toBeUndefined();
    });

    it('refresh: 0 要留住（那是「不自动刷新」，不是「没设」）', () => {
      // `if (o?.refresh)` 会把 0 当缺省丢掉，于是一张明确配了「不刷新」的卡开始自己刷新
      expect(DashboardLayoutCodec.decodeWidget({ refresh: 0 }).refresh).toBe(0);
      expect(DashboardLayoutCodec.decodeWidget({}).refresh).toBeUndefined();
    });

    it('config 缺失时给空对象而不是 undefined', () => {
      // 渲染侧一律 `widget.config.xxx`，给 undefined 等于让每处调用都要先判空
      expect(DashboardLayoutCodec.decodeWidget({}).config).toEqual({});
      expect(DashboardLayoutCodec.decodeWidget({ config: 'oops' }).config).toEqual({});
    });

    it('config 是拷一份，不与入参共用', () => {
      // 编辑器改 config 时若写进了那份原始响应，重开对话框会看到改了一半的状态
      const raw = { config: { metric: 'devices.total' } };
      const widget = DashboardLayoutCodec.decodeWidget(raw);

      widget.config['metric'] = 'alarms.today';

      expect(raw.config.metric).toBe('devices.total');
    });

    it('老文档里的 layout 被忽略（顺序进线格式不需要迁移）', () => {
      // 改造前存的文档里每条 widget 都带一组坐标。顺序进线之后它们没有归宿了，
      // 而**不是**报错：解出来照常是一张正常的卡，第一次保存就把这个键洗掉
      const widget = DashboardLayoutCodec.decodeWidget({
        id: 'w1',
        layout: { x: 6, y: 4, w: 12, h: 8 },
      });

      expect(widget.id).toBe('w1');
      expect((widget as unknown as Record<string, unknown>)['layout']).toBeUndefined();
    });

    it('creator / updater 缺失时不编一个空对象出来', () => {
      // 预置布局没有作者。补一个 {id: undefined} 会让页面显示出一行空白署名
      expect(DashboardLayoutCodec.decode({}).creator).toBeUndefined();
      expect(DashboardLayoutCodec.decode({}).updater).toBeUndefined();
      expect(DashboardLayoutCodec.decode({ creator: null }).creator).toBeUndefined();
    });

    it('creator 带着人话与时间戳', () => {
      const layout = DashboardLayoutCodec.decode({
        creator: { id: 'acc-1', name: '张三', timestamp: 100 },
      });

      expect(layout.creator).toEqual({ id: 'acc-1', name: '张三', timestamp: 100 });
    });
  });

  describe('encode 只发该发的', () => {
    it('version 原样回传（乐观锁靠它，漏了就变成一次覆盖写）', () => {
      const layout = DashboardLayoutCodec.decode({ version: 3, widgets: [] });

      expect(DashboardLayoutCodec.encode(layout).version).toBe(3);
    });

    it('一个坐标都不发：排版就是 widgets 的数组顺序', () => {
      const widget = DashboardLayoutCodec.decodeWidget({
        id: 'w1',
        size: 'L',
        layout: { x: 6, y: 4, w: 12, h: 8 },
      });

      expect('layout' in DashboardLayoutCodec.encodeWidget(widget)).toBe(false);
    });

    it('不发 spaceId / creator / updater：这些由服务端从路径与 JWT 取', () => {
      const body = DashboardLayoutCodec.encode(
        DashboardLayoutCodec.decode({
          spaceId: 'space-1',
          version: 1,
          creator: { id: 'acc-1' },
          updater: { id: 'acc-1' },
        }),
      );

      expect(Object.keys(body).sort()).toEqual(['version', 'widgets']);
    });

    it('空标题不发键：用户的「清空标题」本意是改回默认名', () => {
      const widget = DashboardLayoutCodec.decodeWidget({ id: 'w1', title: '' });

      expect('title' in DashboardLayoutCodec.encodeWidget(widget)).toBe(false);
    });

    it('没改标题的卡片把 titleKey 带回去（否则预置名会被洗掉）', () => {
      const widget = DashboardLayoutCodec.decodeWidget({ id: 'w1', titleKey: '设备总数' });

      expect(DashboardLayoutCodec.encodeWidget(widget).titleKey).toBe('设备总数');
    });

    it('用户起了名字的卡片不再带 titleKey', () => {
      // 这张卡已经是用户的了，不该再留一个会随服务端改预置文案而变的旧记号
      const widget = DashboardLayoutCodec.decodeWidget({
        id: 'w1',
        titleKey: '设备总数',
        title: '东区设备',
      });

      const body = DashboardLayoutCodec.encodeWidget(widget);

      expect(body.title).toBe('东区设备');
      expect('titleKey' in body).toBe(false);
    });

    it('refresh: 0 要发上去', () => {
      const widget = DashboardLayoutCodec.decodeWidget({ id: 'w1', refresh: 0 });

      expect(DashboardLayoutCodec.encodeWidget(widget).refresh).toBe(0);
    });

    it('config 总是要发（哪怕是空的）', () => {
      const widget = DashboardLayoutCodec.decodeWidget({ id: 'w1' });

      expect(DashboardLayoutCodec.encodeWidget(widget).config).toEqual({});
    });
  });

  describe('往返', () => {
    it('解出来再编回去是同一份', () => {
      const raw = {
        id: 'w1',
        type: 'stat',
        title: '东区设备',
        size: 'M',
        refresh: 30,
        config: { metric: 'devices.total', window: { kind: 'last', hours: 24 } },
      };

      const decoded = DashboardLayoutCodec.decodeWidget(raw);

      expect(DashboardLayoutCodec.encodeWidget(decoded)).toEqual({
        id: 'w1',
        type: 'stat',
        title: '东区设备',
        size: 'M',
        refresh: 30,
        config: { metric: 'devices.total', window: { kind: 'last', hours: 24 } },
      });
    });

    it('编辑器不认识的 config 键原样带回去', () => {
      // 只改了标题、没动配置：`display` 这类 codec 根本不解读的键不该因为过了一趟前端就没了
      const widget = DashboardLayoutCodec.decodeWidget({
        id: 'w1',
        type: 'service',
        config: {
          serviceId: 'svc-1',
          functionIndex: 2,
          fields: ['温度', '状态.bit0'],
          display: 'value',
          window: { kind: 'last', hours: 24 },
        },
      });

      expect(DashboardLayoutCodec.encodeWidget(widget).config).toEqual({
        serviceId: 'svc-1',
        functionIndex: 2,
        fields: ['温度', '状态.bit0'],
        display: 'value',
        window: { kind: 'last', hours: 24 },
      });
    });

    it('嵌套的 config 解出来仍是对象与数组，不被展平', () => {
      // window 是文档、fields 是数组：读成字符串会让校验器与取数静默失灵
      const widget = DashboardLayoutCodec.decodeWidget({
        config: { window: { kind: 'range', from: 1, to: 2 }, fields: ['温度'] },
      });

      expect(widget.config['window']).toEqual({ kind: 'range', from: 1, to: 2 });
      expect(Array.isArray(widget.config['fields'])).toBe(true);
    });

    it('整份布局的往返：卡片顺序与 id 保真', () => {
      // 顺序**就是版式**（拖拽换的就是它），id 是渲染结果认领卡片的依据，两个都不能在搬运中变
      const raw = {
        spaceId: 'space-1',
        version: 2,
        widgets: [
          { id: 'w1', type: 'stat', size: 'S', config: {} },
          { id: 'w2', type: 'line', size: 'XL', config: {} },
        ],
      };

      const saved = DashboardLayoutCodec.decode(raw);
      const roundTripped = DashboardLayoutCodec.decode(DashboardLayoutCodec.encode(saved));

      expect(roundTripped.widgets.map((w) => w.id)).toEqual(['w1', 'w2']);
      expect(roundTripped.widgets.map((w) => w.size)).toEqual(['S', 'XL']);
      expect(roundTripped.version).toBe(2);
    });

    it('保存后返回的布局能直接替换手里那份（连存两次不该第二次就撞版本冲突）', () => {
      // 服务端返回的是**保存之后**的布局，版本号已 +1；用它替换手里那份才谈得上「连存两次」
      const held = new DashboardLayout();
      held.version = 0;
      const returned = DashboardLayoutCodec.decode({ version: 1, widgets: [] });

      expect(DashboardLayoutCodec.encode(held).version).toBe(0);
      expect(DashboardLayoutCodec.encode(returned).version).toBe(1);
    });
  });
});
