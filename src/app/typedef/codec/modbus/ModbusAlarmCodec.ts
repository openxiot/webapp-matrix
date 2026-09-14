import {
  ModbusAlarm,
  ModbusAlarmLevelCount,
  ModbusAlarmList,
  ModbusAlarmSummary,
  ModbusAlarmTextCount,
} from '../../define/modbus/ModbusAlarm';
import { ModbusPerson } from '../../define/modbus/Modbus';

/**
 * 阈值告警与 JSON 的互转。**只解不编**：告警由服务端在采集链路上写、由用户点「处理」改，
 * 前端没有任何回写这份数据的请求体（处理动作无 body，见 `modbus.service.ts` 的 `handleAlarm`）。
 *
 * 时间键 `at` / `recoveredAt` / `lastAt` / `from` / `to` 线上都是毫秒时间戳，
 * 前端原样存数字（展示再格式化），不做 Date 转换 —— 后端就是 `Date.getTime()`，来回一趟不该失真。
 *
 * `text` / `field` / `state` / `unit` / `sample` 是**数据**（用户填的、点表里的），解出来原样带着，
 * 页面直接显示、**永不翻译**。
 */
export class ModbusAlarmCodec {
  static decodeList(o: any): ModbusAlarmList {
    const x = new ModbusAlarmList();
    // 空间级查询（不传 serviceId）时后端不出这个键：保持 undefined，别填成空串冒充「某个服务」
    if (o?.serviceId != null) {
      x.serviceId = o.serviceId;
    }
    x.from = o?.from ?? 0;
    x.to = o?.to ?? 0;
    x.limit = o?.limit ?? 0;
    x.truncated = o?.truncated === true;
    x.items = ModbusAlarmCodec.decodeArray(o?.items);
    x.summary = ModbusAlarmCodec.decodeSummary(o?.summary);
    return x;
  }

  static decode(o: any): ModbusAlarm {
    const x = new ModbusAlarm();
    // id 是点「处理」时要发回去的东西，后端一定下发；缺了也照解，页面据 undefined 决定要不要给按钮
    if (o?.id != null) {
      x.id = o.id;
    }
    if (o?.serviceId != null) {
      x.serviceId = o.serviceId;
    }
    x.functionIndex = o?.functionIndex ?? 0;
    x.field = o?.field ?? '';
    // —— 触发那一刻的定义快照 ——
    if (o?.compare != null) {
      x.compare = o.compare;
    }
    if (o?.threshold != null) {
      x.threshold = o.threshold;
    }
    if (o?.state != null) {
      x.state = o.state;
    }
    if (o?.level != null) {
      x.level = o.level;
    }
    if (o?.text != null) {
      x.text = o.text;
    }
    if (o?.unit != null) {
      x.unit = o.unit;
    }
    // —— 边沿 ——
    x.at = o?.at ?? 0;
    // 未恢复时后端不下发这个键（不是 null）：保持 undefined，页面判「有没有」与判「是不是 null」
    // 在这里是同一件事，但 undefined 更贴合「这个字段现在不存在」
    if (o?.recoveredAt != null) {
      x.recoveredAt = o.recoveredAt;
    }
    if (o?.closeType != null) {
      x.closeType = o.closeType;
    }
    // —— 处理 ——
    x.handled = o?.handled === true;
    if (o?.handledBy != null) {
      x.handledBy = ModbusAlarmCodec.decodePerson(o.handledBy);
    }
    // —— 样本 ——
    // 可能是 Number，也可能是取值表的 description 字符串（或缺失），原样带着、展示时按类型分支
    x.sample = o?.sample;
    return x;
  }

  static decodeArray(array: any): ModbusAlarm[] {
    const list: ModbusAlarm[] = [];
    if (array instanceof Array) {
      for (const item of array) {
        list.push(ModbusAlarmCodec.decode(item));
      }
    }
    return list;
  }

  static decodeSummary(o: any): ModbusAlarmSummary {
    const x = new ModbusAlarmSummary();
    x.total = o?.total ?? 0;
    x.open = o?.open ?? 0;
    x.unhandled = o?.unhandled ?? 0;
    x.byLevel = [];
    for (const item of ModbusAlarmCodec.list(o?.byLevel)) {
      const c = new ModbusAlarmLevelCount();
      c.level = item?.level ?? '';
      c.count = item?.count ?? 0;
      if (item?.lastAt != null) {
        c.lastAt = item.lastAt;
      }
      x.byLevel.push(c);
    }
    x.byText = [];
    for (const item of ModbusAlarmCodec.list(o?.byText)) {
      const c = new ModbusAlarmTextCount();
      c.text = item?.text ?? '';
      c.count = item?.count ?? 0;
      if (item?.lastAt != null) {
        c.lastAt = item.lastAt;
      }
      x.byText.push(c);
    }
    return x;
  }

  /** 汇总里的两个数组：缺失时当空数组（后端一定下发，老数据/异常返回兜底） */
  private static list(array: any): any[] {
    return array instanceof Array ? array : [];
  }

  /** 与 `ModbusServiceCodec.decodePerson` 同口径（后端两边都走 PersonCodec）。 */
  private static decodePerson(o: any): ModbusPerson {
    const p: ModbusPerson = {};

    if (o.id != null) {
      p.id = o.id;
    }
    if (o.name != null) {
      p.name = o.name;
    }
    if (o.timestamp != null) {
      p.timestamp = o.timestamp;
    }

    return p;
  }
}
