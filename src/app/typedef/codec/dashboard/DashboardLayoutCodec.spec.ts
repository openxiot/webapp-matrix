import { DashboardLayout, WIDGET_SIZES } from '../../define/dashboard/DashboardLayout';
import { DashboardLayoutCodec } from './DashboardLayoutCodec';

/**
 * 布局的编解码。断言的重点不是「字段抄全了」，而是三条**错了不会报错、只会悄悄不对**的口径：
 *
 * - **`decode` 什么都不补**：`title` 没设就是 `undefined`，不是空串。
 *   补了的话「没设」与「设成了空」再也分不开 —— 前者要退回预置名，后者是用户真的把标题清空了。
 * - **老键跳过**：`layout`（嵌套坐标，更早的形状）与 `refresh`（每卡一个刷新周期，改造前）
 *   都在这个口径里 —— 读得进、不报错、下次保存自然就没了。
 * - **`encode` 只发该发的**：`w` / `h` 不发（那是从 `size` 档位推出来的，服务端只认档位名），
 *   而 `version` 是乐观锁，**必须发** —— 漏了后端按「首次保存」处理，别人的改动被无声覆盖。
 * - **坐标两个一起发、一起不发**：只发一个就是脏数据，服务端两个都要。
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

    it('不认识的 type 与 size 各退回 stat / W6H200，而不是让它们流到渲染里', () => {
      // 库里存着将来某版本写的 type 时，宁可显示成一张统计卡，也不要一个渲染不出来的空壳
      const widget = DashboardLayoutCodec.decodeWidget({ type: 'sankey', size: 'XXL' });

      expect(widget.type).toBe('stat');
      expect(widget.size).toBe('W6H200');
    });

    it('**改造前的档位名读得出来**：翻译成新名，而不是落进兜底档位', () => {
      // 库里存着的布局写的是旧名。认不出来就会落到兜底档位 —— 那是一次**静默的改尺寸**：
      // 用户没动过的卡片自己变了大小，界面上查不出原因。所以六个旧名每一个都要有去处，
      // 且去处是**占格完全相同**的那一档（S 与 W6H200 都是 6 列 2 行）
      const cases: [string, string][] = [
        ['S1', 'W6H92'],
        ['M1', 'W12H92'],
        ['S', 'W6H200'],
        ['M', 'W12H200'],
        ['L', 'W12H416'],
        ['XL', 'W24H416'],
      ];

      for (const [legacy, current] of cases) {
        expect(DashboardLayoutCodec.decodeWidget({ size: legacy }).size).toBe(current);
      }
    });

    it('新名优先：一个恰好也叫旧名的档位不会被翻译走', () => {
      // 今天两套名字不相交（新名以 W 开头），这条钉的是**判断顺序** ——
      // 先查现名、再查旧名。反过来的话，将来哪天新起一个与旧名同名的档位就会读错
      for (const size of Object.keys(WIDGET_SIZES)) {
        expect(DashboardLayoutCodec.decodeWidget({ size }).size).toBe(size);
      }
    });

    it('title / titleKey 没下发时保持 undefined，不补空值', () => {
      const widget = DashboardLayoutCodec.decodeWidget({ id: 'w1' });

      expect(widget.title).toBeUndefined();
      expect(widget.titleKey).toBeUndefined();
    });

    it('老文档里的 refresh 是历史残留：跳过，不认识也不报错', () => {
      // 改造前每张卡各带一个 `refresh`，现在整屏一个间隔、记在浏览器里（见方案 §5.2）。
      // 那个键与 `layout` 一样属于「不认识的键」，codec 当没看见 —— 读得进，
      // 而且这一趟前端过完再保存时就自然没了
      const widget = DashboardLayoutCodec.decodeWidget({ id: 'w1', refresh: 0 });

      expect('refresh' in widget).toBe(false);
      expect('refresh' in DashboardLayoutCodec.encodeWidget(widget)).toBe(false);
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

    it('老文档里那个嵌套的 layout 仍然被忽略（它是历史残留，不是现在的坐标）', () => {
      // 改造前存的文档里每条 widget 都带一个 `layout: {x, y, w, h}`。那一版连同它的
      // `w`/`h` 一起废掉了，现在线上跑的是**平铺的** `x` / `y`。老键不读也不写：
      // 解出来照常是一张正常的卡，第一次保存就把它洗掉
      const widget = DashboardLayoutCodec.decodeWidget({
        id: 'w1',
        layout: { x: 6, y: 4, w: 12, h: 8 },
      });

      expect(widget.id).toBe('w1');
      expect((widget as unknown as Record<string, unknown>)['layout']).toBeUndefined();
      // 老键**不等于**坐标：解出来仍然是没有坐标的，页面据此整份重铺
      expect(widget.x).toBeUndefined();
      expect(widget.y).toBeUndefined();
    });

    it('坐标读成两个整数', () => {
      const widget = DashboardLayoutCodec.decodeWidget({ id: 'w1', x: 6, y: 4 });

      expect(widget.x).toBe(6);
      expect(widget.y).toBe(4);
    });

    it('坐标两个都要：只给一个的按「都没有」处理', () => {
      // 只给一个的文档只可能是写到一半或被手工改过。收下那半个等于把一个来路不明的
      // 位置当成用户摆的 —— 整份重铺虽然会动版式，但至少结果自洽
      const onlyX = DashboardLayoutCodec.decodeWidget({ id: 'w1', x: 6 });
      const onlyY = DashboardLayoutCodec.decodeWidget({ id: 'w1', y: 4 });

      expect(onlyX.x).toBeUndefined();
      expect(onlyX.y).toBeUndefined();
      expect(onlyY.x).toBeUndefined();
      expect(onlyY.y).toBeUndefined();
    });

    it('坐标不是非负整数就当没这个键（字符串数字、小数、负数一律不收）', () => {
      // `"6"` 收下来只会掩盖后端的一次序列化改动；小数与负数根本不是格子下标。
      // 三种都退回「没有坐标」，由页面整份重铺
      for (const x of ['6', 6.5, -1, null, true, NaN]) {
        const widget = DashboardLayoutCodec.decodeWidget({ id: 'w1', x, y: 4 });

        expect(widget.x).toBeUndefined();
        expect(widget.y).toBeUndefined();
      }
    });

    it('y 为 0 是合法坐标（第一行），不是「没设」', () => {
      // `if (y)` 会把 0 当缺省丢掉，于是一张摆在第一行的卡每次刷新都往上跳
      const widget = DashboardLayoutCodec.decodeWidget({ id: 'w1', x: 0, y: 0 });

      expect(widget.x).toBe(0);
      expect(widget.y).toBe(0);
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

    it('坐标要发出去：不发就等于每次保存都退回贪婪铺，刷新一次整屏重排', () => {
      const widget = DashboardLayoutCodec.decodeWidget({ id: 'w1', size: 'W12H416', x: 6, y: 4 });

      const body = DashboardLayoutCodec.encodeWidget(widget);

      expect(body.x).toBe(6);
      expect(body.y).toBe(4);
    });

    it('没有坐标的卡片一个坐标键都不发（发半个更糟）', () => {
      // 旧布局的卡片没有坐标。这时**两个都不发**，服务端存的就是「还没摆过」，
      // 页面下次打开会整份重铺 —— 比发一个 `x` 配一个缺 `y` 强，那是脏数据
      const body = DashboardLayoutCodec.encodeWidget(DashboardLayoutCodec.decodeWidget({ id: 'w1' }));

      expect('x' in body).toBe(false);
      expect('y' in body).toBe(false);
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

    it('config 总是要发（哪怕是空的）', () => {
      const widget = DashboardLayoutCodec.decodeWidget({ id: 'w1' });

      expect(DashboardLayoutCodec.encodeWidget(widget).config).toEqual({});
    });
  });

  describe('往返', () => {
    it('解出来再编回去是同一份（含坐标）', () => {
      const raw = {
        id: 'w1',
        type: 'stat',
        title: '东区设备',
        size: 'W12H200',
        x: 6,
        y: 4,
        config: { metric: 'devices.total', window: { kind: 'last', hours: 24 } },
      };

      const decoded = DashboardLayoutCodec.decodeWidget(raw);

      expect(DashboardLayoutCodec.encodeWidget(decoded)).toEqual({
        id: 'w1',
        type: 'stat',
        title: '东区设备',
        size: 'W12H200',
        x: 6,
        y: 4,
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

    it('整份布局的往返：卡片顺序、坐标与 id 保真', () => {
      // 顺序是**阅读顺序**（窄屏一列时的上下次序），坐标是位置的真值，id 是渲染结果认领卡片
      // 的依据 —— 三个都不能在搬运中变
      const raw = {
        spaceId: 'space-1',
        version: 2,
        widgets: [
          { id: 'w1', type: 'stat', size: 'W6H92', x: 0, y: 0, config: {} },
          { id: 'w2', type: 'line', size: 'W24H416', x: 0, y: 2, config: {} },
        ],
      };

      const saved = DashboardLayoutCodec.decode(raw);
      const roundTripped = DashboardLayoutCodec.decode(DashboardLayoutCodec.encode(saved));

      expect(roundTripped.widgets.map((w) => w.id)).toEqual(['w1', 'w2']);
      expect(roundTripped.widgets.map((w) => w.size)).toEqual(['W6H92', 'W24H416']);
      expect(roundTripped.widgets.map((w) => [w.x, w.y])).toEqual([
        [0, 0],
        [0, 2],
      ]);
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
