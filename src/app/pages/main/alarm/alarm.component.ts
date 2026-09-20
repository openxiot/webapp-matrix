import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzColDirective, NzRowDirective } from 'ng-zorro-antd/grid';
import { BreadcrumbTranslateDirective } from '@app/common/components/breadcrumb/breadcrumb-translate.directive';
import { AccountService } from '@app/service/account.service';
import { MatrixService } from '@app/service/matrix.service';
import { ModbusService } from '@app/service/modbus.service';
import { MainI18nService } from '@app/service/i18n.service';
import { GenericService } from '@app/typedef/define/service/GenericService';
import { valueText } from '@app/typedef/utils/ValueUtils';
import {
  MODBUS_ALARM_LEVELS,
  MODBUS_ALARM_LEVEL_LABELS,
  ModbusAlarm,
  ModbusAlarmList,
  applyHandledAlarm,
  modbusAlarmCloseLabel,
  modbusAlarmCondition,
  modbusAlarmLevelLabel,
} from '@app/typedef/define/modbus/ModbusAlarm';

/**
 * 告警级别在界面上的颜色：`INFO` 蓝（只提示）/ `WARN` 黄（要人看一眼）/ `CRITICAL` 红（要人管）。
 * 与后端的分级口径一一对应，不按「严重度」另分一套。
 */
const LEVEL_COLORS: Record<string, string> = {
  INFO: 'blue',
  WARN: 'warning',
  CRITICAL: 'error',
};

/** 时间范围预设：与两个历史页同一个口径（三档「最近 N」+ 自定义给绝对时刻） */
type RangePreset = '1h' | '24h' | '7d' | 'custom';

/** 预设窗口跨度（毫秒）：`to` 取当下，`from` 由此往前推 */
const PRESET_SPAN: Record<Exclude<RangePreset, 'custom'>, number> = {
  '1h': 3600 * 1000,
  '24h': 24 * 3600 * 1000,
  '7d': 7 * 24 * 3600 * 1000,
};

/**
 * 一次取回的条数上限（后端夹到 [1, 1000]，缺省 200）。取到上限与「不限」不是一回事：
 * 超了后端会给 `truncated = true`，页面据此提示缩小时间范围。
 */
const ALARM_LIMIT = 500;

/**
 * 阈值告警清单（`/main/alarm`）。
 *
 * <p>骨架与历史页同：服务清单来自 `getSpaceGraph`（表格里的服务名靠它，查不到时退回 `serviceId`）。
 * 但**取数只要一条请求** —— `/alarm/many/{spaceId}` 不传 `serviceId` 就是「整个空间（含子空间）
 * 现在哪儿在告警」，不必像当前值快照那样逐服务扇出（见后端 `ModbusAlarmResource`）。</p>
 *
 * <p>**服务端/用户文本一律不翻译**（本仓库的 i18n 规矩，见 `AGENTS.md`）：`text`（用户填的告警文本）、
 * `field`（出值名）、`state`（取值表的描述）、`sample`（当时的值）、服务名、`closeType` 都**原样进模板**。
 * 先例是 `service.functions.ts` 的 `WRITE_METHOD_REPLY_KEY`：「响应的字段文案来自点表数据，不翻译」——
 * 告警文本更进一步：它是用户自己填的，翻译它等于改用户的数据。</p>
 *
 * <p>**「处理」是就地替换那一行**，不整页刷新：处理只翻一个 `handled` 标志，级别与文本的分布动不了，
 * 所以汇总里只有「未处理」那个数字要跟着减 —— 不必为一次点击把整个窗口重取一遍。</p>
 */
@Component({
  selector: 'main-alarm',
  templateUrl: './alarm.component.html',
  styleUrl: './alarm.component.less',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormsModule,
    DatePipe,
    RouterLink,
    NzPageHeaderModule,
    NzBreadCrumbModule,
    NzSpinModule,
    NzCardModule,
    NzTableModule,
    NzButtonModule,
    NzTagModule,
    NzAlertModule,
    NzDescriptionsModule,
    NzIconModule,
    NzSegmentedModule,
    NzSelectModule,
    NzDatePickerModule,
    BreadcrumbTranslateDirective,
    TranslatePipe,
    NzRowDirective,
    NzColDirective,
  ],
})
export class AlarmComponent implements OnInit {
  private readonly msg = inject(NzMessageService);
  private readonly account = inject(AccountService);
  private readonly matrix = inject(MatrixService);
  private readonly modbus = inject(ModbusService);
  protected readonly i18n = inject(MainI18nService);
  /** 语言切换信号：选项文案与级别标签只能在 TS 里翻，靠它驱动重算（`instant` 本身不响应式） */
  private readonly langChange = toSignal(inject(TranslateService).onLangChange);

