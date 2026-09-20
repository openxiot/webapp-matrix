import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTableModule } from 'ng-zorro-antd/table';
import { TranslatePipe } from '@ngx-translate/core';
import { MainI18nService } from '@app/service/i18n.service';
import {
  ModbusServiceField,
  ModbusServiceFieldAlarm,
} from '@app/typedef/define/modbus/ModbusService';
import {
  MAX_ALARM_RULES,
  alarmCompareOptions,
  alarmLevelOptions,
  alarmStateOptions,
  alarmUsesState,
  describeFieldShape,
  withAlarmAdded,
  withAlarmMoved,
  withAlarmPatched,
  withAlarmRemoved,
  type AlarmOption,
  type ServiceAlarmItem,
} from '../../service.functions';

/** 打开对话框时交进来的东西 */
export interface ServiceAlarmDialogData {
  /** 方法名称（服务端数据，原样显示） */
  name: string;
  /** 请求帧（服务端数据，原样显示） */
  request: string;
  /** 该方法的全部出值 —— 含配不了告警的 `string` 字段：它们也要露出来，用户才知道为什么配不了 */
  items: ServiceAlarmItem[];
  /**
   * 打开时的规则组，key = 出值名（见 {@link ServiceAlarmItem.key}）。
   * 值是**副本**（页面上抄过来的），对话框怎么改都碰不到页面上的那份。
   */
  alarms: Map<string, ModbusServiceFieldAlarm[]>;
  /**
   * 只读：能看不能改（服务详情页对**非空间管理员**就是这一档）。
   * 缺省 / `false` = 可编辑（编辑页，以及详情页的空间管理员）。
   */
  readOnly?: boolean;
}

/**
 * 逐出值编辑告警规则的对话框：一个出值一块 —— 块头写出值名与类型形态，块里一张小表放它的规则。
 *
 * **它只改自己那一份副本**：出值与规则都是打开时从页面抄来的，点「确认」才把整张规则表交回去，
 * 取消 / 关窗即丢弃 —— 用户改到一半反悔，页面上的那份一个字都没动。
 *
 * 「确认」之后由**页面**去落库（编辑页是底部那个保存按钮，服务详情页是随即发一次更新请求），
 * 本对话框不发任何请求：它不知道服务 id 与空间，也不该知道。
 *
 * **只读档**（`readOnly`，见 {@link ServiceAlarmDialogData.readOnly}）只少两件事：控件不给动、
 * 「确认」不给按。配置本身照旧**原样显示、也不灰化** —— 只读的人正是来看这份配置的，
 * 把值藏起来或糊成灰的都是帮倒忙；改不动的原因由顶上一句提示讲清楚。
 *
 * 规则组的增删改一步都不在这里实现，全走 `service.functions` 里那三个纯函数
 * （{@link withAlarmAdded} / {@link withAlarmPatched} / {@link withAlarmRemoved}）——
 * 页面改的是同一份数据，两边各写一套的话「整组删空要连 key 一起去掉」这种细节迟早会走岔。
 */
@Component({
  selector: 'device-service-alarm-dialog',
  templateUrl: './device.service.alarm.dialog.component.html',
  styleUrl: './device.service.alarm.dialog.component.less',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormsModule,
    DragDropModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzInputNumberModule,
    NzSelectModule,
    NzSwitchModule,
    NzTableModule,
    TranslatePipe,
  ],
})
export class DeviceServiceAlarmDialogComponent {
  private readonly modal = inject(NzModalRef);
  private readonly i18n = inject(MainI18nService);
  protected readonly data: ServiceAlarmDialogData = inject(NZ_MODAL_DATA);

  /** 出值清单：打开时抄下的，对话框里不改它（改的只有下面那张规则表） */
  protected readonly items = this.data.items;

  /** 各出值的规则组：本对话框自己的状态，key = 出值名。改动只落在这里 */
  protected readonly rules = signal(new Map(this.data.alarms));

