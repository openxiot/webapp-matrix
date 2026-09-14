import {
  ModbusFailureCodeCount,
  ModbusFailureSummary,
  ModbusFailureTypeCount,
  ModbusHistoryBucket,
  ModbusHistoryCurrent,
  ModbusHistoryFailure,
  ModbusHistoryFailures,
  ModbusHistoryFunctionState,
  ModbusHistoryPoint,
  ModbusHistoryRange,
  ModbusHistorySample,
} from '../../define/modbus/ModbusHistory';

/**
 * 采集历史三个接口的返回与前端实体的互转。**只解不编**：历史是服务端写、前端读，
 * 前端没有任何回写这份数据的路径（轮询配置在服务定义上，走 ModbusServiceCodec）。
 *
 * 时间键 `at` / `until` / `recordedAt` / `errorAt` / `from` / `to` / `lastAt` 线上都是毫秒时间戳，
 * 前端原样存数字（展示再格式化），不做 Date 转换 —— 后端就是 `Date.getTime()`，来回一趟不该失真。
 */
export class ModbusHistoryCodec {
  /* ----------------------------------------------------------------------------------------------
   * 当前值（/current）
   * ----------------------------------------------------------------------------------------------*/

  static decodeCurrent(o: any): ModbusHistoryCurrent {
    const x = new ModbusHistoryCurrent();
    x.serviceId = o?.serviceId ?? '';
    x.functions = ModbusHistoryCodec.decodeStateArray(o?.functions);
    return x;
  }

  static decodeStateArray(array: any): ModbusHistoryFunctionState[] {
    const list: ModbusHistoryFunctionState[] = [];
    if (!(array instanceof Array)) {
      return list;
    }
    for (const item of array) {
      const x = new ModbusHistoryFunctionState();
      x.functionIndex = item?.functionIndex ?? 0;
      x.fields = item?.fields ?? {};
      // 没成功采过 / 当前没失败时后端不下发这两个键，保持 undefined 以便区分「没有」与「空串」
      if (item?.recordedAt != null) {
        x.recordedAt = item.recordedAt;
      }
      if (item?.lastError != null) {
        x.lastError = item.lastError;
      }
      if (item?.errorAt != null) {
        x.errorAt = item.errorAt;
      }
      list.push(x);
    }
    return list;
  }

  /* ----------------------------------------------------------------------------------------------
   * 序列（/range）
   * ----------------------------------------------------------------------------------------------*/

  static decodeRange(o: any): ModbusHistoryRange {
    const x = new ModbusHistoryRange();
    x.serviceId = o?.serviceId ?? '';
    x.functionIndex = o?.functionIndex ?? 0;
    x.field = o?.field ?? '';
    x.from = o?.from ?? 0;
    x.to = o?.to ?? 0;
    x.maxPoints = o?.maxPoints ?? 0;
    x.downsampled = o?.downsampled === true;
    x.total = o?.total ?? 0;
    // 点集是原始样本还是降采样桶由 downsampled 决定：两者都是 {at, ...}，
    // 光看键猜不可靠（桶的 first/last 与样本的 value 语义完全不同），故显式按标志分流。
    x.points = x.downsampled
      ? ModbusHistoryCodec.decodeBucketArray(o?.points)
      : ModbusHistoryCodec.decodeSampleArray(o?.points);
    if (o?.carryIn != null) {
      x.carryIn = ModbusHistoryCodec.decodeSample(o.carryIn);
    }
    return x;
  }

  static decodeSample(o: any): ModbusHistorySample {
    const x = new ModbusHistorySample();
    x.at = o?.at ?? 0;
    x.value = o?.value;
    // 后端只在 keepalive 为 true 时下发这个键，故「有键即真」，不做 !! 转换
    if (o?.keepalive === true) {
      x.keepalive = true;
    }
    return x;
  }