  /** 空间图加载中（服务清单是这一页的骨架） */
  readonly loadingGraph = signal(true);
  /** 告警清单取数中 */
  readonly loading = signal(false);

  /** 当前项目下的全部服务（精简视图，见 GenericService）：表格里的服务名与筛选下拉都靠它 */
  readonly services = signal<GenericService[]>([]);

  /* ----------------------------------------------------------------------------------------------
   * 查询条件（改任何一个都重取一次：这一页只有一条请求，没有「跟着窗口走 / 不跟着走」的分工）
   * ----------------------------------------------------------------------------------------------*/

  /** 默认最近 24 小时：看告警多是「昨天到今天」的量 */
  readonly preset = signal<RangePreset>('24h');
  /** 自定义区间（nz-range-picker 绑定的两元素数组，随用户选择更新） */
  readonly customRange = signal<Date[]>([]);
  /** 生效的窗口（毫秒，左闭右开）；`from` 必填（后端拒无起点的查询） */
  readonly from = signal(0);
  readonly to = signal(0);

  /** 服务：null = 整个项目（不传 serviceId，后端含子空间） */
  readonly serviceId = signal<string | null>(null);
  /** 级别：null = 所有级别 */
  readonly level = signal<string | null>(null);
  /** 处理状态：null = 不限 / false = 只看未处理 / true = 只看已处理 */
  readonly handled = signal<boolean | null>(null);
  /** 恢复状态：null = 不限 / false = 只看未恢复 / true = 只看已恢复 */
  readonly open = signal<boolean | null>(null);

  /* ----------------------------------------------------------------------------------------------
   * 取数结果
   * ----------------------------------------------------------------------------------------------*/

  /** 告警清单；请求失败时为 null */
  readonly alarms = signal<ModbusAlarmList | null>(null);
  /** 取数失败的原因；空串 = 取到了 */
  readonly error = signal('');

  /** 表格的行（清单本身已是时间倒序，前端不再排一遍 —— 排序口径在后端只有一份） */
  readonly rows = computed<ModbusAlarm[]>(() => this.alarms()?.items ?? []);
  /** 汇总：数字与分布都只统计本次返回的这批行，要连着 `truncated` 一起读 */
  readonly summary = computed(() => this.alarms()?.summary ?? null);
  /** 窗口内的告警多于 limit：提示只列了最近的那部分 */
  readonly truncated = computed(() => this.alarms()?.truncated === true);

  /** 正在处理的那条 id（按钮转圈，避免同一条被点两下） */
  readonly handling = signal<string | null>(null);

  /** 页码：查询条件一变行数就跟着变，页码要回到第一页 */
  readonly pageIndex = signal(1);

  /** id → 服务：表格里的服务名靠它，查不到（服务刚被删掉/挪出空间）时退回 id */
  private readonly servicesById = computed<Map<string, GenericService>>(
    () => new Map(this.services().map((service) => [service.id, service])),
  );

  /* ----------------------------------------------------------------------------------------------
   * 选项文案（下拉的 label 只能在 TS 里翻，故用 computed 跟着语言重算）
   * ----------------------------------------------------------------------------------------------*/

  protected readonly presetOptions = computed(() => {
    this.langChange();
    const t = (key: string) => this.i18n.translate.instant(key);
    // 每档整体一个词条（理由见 device.service.history.component 的同名 computed）
    return [
      { label: t('最近 1 小时'), value: '1h' as RangePreset },
      { label: t('最近 24 小时'), value: '24h' as RangePreset },
      { label: t('最近 7 天'), value: '7d' as RangePreset },
      { label: t('自定义'), value: 'custom' as RangePreset },
    ];
  });

  /**
   * 服务下拉：只列服务本身，「整个项目（含子空间）」用**占位符**表达（不选 = 不传 serviceId）。
   *
   * <p>不把「所有服务」做成值为 null 的一项：ng-zorro 的 `writeValue(null)` 会把选中项清成空
   * （`covertModelToList` 把 null 变成 `[]`），那样下拉看着是「未选择」而实际语义是「全部」，
   * 是在骗人。占位符正好反过来：没选时显示的就是「所有服务」，语义与观感一致。</p>
   */
  protected readonly serviceOptions = computed(() => {
    this.langChange();
    return this.services().map((service) => ({ value: service.id, label: service.name }));
  });