  /**
   * 只读档：控件禁着（改不动）、动作全无、只留一个「关闭」（见 {@link ServiceAlarmDialogData.readOnly}）。
   * 样式上**不灰化**：值照常看得清，改不动的原因交给顶上那句提示（见 .less 里那一段）。
   */
  protected readonly readOnly = this.data.readOnly === true;

  /** 一个出值最多几条规则：与后端校验、与编辑页同一个上限（见 {@link MAX_ALARM_RULES}） */
  protected readonly maxAlarmRules = MAX_ALARM_RULES;
  /** 出值的类型形态，不带字段名、不带告警：出值名就在它左边 */
  protected readonly describeFieldShape = describeFieldShape;
  /** 该出值此刻比的是状态还是数值：模板据此把阈值那一格换成下拉还是数字框 */
  protected readonly alarmUsesState = alarmUsesState;

  /** 该出值当前的规则组（没配过 = 空数组） */
  protected rulesOf(item: ServiceAlarmItem): ModbusServiceFieldAlarm[] {
    return this.rules().get(item.key) ?? [];
  }

  /**
   * 规则行里那个控件是否**不可编辑**：只读档一律不可编辑；否则只有**停用的**规则不可编辑
   * （配置留着，见 {@link onEnabled}）。
   *
   * 两档在画面上长得不一样，别混为一谈：停用的规则**灰着**（那是信息：配置留着、只是没启用），
   * 只读档**不灰**（值照常看得清，改不动的原因由顶上那句提示来讲，见 .less 里那一段）。
   *
   * 开关自己不走这个判断：它恰恰是给停用规则用的（关着的规则得能再打开），只读时按 {@link readOnly} 禁。
   */
  protected locked(rule: ModbusServiceFieldAlarm): boolean {
    return this.readOnly || rule.enabled !== true;
  }

  /**
   * 加一条规则。`string` 字段一个比较方式都没有（后端直接拒），这里再兜一次 ——
   * 模板里那种字段压根不出按钮，但真正不该越界的是这份数据。
   */
  protected onAdd(item: ServiceAlarmItem): void {
    if (this.readOnly || item.kind === 'none') {
      return;
    }
    // 起步的告警文本取该出值的名字（用户随即能改，见 defaultAlarm）
    this.rules.update((map) => withAlarmAdded(map, item.key, item.kind, item.key));
  }

  protected onRemove(item: ServiceAlarmItem, rule: ModbusServiceFieldAlarm): void {
    if (this.readOnly) {
      return;
    }
    this.rules.update((map) => withAlarmRemoved(map, item.key, rule));
  }

  /**
   * 拖手柄换位。顺序有语义：后端在同级并列时取**靠后**的那条（见 {@link withAlarmMoved}），
   * 所以这不是纯视觉效果 —— 编辑页的保存按钮会因此亮起来，详情页则是一次真落库。
   *
   * 只认 cdk 给的下标，改哪一组由 `item` 决定：每一块的 tbody 是自己的拖拽容器，
   * 规则也因此**只能在同一个出值内换位**（跨出值拖动没有意义 —— 比较方式与取值表都不是一套）。
   */
  protected onRuleDropped(
    item: ServiceAlarmItem,
    event: CdkDragDrop<ModbusServiceFieldAlarm[]>,
  ): void {
    if (this.readOnly) {
      return;
    }
    this.rules.update((map) =>
      withAlarmMoved(map, item.key, event.previousIndex, event.currentIndex),
    );
  }

  /**
   * 开关**一条规则**。关掉只改开关、**配置原样留着** —— 这正是这个开关的用处：
   * 先停掉一条吵闹的规则，不必把比较方式、阈值、文本都删掉（与轮询开关保留周期同口径）。
   *
   * 停用的规则后端不校验、也不参与判定，故完全可以「先建好、先关着，回头再开」。
   */
  protected onEnabled(
    item: ServiceAlarmItem,
    rule: ModbusServiceFieldAlarm,
    enabled: boolean,
  ): void {
    this.patch(item, rule, { enabled });
  }

