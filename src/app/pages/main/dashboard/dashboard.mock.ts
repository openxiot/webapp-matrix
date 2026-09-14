/**
 * 数据看板**仅剩**的伪造数据：能耗。
 *
 * 理由是没有能耗采集 —— 设备与告警的数字已全部来自真实接口
 * （`GET /matrix/v1/statistics/overview/{spaceId}`，见 statistics.service.ts）；
 * 「本月能耗」与「日能耗曲线」两张卡仍是这张种子表。
 *
 * 伪造法：用 mulberry32 种子 PRNG，以「当天日期」为种子 → 同一天内刷新稳定，跨天自然变化。
 * 换成真实能耗时，把这一整个文件删掉即可（只有本文件与 dashboard.component 用它）。
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
  return { monthTotal, daily };
}
