import { WindowConfig } from '../../../typedef/define/dashboard/WebDashboardLayout';

/**
 * 卡片配置的**防御性读取**（纯函数，无注入）。
 *
 * `WebDashboardWidget.config` 的类型是 `Record<string, unknown>`（见 typedef 里的说明）：库里可能
 * 存着旧版本写的、或者手改过的配置 —— 少字段、类型不对、`hours` 是负数都合法地存在。
 * 渲染层一律从这里取值，读不出合法值就当**没配**：
 * 「没配」在页面上是一个空卡片（看得见、说得清），而一个断言换来的只是编译器闭嘴。
 *
 * 三条与后端一致的判据：
 * - **不接受字符串数字**：线格式里数字就是数字，把 `"12"` 收下来只会掩盖后端的一次改动；
 * - **空串等于没配**：`metric: ""` 与不写 `metric` 是一回事（编辑器清空下拉就是这两个之一的产物）；
 * - **窗口要自洽**：`hours` 必须为正、`from ≤ to` —— 反过来的区间取数只会得到一片空，
 *   而页面会显示一张「什么都没有」的卡片，看不出是配置错了。
 */

/** 一个有限数；其余（字符串、NaN、Infinity、null）一律当作没读到 */
function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** 读一个非空字符串字段 */
export function readString(
  config: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = config?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** 读一个数字字段 */
export function readNumber(
  config: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  return finite(config?.[key]);
}

/**
 * 读一个字符串清单（`config.fields`：服务卡要显示哪几个字段）。
 *
 * **坏项逐个丢，不是整个清单作废**：一个 `null` 混在中间，不该让其余九个已选中的字段一起消失
 * —— 那表现成「卡片只剩一行」，而配置里明明写着十行，是要查很久的。与取数侧的
 * `bucketsOf` / `fieldRowsOf` 同一条取舍。
 *
 * 空串与空数组都归到「没配」：前者是脏数据，后者是用户把字段全取消勾选，
 * 两者在卡片上是同一件事（没有字段可显示），`undefined` 是这一个意思的一种写法。
 */
export function readStringArray(
  config: Record<string, unknown> | undefined,
  key: string,
): string[] | undefined {
  const value = config?.[key];
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return items.length > 0 ? items : undefined;
}

/**
 * 读一个布尔开关。**缺省合法**（与后端 `booleanErr` 的口径一致：键在就必须是布尔，
 * 不在就用 `fallback`）。
 *
 * 不给「把 `"true"` 当成真」这种宽容：线格式里布尔就是布尔，收下字符串只会掩盖后端的一次改动。
 * 反过来，脏值按缺省走而不是按 `false` 走 —— 「读不出来」与「用户关掉了」是两件事，
 * 后者不该由一次解析失败代劳。
 */
export function readBoolean(
  config: Record<string, unknown> | undefined,
  key: string,
  fallback: boolean,
): boolean {
  const value = config?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * 读时间窗口。
 *
 * 形状不对（`kind` 不认识、`last` 缺 `hours`、`range` 的 `from > to`）时返回 `undefined`，
 * 卡片就当作「没有窗口」。**不猜一个兜底窗口**：拿 24 小时去填一个没配窗口的卡片，
 * 会画出一段用户根本没要的时间，而图上没有任何东西表明这是猜的。
 */
export function readWindow(
  config: Record<string, unknown> | undefined,
  key: string = 'window',
): WindowConfig | undefined {
  const value = config?.[key];
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  if (raw['kind'] === 'last') {
    const hours = finite(raw['hours']);
    return hours !== undefined && hours > 0 ? { kind: 'last', hours } : undefined;
  }
  if (raw['kind'] === 'range') {
    const from = finite(raw['from']);
    const to = finite(raw['to']);
    return from !== undefined && to !== undefined && from <= to
      ? { kind: 'range', from, to }
      : undefined;
  }
  return undefined;
}