  /**
   * 改比较方式。比较方式决定「比的是状态还是数值」（见 {@link alarmUsesState}），
   * 后端把这两个目标字段做成互斥的，故这一步顺手把用不上的那个清掉 ——
   * 不清的话，从「= 制冷」切到「> 80」会同时带着 state，保存被后端拒。
   */
  protected onCompare(
    item: ServiceAlarmItem,
    rule: ModbusServiceFieldAlarm,
    compare: string | null,
  ): void {
    const patch: Partial<ModbusServiceFieldAlarm> = { compare: compare ?? undefined };
    if (alarmUsesState(item.kind, compare ?? undefined)) {
      patch.threshold = undefined;
    } else {
      patch.state = undefined;
    }
    this.patch(item, rule, patch);
  }

  protected onThreshold(
    item: ServiceAlarmItem,
    rule: ModbusServiceFieldAlarm,
    value: number | null,
  ): void {
    // 清空 = 还没填（后端会拒），不是 0：0 是个正经阈值，不能拿「没填」冒充它
    this.patch(item, rule, {
      threshold: value == null || !Number.isFinite(value) ? undefined : value,
    });
  }

  protected onState(
    item: ServiceAlarmItem,
    rule: ModbusServiceFieldAlarm,
    state: string | null,
  ): void {
    this.patch(item, rule, { state: state ?? undefined });
  }

  protected onLevel(
    item: ServiceAlarmItem,
    rule: ModbusServiceFieldAlarm,
    level: string | null,
  ): void {
    this.patch(item, rule, { level: level ?? undefined });
  }

  /** 告警文本是用户自己填的（如「温度过高」）：**数据，永不翻译**，原样落库 */
  protected onText(item: ServiceAlarmItem, rule: ModbusServiceFieldAlarm, text: string): void {
    this.patch(item, rule, { text });
  }

  /**
   * 改一条规则：按对象身份定位（见 {@link withAlarmPatched}）。
   * 六个改值的入口全走这里，只读档的拦截也就只需这一处（禁用的控件 + 这一道，两层）。
   */
  private patch(
    item: ServiceAlarmItem,
    rule: ModbusServiceFieldAlarm,
    patch: Partial<ModbusServiceFieldAlarm>,
  ): void {
    if (this.readOnly) {
      return;
    }
    this.rules.update((map) => withAlarmPatched(map, item.key, rule, patch));
  }

  /** 比较方式下拉：「文案 + 符号」两样都给（见 {@link alarmCompareOptions}） */
  protected compareOptions(item: ServiceAlarmItem): AlarmOption[] {
    return alarmCompareOptions(item, this.t);
  }

  /** 级别下拉：顺序即「由轻到重」 */
  protected get levelOptions(): AlarmOption[] {
    return alarmLevelOptions(this.t);
  }

  /** `=` 的比较目标：取值表里的描述原样给出（数据，不翻译） */
  protected stateOptions(field: ModbusServiceField): AlarmOption[] {
    return alarmStateOptions(field);
  }

  /**
   * 翻译 i18n 键。内部读取 currentLang 信号，使下拉选项在语言切换时随视图重算
   * （`instant` 不是响应式的，口径同编辑页的那个 `t`）。
   */
  private readonly t = (key: string): string => {
    this.i18n.currentLang();
    return this.i18n.translate.instant(key);
  };

  /** 「确认」：把整张规则表交回页面 —— **空的组也要给**，页面据此把这个出值整组删掉 */
  ok(): void {
    this.modal.destroy(this.rules());
  }

  /** 「取消」/ 关窗 / 点遮罩：交回 undefined，页面一个字都不改 */
  cancel(): void {
    this.modal.destroy(undefined);
  }
}
