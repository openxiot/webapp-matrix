/**
 * 数据看板 mock 数据。
 *
 * 后台没有设备/能耗/报警统计接口，这里在前端伪造数据：
 *   - 用 mulberry32 种子 PRNG，以「当天日期」为种子 → 同一天内刷新稳定，跨天自然变化
 *   - 类型名直接产出中文短语（本应用 i18n 键，zh 值即键），渲染时经 translate 翻译
 */

/** mulberry32 种子 PRNG：同一种子产生相同的伪随机序列 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 以日期派生种子：同一天内数据稳定，跨天自然变化 */
function seedOf(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function randInt(rand: () => number, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

export interface DeviceTypeStat {
  /** 设备类型名（i18n 键，中文短语） */
  type: string;
  count: number;
}

export interface DeviceStats {
  total: number;
  online: number;
  offline: number;
  byType: DeviceTypeStat[];
}

export interface DailyEnergy {
  /** MM-DD */
  date: string;
  /** kWh */
  value: number;
}

export interface EnergyStats {
  /** 本月能耗（kWh） */
  monthTotal: number;
  /** 近 30 天日能耗 */
  daily: DailyEnergy[];
}

export interface AlarmTypeStat {
  /** 报警类型名（i18n 键，中文短语） */
  type: string;
  count: number;
}

export interface AlarmStats {
  /** 今日报警总量 */
  todayCount: number;
  byType: AlarmTypeStat[];
  /** 近 24 小时报警曲线（HH:mm） */
  curve: {time: string; count: number}[];
}

const DEVICE_TYPES = ['智能网关', '温湿度传感器', '智能插座', '智能门锁', '网络摄像头', '烟感传感器'];
const ALARM_TYPES = ['高温报警', '烟雾报警', '非法闯入', '电量过低', '设备离线', '门未关闭'];

export function mockDeviceStats(date: Date): DeviceStats {
  const rand = mulberry32(seedOf(date));
  const byType: DeviceTypeStat[] = DEVICE_TYPES.map((type) => ({
    type,
    count: randInt(rand, 12, 42),
  }));
  const total = byType.reduce((sum, d) => sum + d.count, 0);
  // 在线率约 75% ~ 95%
  const online = Math.round(total * (0.75 + rand() * 0.2));
  return {total, online, offline: total - online, byType};
}

export function mockEnergyStats(date: Date): EnergyStats {
  const rand = mulberry32(seedOf(date) + 1);
  const daily: DailyEnergy[] = [];
  let monthTotal = 0;
  for (let i = 29; i >= 0; i--) {
    const d = new Date(date);
    d.setDate(d.getDate() - i);
    // 工作日偏高、周末偏低，叠加日常波动
    const dow = d.getDay();
    const base = dow === 0 || dow === 6 ? 62 : 78;
    const value = Math.round(base + rand() * 42);
    daily.push({
      date: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      value,
    });
    monthTotal += value;
  }
  return {monthTotal, daily};
}

export function mockAlarmStats(date: Date): AlarmStats {
  const rand = mulberry32(seedOf(date) + 2);
  const byType: AlarmTypeStat[] = ALARM_TYPES.map((type) => ({
    type,
    count: randInt(rand, 1, 12),
  }));
  const todayCount = byType.reduce((sum, d) => sum + d.count, 0);
  // 近 24 小时，以当前整点为终点；夜间休息时段报警偏少
  const curve: {time: string; count: number}[] = [];
  for (let i = 23; i >= 0; i--) {
    const h = (date.getHours() - i + 24) % 24;
    const night = h >= 23 || h < 6;
    curve.push({
      time: `${String(h).padStart(2, '0')}:00`,
      count: Math.max(0, (night ? 1 : 3) + randInt(rand, -1, 4)),
    });
  }
  return {todayCount, byType, curve};
}
