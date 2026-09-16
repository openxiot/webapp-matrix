import {
  type ModbusAlarm,
  modbusAlarmCondition,
  modbusAlarmLevelLabel,
} from '../../../typedef/define/modbus/ModbusAlarm';
import { GenericService } from '../../../typedef/define/service/GenericService';
import { SpaceEntity } from '../../../typedef/define/space/SpaceEntity';

/**
 * 3D 页左侧那一列告警框的内容。纯函数，不依赖 Angular，可单测。
 *
 * 与 `home3d.info.ts` 同一套分工：**这里算，组件只画**。分两个模块而不是塞进一个，
 * 是因为输入不一样 —— 信息面板吃的是空间/设备实体，告警吃的是 {@link ModbusAlarm}，
 * 两者的取数链路（`getSpaceGraph` / `getAlarms`）也各走各的。
 *
 * 与告警页的关系：那边是一张表、能筛能翻页；这里是**挂在墙上的那一列**，
 * 只回答一个问题 —— 「现在哪儿出事了」。所以只有三个字段（在哪儿、什么事、什么时候），
 * 参数化的筛选一个都不做（后端已经按 `handled: false` 筛过了）。
 *
 * ⚠️ `text` / `field` / `state` / `unit` 都是**用户数据**（点表里的字段名、用户填的告警文本），
 * **原样显示、永不翻译** —— 见 ModbusAlarm.ts 顶上那段。会翻的只有级别枚举名。
 */

/**
 * 告警框的色调，模板拿它拼 `h3d-alarm--{tone}` 那个类，颜色在样式表里。
 *
 * `unknown` 是**兜底**而不是「正常」：后端加了新级别、或者碰上没有 `level` 的老数据时，
 * 它给的是中性灰，不会伪装成「提示」那一档的蓝。
 */
export type AlarmTone = 'info' | 'warn' | 'critical' | 'unknown';

/** 级别枚举名 → 色调。三个已知值来自 `MODBUS_ALARM_LEVELS`，与告警页的 `LEVEL_COLORS` 同一套语义 */
const TONES: Record<string, AlarmTone> = {
  INFO: 'info',
  WARN: 'warn',
  CRITICAL: 'critical',
};

/** 一个告警框要画的东西。模板照着画，不在模板里做判断 */
export interface AlarmCard {
  /**
   * 后端主键，点「处理」要发回去的那个。
   *
   * **空串 = 这条没有 id**（类型上 `id` 是可选的）。见 {@link AlarmCard.canHandle}。
   */
  id: string;
  /** 级别枚举名，原样留着放到 `title` 上 —— 排查时拿它去搜后端日志 */
  level: string;
  /** 级别文案（提示 / 警告 / 严重），走 {@link modbusAlarmLevelLabel}，跟着语言翻 */
  levelLabel: string;
  tone: AlarmTone;
  /** 框上的主标题。告警文本是用户数据、不翻译；没填就退回触发条件，再退回字段名 */
  text: string;
  /** 在哪儿，`空间名 · 字段名` 那个串 */
  where: string;
  /** 触发条件（超过 80℃），走 {@link modbusAlarmCondition} */
  condition: string;
  /** 越限首次出现的时刻（毫秒）。模板用 `| date` 格式化，与告警页同一写法 */
  at: number;
  /** 值已经回到正常（但可能还没人处理过）—— 只在 `title` 上提一句 */
  recovered: boolean;
  /**
   * 这颗框画不画「处理」按钮。
   *
   * **没有 id 就不画。** 告警页那颗按钮在同样的情况下点了是个静默的空操作
   * （`handle()` 里 `if (!item.id) return`），这里干脆不给一个点不动的按钮。
   */
  canHandle: boolean;
}

/** 级别枚举名 → 色调。没见过的级别名与压根没有 `level` 的老数据都落到 `unknown` */
export function alarmTone(level: string | undefined | null): AlarmTone {
  return (level ? TONES[level] : undefined) ?? 'unknown';
}

/**
 * 告警清单 → 左列那一排框。
 *
 * **已处理的那些不画。** 取数时后端已经按 `handled: false` 筛过一遍了，这里再挡一次
 * 是为了**点完「处理」当场消失**：处理成功后那一行被就地换成后端回的新行
 * （见 `applyHandledAlarm`），不重取整列 —— 于是「它还在 items 里、但已经不该显示」
 * 这件事必须由这里来说。顺带也挡住了「另一个标签页里处理掉了、这边重取回来还带着它」。
 *
 * 顺序**原样透传、不重排**：后端给的就是时间倒序（最新的在最上面），而本地少画一条
 * 不会破坏这个序，所以没有任何要重排的理由。
 *
 * 空间归属走 `alarm.serviceId` → 服务 → 服务所在空间 → 空间名这条链。服务清单来自
 * 空间图（`getSpaceGraph` 一次就带回来了），所以**不加任何请求**。
 *
 * 每一级都可能断，故逐级回退：服务查不到（刚被删掉 / 挪走，或空间图还没到）→ 服务名，
 * 再没有 → `serviceId` 本身（难看，但比一片空白强 —— 拿它至少能去后端查）。
 * 整条链都断掉时 `where` 里**仍有字段名**，不会变成一个只有时间的空框。
 *
 * `t` 由组件把 `TranslateService.instant` 递进来（同 `home3d.info.ts` 的 `InfoText`）：
 * 本文件是纯函数、不认识 i18n 服务。又因为 `instant` 不是响应式的，组件那边还得把它
 * 挂在语言变化信号上触发重算（见组件的 `alarmCards`）。
 */
export function buildAlarmCards(
  alarms: ModbusAlarm[],
  serviceById: Map<string, GenericService>,
  spaceById: Map<string, SpaceEntity>,
  t: (key: string) => string,
): AlarmCard[] {
  return alarms.filter((alarm) => alarm.handled !== true).map((alarm) => {
    const id = alarm.id ?? '';
    const service = alarm.serviceId ? serviceById.get(alarm.serviceId) : undefined;
    const space = service?.spaceId ? spaceById.get(service.spaceId) : undefined;
    const place = space?.name ?? service?.name ?? alarm.serviceId ?? '';
    const condition = modbusAlarmCondition(alarm, t);

    return {
      id,
      level: alarm.level ?? '',
      levelLabel: modbusAlarmLevelLabel(alarm.level, t),
      tone: alarmTone(alarm.level),
      // 用户没填告警文本时不留一条只有级别和时间的框：退回触发条件，再退回字段名
      text: alarm.text || condition || alarm.field,
      where: [place, alarm.field].filter((part) => part !== '').join(' · '),
      condition,
      at: alarm.at,
      recovered: alarm.recoveredAt != null,
      canHandle: id !== '',
    };
  });
}
