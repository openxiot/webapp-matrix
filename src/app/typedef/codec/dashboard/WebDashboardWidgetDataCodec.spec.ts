import { distributionData, lineData, statData, WebDashboardWidgetDataItem } from '../../define/dashboard/WebDashboardWidgetData';
import { WebDashboardWidgetDataCodec } from './WebDashboardWidgetDataCodec';

/**
 * 取数结果的解码与三个按类型的读取器。
 *
 * 这一层要挡住的是**一屏里一张卡坏掉**：`data` 是异构的，读取器只能防御性地读，
 * 而「防御」的分寸在这里定死：
 * - **`undefined` 与 `0` 分得开**：按小时累计的指标（`alarms.today`）只给 `hourly`、不给 `value`，
 *   把它读成 0 会让页面上出现一个「今日告警：0」的假数字。
 * - **一个坏点丢掉、整条曲线留下**：`points` 里混进一项畸形的，不该让整张图消失。
 * - **失败卡照样解出来**：一屏里有一张卡失败是常态，过滤掉会让「卡片数对不上」变成要查的事。
 */
describe('WebDashboardWidgetDataCodec', () => {
  it('整个 data 缺失也能解出一个空结果', () => {
    const data = WebDashboardWidgetDataCodec.decode(undefined);

    expect(data.spaceId).toBe('');
    expect(data.from).toBe(0);
    expect(data.widgets).toEqual([]);
  });

  it('失败的卡片照样解出来，message 留着', () => {
    // 过滤掉失败项，前端就得解释「后端给了 8 张、这里只有 7 张」是怎么来的
    const data = WebDashboardWidgetDataCodec.decode({
      widgets: [
        { id: 'w1', success: true, data: { value: 3 } },
        { id: 'w2', success: false, message: 'device not found' },
      ],
    });

    expect(data.widgets.length).toBe(2);
    expect(data.widgets[1].success).toBe(false);
    expect(data.widgets[1].message).toBe('device not found');
    expect(data.widgets[1].data).toEqual({});
  });

  it('success 只认 true', () => {
    expect(WebDashboardWidgetDataCodec.decodeItem({}).success).toBe(false);
    expect(WebDashboardWidgetDataCodec.decodeItem({ success: 'yes' }).success).toBe(false);
  });

  it('message 缺失时保持 undefined', () => {
    expect(WebDashboardWidgetDataCodec.decodeItem({ success: true }).message).toBeUndefined();
  });
});

describe('statData', () => {
  it('value 缺失时保持 undefined —— 不能读成 0', () => {
    // 「今日告警」这类卡片只给 hourly：「0」是一个会显示给用户的假数字
    const data = statData(item({ hourly: [{ at: 1, count: 4 }], to: 100 }));

    expect(data.value).toBeUndefined();
    expect(data.hourly).toEqual([{ at: 1, count: 4 }]);
    expect(data.to).toBe(100);
  });

  it('value: 0 要留住', () => {
    expect(statData(item({ value: 0 })).value).toBe(0);
  });

  it('字符串数字不收（线格式里数字就是数字）', () => {
    // 收下 "12" 只会掩盖后端的一次改动
    expect(statData(item({ value: '12' })).value).toBeUndefined();
  });

  it('NaN / Infinity 不收', () => {
    expect(statData(item({ value: Number.NaN })).value).toBeUndefined();
  });

  it('hourly 里的坏项丢掉，好的留下', () => {
    const data = statData(item({ hourly: [{ at: 1, count: 2 }, { at: 2 }, 'x', null, { count: 3 }] }));

    expect(data.hourly).toEqual([{ at: 1, count: 2 }]);
  });

  it('hourly 不是数组时当空数组', () => {
    expect(statData(item({ hourly: {} })).hourly).toEqual([]);
  });
});

describe('distributionData', () => {
  it('全量分组照单解出，顺序不动（后端已按条数排好）', () => {
    const data = distributionData(
      item({
        groups: [
          { key: 'dtu', count: 5 },
          { key: 'meter', count: 3 },
        ],
      }),
    );

    expect(data.groups.map((g) => g.key)).toEqual(['dtu', 'meter']);
  });

  it('空串键是合法的（没配点表的服务就落在空串上）', () => {
    // 把空串当缺失丢掉，饼上就会少一块、而且总和对不上
    const data = distributionData(item({ groups: [{ key: '', count: 2 }] }));

    expect(data.groups).toEqual([{ key: '', count: 2 }]);
  });

  it('缺 key 或 count 的项丢掉', () => {
    const data = distributionData(item({ groups: [{ key: 'dtu' }, { count: 3 }, { key: 'x', count: 1 }] }));

    expect(data.groups).toEqual([{ key: 'x', count: 1 }]);
  });

  it('groups 缺失时当空数组（合法的空分布）', () => {
    expect(distributionData(item({})).groups).toEqual([]);
  });
});

describe('lineData', () => {
  it('取出区间与整点桶', () => {
    const data = lineData(item({ from: 10, to: 20, points: [{ at: 10, count: 1 }, { at: 11, count: 0 }] }));

    expect(data.from).toBe(10);
    expect(data.to).toBe(20);
    // 没发生的整点是 0 且**在数组里**：前端据此连线，不必猜空档
    expect(data.points).toEqual([
      { at: 10, count: 1 },
      { at: 11, count: 0 },
    ]);
  });

  it('from / to 缺失时给 0，而不是 undefined', () => {
    const data = lineData(item({}));

    expect(data.from).toBe(0);
    expect(data.to).toBe(0);
  });
});

/** 一张卡的取数结果（只需要 `data` 时用这个）。 */
function item(data: Record<string, unknown>): WebDashboardWidgetDataItem {
  const x = new WebDashboardWidgetDataItem();
  x.id = 'w1';
  x.success = true;
  x.data = data;
  return x;
}