  /** 级别下拉：同上，不选 = 所有级别（占位符「全部」） */
  protected readonly levelOptions = computed(() => {
    this.langChange();
    const t = (key: string) => this.i18n.translate.instant(key);
    return MODBUS_ALARM_LEVELS.map((level) => ({
      value: level as string,
      // 级别 → 词典键的对照收在 ModbusAlarm.ts 一处（编辑器与这一页共用），这里借它取键
      label: t(MODBUS_ALARM_LEVEL_LABELS[level] ?? level),
    }));
  });

  /**
   * 处理状态下拉：不选 = 不限。两个选项都必须是**明确的布尔值** ——
   * 「不传」与 `false`（只看未处理）在后端是完全不同的两件事，用 `false` 表达「不限」就永远查不了未处理。
   */
  protected readonly handledOptions = computed(() => {
    this.langChange();
    const t = (key: string) => this.i18n.translate.instant(key);
    return [
      { value: false, label: t('未处理') },
      { value: true, label: t('已处理') },
    ];
  });

  /** 恢复状态下拉：不选 = 不限，理由同上（`false` = 只看未恢复） */
  protected readonly openOptions = computed(() => {
    this.langChange();
    const t = (key: string) => this.i18n.translate.instant(key);
    return [
      { value: false, label: t('未恢复') },
      { value: true, label: t('已恢复') },
    ];
  });

  /* ----------------------------------------------------------------------------------------------
   * 生命周期
   * ----------------------------------------------------------------------------------------------*/

  ngOnInit(): void {
    const spaceId = this.account.space().id;
    if (!spaceId) {
      this.loadingGraph.set(false);
      this.msg.warning(this.i18n.translate.instant('请先在项目列表中选择一个项目'));
      return;
    }
    this.loadGraph(spaceId);
  }

  /** 空间图给出本项目全部服务：表格里的服务名与筛选下拉都靠它，取不到就只剩 serviceId 可显示 */
  private loadGraph(spaceId: string): void {
    this.loadingGraph.set(true);
    this.matrix.getSpaceGraph(spaceId).subscribe({
      next: (graph) => {
        this.services.set(graph.services ?? []);
        this.loadingGraph.set(false);
        this.load();
      },
      error: (e) => {
        this.loadingGraph.set(false);
        // 服务清单只是「好看」的那一半（名字），告警清单才是内容：取不到也照样往下取
        this.msg.error(e?.message ?? e);
        this.load();
      },
    });
  }

  /* ----------------------------------------------------------------------------------------------
   * 取数
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 按当前条件重算窗口并取数（进页面、切筛选、点「刷新」都走这里）。
   * 预设是「最近 N」，故每次都重新对齐到现在 —— 页面开着不动窗口不会自己走，刷新即跟上。
   */
  protected load(): void {
    const spaceId = this.account.space().id;
    const win = this.timeWindow();
    if (!spaceId || !win) {
      return;
    }
    this.from.set(win.from);
    this.to.set(win.to);
    this.pageIndex.set(1);
    this.loading.set(true);
    this.modbus
      .getAlarms(spaceId, win.from, win.to, {
        serviceId: this.serviceId(),
        level: this.level(),
        handled: this.handled(),
        open: this.open(),
        limit: ALARM_LIMIT,
      })
      .subscribe({
        next: (list) => {
          this.alarms.set(list);
          this.error.set('');
          this.loading.set(false);
        },
        error: (e) => {
          // 失败时把清单清空：留着上一次的结果会让人以为「刚刚刷新过、就是这些」
          this.alarms.set(null);
          this.error.set(e?.message ?? String(e));
          this.loading.set(false);
        },
      });
  }

  /** 窗口（毫秒）：自定义区间没选全时给 null —— 那时候没有合法窗口可算 */
  private timeWindow(): { from: number; to: number } | null {
    const preset = this.preset();
    if (preset === 'custom') {
      const range = this.customRange();
      if (range.length !== 2 || !range[0] || !range[1]) {
        return null;
      }
      return { from: range[0].getTime(), to: range[1].getTime() };
    }
    const now = Date.now();
    return { from: now - PRESET_SPAN[preset], to: now };
  }

  /* ----------------------------------------------------------------------------------------------
   * 交互
   * ----------------------------------------------------------------------------------------------*/

  protected onPresetChange(preset: RangePreset): void {
    this.preset.set(preset);
    if (preset === 'custom') {
      // 进自定义先把当前窗口回填进选择器，用户改完（onCustomRangeChange）才取数
      if (this.customRange().length !== 2) {
        this.customRange.set([new Date(this.from()), new Date(this.to())]);
      }
      return;
    }
    this.load();
  }

  protected onCustomRangeChange(range: Date[] | null): void {
    this.customRange.set(range ?? []);
    if (this.preset() === 'custom' && range?.length === 2 && range[0] && range[1]) {
      this.load();
    }
  }