  static decodeSampleArray(array: any): ModbusHistorySample[] {
    const list: ModbusHistorySample[] = [];
    if (array instanceof Array) {
      for (const item of array) {
        list.push(ModbusHistoryCodec.decodeSample(item));
      }
    }
    return list;
  }

  static decodeBucket(o: any): ModbusHistoryBucket {
    const x = new ModbusHistoryBucket();
    x.at = o?.at ?? 0;
    x.until = o?.until ?? 0;
    x.count = o?.count ?? 0;
    x.first = o?.first;
    x.last = o?.last;
    // 非数值字段的三个统计量是 null（键仍在），故用 ?? null 而不是 ?? 0：0 是合法读数
    x.min = o?.min ?? null;
    x.max = o?.max ?? null;
    x.avg = o?.avg ?? null;
    return x;
  }

  static decodeBucketArray(array: any): ModbusHistoryBucket[] {
    const list: ModbusHistoryBucket[] = [];
    if (array instanceof Array) {
      for (const item of array) {
        list.push(ModbusHistoryCodec.decodeBucket(item));
      }
    }
    return list;
  }

  /* ----------------------------------------------------------------------------------------------
   * 失败（/failures）
   * ----------------------------------------------------------------------------------------------*/

  static decodeFailures(o: any): ModbusHistoryFailures {
    const x = new ModbusHistoryFailures();
    // 空间级查询（不传 serviceId）时后端不出这个键：保持 undefined，别填成空串冒充「某个服务」
    if (o?.serviceId != null) {
      x.serviceId = o.serviceId;
    }
    x.from = o?.from ?? 0;
    x.to = o?.to ?? 0;
    x.limit = o?.limit ?? 0;
    x.truncated = o?.truncated === true;
    x.items = ModbusHistoryCodec.decodeFailureArray(o?.items);
    x.summary = ModbusHistoryCodec.decodeSummary(o?.summary);
    return x;
  }

  static decodeFailureArray(array: any): ModbusHistoryFailure[] {
    const list: ModbusHistoryFailure[] = [];
    if (!(array instanceof Array)) {
      return list;
    }
    for (const item of array) {
      const x = new ModbusHistoryFailure();
      // 每条都带归属服务（空间级查询靠它认领）；老数据/单服务查询下可能没有，保持 undefined
      if (item?.serviceId != null) {
        x.serviceId = item.serviceId;
      }
      x.functionIndex = item?.functionIndex ?? 0;
      if (item?.type != null) {
        x.type = item.type;
      }
      if (item?.remoteCode != null) {
        x.remoteCode = item.remoteCode;
      }
      x.message = item?.message ?? '';
      x.at = item?.at ?? 0;
      list.push(x);
    }
    return list;
  }

  static decodeSummary(o: any): ModbusFailureSummary {
    const x = new ModbusFailureSummary();
    x.total = o?.total ?? 0;
    x.byType = [];
    for (const item of ModbusHistoryCodec.list(o?.byType)) {
      const t = new ModbusFailureTypeCount();
      t.type = item?.type ?? '';
      t.count = item?.count ?? 0;
      t.lastAt = item?.lastAt ?? 0;
      x.byType.push(t);
    }
    x.byRemoteCode = [];
    for (const item of ModbusHistoryCodec.list(o?.byRemoteCode)) {
      const c = new ModbusFailureCodeCount();
      c.remoteCode = item?.remoteCode ?? 0;
      c.count = item?.count ?? 0;
      c.lastAt = item?.lastAt ?? 0;
      x.byRemoteCode.push(c);
    }
    return x;
  }

  /** 汇总里的两个数组：缺失时当空数组（后端一定下发，老数据/异常返回兜底） */
  private static list(array: any): any[] {
    return array instanceof Array ? array : [];
  }
}

/** 点集元素的类型判定：给页面按形态分支用（桶有统计量，样本只有一个值） */
export function isBucket(point: ModbusHistoryPoint): point is ModbusHistoryBucket {
  return (point as ModbusHistoryBucket).until !== undefined;
}