  /* 四个筛选各一个 handler：下拉清空（nzAllowClear）发的是 null，落进信号就是「不限」 */

  protected onServiceChange(serviceId: string | null): void {
    this.serviceId.set(serviceId ?? null);
    this.load();
  }

  protected onLevelChange(level: string | null): void {
    this.level.set(level ?? null);
    this.load();
  }

  protected onHandledChange(handled: boolean | null): void {
    this.handled.set(handled ?? null);
    this.load();
  }

  protected onOpenChange(open: boolean | null): void {
    this.open.set(open ?? null);
    this.load();
  }

  /**
   * 处理一条告警（回执，不是改配置）：处理人取当前登录账号，后端把「已经处理过了」也当成功返回。
   *
   * <p>成功后就地替换这一行（不整页刷新）：用户刚点过的那条要立刻变成「已处理」，
   * 否则会以为没生效。汇总里只有「未处理」跟着减 —— 处理不翻级别、也不改告警文本，
   * `byLevel` / `byText` 两份分布原样不动，故仍用后端给的那一份。</p>
   */
  protected handle(item: ModbusAlarm): void {
    const spaceId = this.account.space().id;
    if (!spaceId || !item.id) {
      return;
    }
    this.handling.set(item.id);
    this.modbus.handleAlarm(spaceId, item.id).subscribe({
      next: (updated) => {
        this.handling.set(null);
        this.replace(updated);
        this.msg.success(this.i18n.translate.instant('操作成功'));
      },
      error: (e) => {
        this.handling.set(null);
        this.msg.error(e?.message ?? String(e));
      },
    });
  }

  /** 用后端回的那一条替掉表里的同一行（计数怎么修正在 {@link applyHandledAlarm} 里，有单测） */
  private replace(updated: ModbusAlarm): void {
    const list = this.alarms();
    if (list) {
      this.alarms.set(applyHandledAlarm(list, updated));
    }
  }

  /* ----------------------------------------------------------------------------------------------
   * 展示文案
   * ----------------------------------------------------------------------------------------------*/

  /** 表格里那一行的服务名：服务已不在空间图里（刚被删掉/挪走）时退回 id，别留一片空白 */
  protected serviceName(item: ModbusAlarm): string {
    return this.servicesById().get(item.serviceId ?? '')?.name ?? item.serviceId ?? '-';
  }

  /** 服务还在空间图里就给个能点进去的链接（与历史页同一去处：该服务的采集历史） */
  protected service(item: ModbusAlarm): GenericService | undefined {
    return this.servicesById().get(item.serviceId ?? '');
  }

  protected serviceHistoryLink(service: GenericService): string[] {
    return ['/main/device/services', service.did, 'service', 'history', service.id];
  }

  /**
   * 「触发条件」：比较方式 + 阈值/状态（**取自行内的定义快照**，不是当前点表 ——
   * 定义是活的、行是不可变的历史，改了阈值不该改写历史告警的含义）。
   */
  protected condition(item: ModbusAlarm): string {
    this.langChange();
    return modbusAlarmCondition(item, (key) => this.i18n.translate.instant(key));
  }

  /**
   * 「当前值」：越限那一刻的值 + 单位。单位只缀在**数值**后面 ——
   * `=` 比状态时值是取值表的描述（如「制冷」），与单位无关（同 `modbusAlarmCondition` 的口径）。
   */
  protected sampleText(item: ModbusAlarm): string {
    const text = valueText(item.sample);
    return typeof item.sample === 'number' ? `${text}${item.unit ?? ''}` : text;
  }

  protected levelLabel(level: string | undefined): string {
    this.langChange();
    return modbusAlarmLevelLabel(level, (key) => this.i18n.translate.instant(key));
  }

  /**
   * 「怎么关掉的」：`值恢复` / `定义变更` / `被取代` / `处理后再报`（见 `MODBUS_ALARM_CLOSE_LABELS`）。
   *
   * 四条关闭路径都得露脸 —— 只显示其中一种，另外三种的行就说了半句话：一条没有恢复样本的关闭
   * 看起来跟「值回来了」一模一样。原始的枚举名留在 `title` 上（排查时拿它搜后端日志，
   * 与级别标签的 `[title]="item.level"` 同一个做法）。
   */
  protected closeLabel(closeType: string | undefined): string {
    this.langChange();
    return modbusAlarmCloseLabel(closeType, (key) => this.i18n.translate.instant(key));
  }

  protected levelColor(level: string | undefined): string {
    return LEVEL_COLORS[level ?? ''] ?? 'default';
  }
}
