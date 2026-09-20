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
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
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
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzMessageService } from 'ng-zorro-antd/message';
import { BreadcrumbTranslateDirective } from '../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { AccountService } from '@app/service/account.service';
import { MatrixService } from '@app/service/matrix.service';
import { ModbusService } from '@app/service/modbus.service';
import { MainI18nService } from '@app/service/i18n.service';
import { DeviceEntity } from '../../../typedef/define/device/DeviceEntity';
import { GenericService } from '../../../typedef/define/service/GenericService';
import {
  ModbusHistoryCurrent,
  ModbusHistoryFailure,
  ModbusHistoryFailures,
  modbusFailureLabel,
} from '../../../typedef/define/modbus/ModbusHistory';
import { NzColDirective, NzRowDirective } from 'ng-zorro-antd/grid';
import { NzSpaceModule } from 'ng-zorro-antd/space';

/** 时间范围预设：与单服务历史页同一个口径（三档「最近 N」+ 自定义给绝对时刻） */
type RangePreset = '1h' | '24h' | '7d' | 'custom';

/** 预设窗口跨度（毫秒）：`to` 取当下，`from` 由此往前推 */
const PRESET_SPAN: Record<Exclude<RangePreset, 'custom'>, number> = {
  '1h': 3600 * 1000,
  '24h': 24 * 3600 * 1000,
  '7d': 7 * 24 * 3600 * 1000,
};

/**
 * 空间级失败清单一索取回的条数（后端夹到 [1, 1000]）。空间级查询的 limit 是**整份清单**的口径，
 * 不是每个服务各 200 —— 故障是去重过的（同一条错误持续存在只落一条），一小时的量远到不了这里。
 */
const FAILURE_LIMIT = 1000;

/** 概览表的一行：一个服务 + 它的当前值快照（窗口内的失败另有一份清单，按 serviceId 归位） */
interface ServiceOverview {
  service: GenericService;
  /** 当前值快照（与时间范围无关，只在进页面 / 刷新时取）；请求失败时为 null */
  current: ModbusHistoryCurrent | null;
  /** /current 取数失败的原因；空串 = 取到了 */
  currentError: string;
}

/** 项目级失败清单的一行：一条失败属于哪个服务 */
interface FailureRow {
  /** 表格 track 用：一条失败由「服务 + 方法 + 首次出现时刻」唯一确定（同名同时刻的两个服务靠它分开） */
  key: string;
  serviceId: string;
  /** 空间图里对应的服务；查不到（服务刚被挪出空间/删掉）时为 undefined，那时只显示 id */
  service: GenericService | undefined;
  item: ModbusHistoryFailure;
}

/**
 * 项目级历史（当前项目下所有服务的采集历史）。
 *
 * <p>服务清单与设备来自 `getSpaceGraph`（这一页的骨架）。采集数据分两块取：
 * **当前值快照**仍要逐服务扇出（后端只有按服务的 `/history/current`），
 * 而**窗口内的失败**用一条空间级 `/history/failures/{spaceId}`（`serviceId` 不传）就够 ——
 * 后端把空间下所有服务的失败合并、排序、截断（见 `ModbusHistoryQueryService.failuresOfServices`），
 * 前端只按 item 上的 serviceId 归位，不必拿 N 个响应在内存里拼。</p>
 *
 * <p>两件事分得很开：**当前值快照**（在采方法数 / 最新采集时间，与时间范围无关）与
 * **窗口内的失败**（跟着时间范围走）。切换时间范围只重取后者 —— 快照跟窗口没关系，
 * 犯不着为切一档把 N 个 `/current` 再拉一遍。</p>
 */
@Component({
  selector: 'main-history',
  templateUrl: './history.component.html',
  styleUrl: './history.component.less',
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
    NzDatePickerModule,
    BreadcrumbTranslateDirective,
    TranslatePipe,
    NzRowDirective,
    NzColDirective,
    NzSpaceModule,
  ],
})
export class HistoryComponent implements OnInit {
  private readonly msg = inject(NzMessageService);
  private readonly account = inject(AccountService);
  private readonly matrix = inject(MatrixService);
  private readonly modbus = inject(ModbusService);
  protected readonly i18n = inject(MainI18nService);
  /** 语言切换信号：nz-segmented 的选项文案与失败类型标签都只能在 TS 里翻，靠它驱动重算 */
  private readonly langChange = toSignal(inject(TranslateService).onLangChange);

  /** 空间图加载中（服务清单是整页的骨架） */
  readonly loadingGraph = signal(true);
  /** 逐服务取数中 */
  readonly loading = signal(false);

  /** 当前项目下的全部服务（精简视图，见 GenericService） */
  readonly services = signal<GenericService[]>([]);
  /** did → 设备：概览表里显示依赖设备的在线态（空间图里的设备，含没挂服务的那些） */
  readonly devices = signal<Map<string, DeviceEntity>>(new Map());

  /* ----------------------------------------------------------------------------------------------
   * 查询条件
   * ----------------------------------------------------------------------------------------------*/

  /** 默认最近 24 小时：项目级看「昨天到今天」的多，实时看 1 小时就够，翻旧账才切 7 天 */
  readonly preset = signal<RangePreset>('24h');
  /** 自定义区间（nz-range-picker 绑定的两元素数组，随用户选择更新） */
  readonly customRange = signal<Date[]>([]);
  /** 生效的窗口（毫秒，左闭右开），失败清单一律用它；快照不用 */
  readonly from = signal(0);
  readonly to = signal(0);

  /* ----------------------------------------------------------------------------------------------
   * 取数结果
   * ----------------------------------------------------------------------------------------------*/

  /** 逐服务的当前值快照 */
  readonly overview = signal<ServiceOverview[]>([]);
  /** 空间级失败清单（一次取回整个项目）；请求失败时为 null */
  readonly failures = signal<ModbusHistoryFailures | null>(null);
  /** /failures 取数失败的原因；空串 = 取到了 */
  readonly failuresError = signal('');

  /** 取数失败的原因（「服务名: 消息」）：某一格取不到就显示 -，原因汇总在表格上方 */
  readonly loadErrors = computed<string[]>(() => {
    const messages = this.overview().map((row) => row.currentError);
    messages.push(this.failuresError());
    return [...new Set(messages.filter((message) => !!message))];
  });

  /** id → 服务：失败清单里的每条要靠 item.serviceId 归到具体服务上 */
  private readonly servicesById = computed<Map<string, GenericService>>(
    () => new Map(this.services().map((service) => [service.id, service])),
  );

  /** 两张表各自的页码：查询条件一变行数就跟着变，页码要回到第一页（同单服务历史页的理由） */
  readonly pageIndex = signal(1);
  readonly failurePageIndex = signal(1);

  /* ----------------------------------------------------------------------------------------------
   * 派生数据
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 项目级失败清单：后端已按时间倒序合并好（含服务归属），这里只把每条挂回空间图里的服务。
   * 不再自己排序 —— 排序与截断的口径在后端只有一份，前端再排一遍迟早会与那边走样。
   */
  readonly failureRows = computed<FailureRow[]>(() =>
    (this.failures()?.items ?? []).map((item) => {
      const serviceId = item.serviceId ?? '';
      return {
        key: `${serviceId}#${item.functionIndex}#${item.at}`,
        serviceId,
        service: this.servicesById().get(serviceId),
        item,
      };
    }),
  );

  /** 每个服务在窗口内最近的一次失败（清单倒序，故各服务的第一条即最新 —— 概览表的「采集异常」列） */
  private readonly latestFailureByService = computed<Map<string, ModbusHistoryFailure>>(() => {
    const latest = new Map<string, ModbusHistoryFailure>();
    for (const item of this.failures()?.items ?? []) {
      const serviceId = item.serviceId ?? '';
      if (!latest.has(serviceId)) {
        latest.set(serviceId, item);
      }
    }
    return latest;
  });

  /**
   * 概览表的行序：窗口内有异常的服务排前面（同有异常的按最近一次失败时刻倒序），其余保持空间图的顺序。
   * 这个页面的常客是「项目里现在哪儿不对」，不是「服务清单」。
   *
   * <p>顺序依赖失败清单，故做成派生而不是在取数时排一次 —— 换时间范围只重取失败清单，
   * 行序要跟着变。</p>
   */
  readonly overviewRows = computed<ServiceOverview[]>(() =>
    sortOverview(this.overview(), this.latestFailureByService()),
  );

  /**
   * 按类型汇总（条数降序、条数相同按键升序 —— 与后端 summary 的排序口径一致）。
   * 没带 type 的老数据不进汇总（它们在下表里显示为 -），免得堆出一个含义不明的标签。
   */
  readonly failureSummary = computed<{ type: string; count: number }[]>(() => {
    const counts = new Map<string, number>();
    for (const item of this.failures()?.items ?? []) {
      if (item.type) {
        counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
      }
    }
    return [...counts]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  });

  /** 窗口内的失败多于 limit：提示只列了最近的那部分（空间级清单的口径，整份清单共用一个上限） */
  readonly truncated = computed(() => this.failures()?.truncated === true);

  /** 页头：项目里最近一次成功采集的时刻（各服务里取最近的）；一个都没采到就是 null */
  readonly lastRecordedAt = computed<number | null>(() => {
    const times = this.overview()
      .map((row) => recordedAt(row.current))
      .filter((at): at is number => at != null);
    return times.length > 0 ? Math.max(...times) : null;
  });

  readonly deviceCount = computed<number>(() => this.devices().size);

  /* ----------------------------------------------------------------------------------------------
   * 选项文案（nz-segmented 的 label 只能在 TS 里翻，故用 computed 跟着语言重算）
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

  /** 空间图给出本项目全部服务 + 设备：服务清单是这一页的骨架，它取不到就没什么可看的 */
  private loadGraph(spaceId: string): void {
    this.loadingGraph.set(true);
    this.matrix.getSpaceGraph(spaceId).subscribe({
      next: (graph) => {
        this.services.set(graph.services ?? []);
        this.devices.set(new Map((graph.devices ?? []).map((device) => [device.did, device])));
        this.loadingGraph.set(false);
        // 服务清单到手才谈得上逐服务取数
        this.load();
      },
      error: (e) => {
        this.loadingGraph.set(false);
        this.msg.error(e?.message ?? e);
      },
    });
  }

  /* ----------------------------------------------------------------------------------------------
   * 取数
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 按当前条件重算窗口，快照与失败清单一并重取（进页面与「刷新」走这里）。
   * 预设是「最近 N」，故每次都重新对齐到现在 —— 页面开着不动窗口不会自己走，刷新即跟上。
   */
  protected load(): void {
    const win = this.timeWindow();
    if (!win) {
      return;
    }
    this.from.set(win.from);
    this.to.set(win.to);
    this.resetPages();
    this.reload();
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

  private reload(): void {
    const spaceId = this.account.space().id;
    const services = this.services();
    if (!spaceId || services.length === 0) {
      this.overview.set([]);
      return;
    }
    const from = this.from();
    const to = this.to();
    this.loading.set(true);
    forkJoin({
      // 快照：后端只有按服务的 /current，故只有这一块仍需逐服务扇出
      snapshot: forkJoin(
        services.map((service) =>
          this.request(service.name, this.modbus.getHistoryCurrent(spaceId, service.id)).pipe(
            map((part): ServiceOverview => ({
              service,
              current: part.value,
              currentError: part.error,
            })),
          ),
        ),
      ),
      // 失败清单：一条空间级请求带回整个项目的（含每条的服务归属）
      failures: this.request(
        '',
        this.modbus.getHistoryFailures(spaceId, null, from, to, null, FAILURE_LIMIT),
      ),
    }).subscribe((part) => {
      this.overview.set(part.snapshot);
      this.applyFailures(part.failures);
      this.loading.set(false);
    });
  }

  /** 只重取失败清单（换时间范围走这里）：当前值快照与窗口无关，不必跟着重取 */
  private reloadFailures(): void {
    const spaceId = this.account.space().id;
    if (!spaceId || this.overview().length === 0) {
      return;
    }
    this.loading.set(true);
    this.request(
      '',
      this.modbus.getHistoryFailures(spaceId, null, this.from(), this.to(), null, FAILURE_LIMIT),
    ).subscribe((part) => {
      this.applyFailures(part);
      this.loading.set(false);
    });
  }

  /** 失败清单的结果落位：错误原因跟着一起落，模板按「有没有 value」决定显示表格还是提示 */
  private applyFailures(part: { value: ModbusHistoryFailures | null; error: string }): void {
    this.failures.set(part.value);
    this.failuresError.set(part.error);
  }

  /**
   * 一次取数 + 兜错：失败时给 null 并把原因（「服务名: 消息」）带回来 ——
   * 一个服务取不到不该拖垮整页，其余服务照常显示；那一格显示 `-`，原因汇总在表格上方，
   * 免得把「没取到」看成「没有数据」。
   *
   * @param label 出错时用来标明是**谁**取不到（逐服务快照给服务名）；整页一份的请求给空串
   */
  private request<T>(
    label: string,
    source: Observable<T>,
  ): Observable<{ value: T | null; error: string }> {
    return source.pipe(
      map((value) => ({ value, error: '' })),
      catchError((e) => of({ value: null, error: label ? `${label}: ${e?.message ?? e}` : `${e?.message ?? e}` })),
    );
  }

  /* ----------------------------------------------------------------------------------------------
   * 交互
   * ----------------------------------------------------------------------------------------------*/

  protected onPresetChange(preset: RangePreset): void {
    this.preset.set(preset);
    this.resetPages();
    if (preset === 'custom') {
      // 进自定义先把当前窗口回填进选择器，用户改完（onCustomRangeChange）才取数
      if (this.customRange().length !== 2) {
        this.customRange.set([new Date(this.from()), new Date(this.to())]);
      }
      return;
    }
    const win = this.timeWindow();
    if (!win) {
      return;
    }
    this.from.set(win.from);
    this.to.set(win.to);
    this.reloadFailures();
  }

  protected onCustomRangeChange(range: Date[] | null): void {
    this.customRange.set(range ?? []);
    if (this.preset() === 'custom' && range?.length === 2 && range[0] && range[1]) {
      this.resetPages();
      this.from.set(range[0].getTime());
      this.to.set(range[1].getTime());
      this.reloadFailures();
    }
  }

  private resetPages(): void {
    this.pageIndex.set(1);
    this.failurePageIndex.set(1);
  }

  /* ----------------------------------------------------------------------------------------------
   * 展示文案
   * ----------------------------------------------------------------------------------------------*/

  protected serviceHistoryLink(service: GenericService): string[] {
    return ['/main/device/services', service.did, 'service', 'history', service.id];
  }

  protected device(did: string): DeviceEntity | undefined {
    return this.devices().get(did);
  }

  /** 在采方法数：/current 只列**有采集状态**的方法（没配轮询或从没采过的不在其中） */
  protected sampledCount(row: ServiceOverview): string {
    return row.current ? String(row.current.functions.length) : '-';
  }

  /** 该服务最后一次成功采集的时刻（各方法里取最近的） */
  protected recordedAt(row: ServiceOverview): number | null {
    return recordedAt(row.current);
  }

  /** 该服务在窗口内最近的一次失败（清单按时间倒序，故各服务的第一条即最新） */
  protected recentFailure(serviceId: string): ModbusHistoryFailure | null {
    return this.latestFailureByService().get(serviceId) ?? null;
  }

  /** 失败清单里那一行的服务名：服务已不在空间图里（刚被删掉/挪走）时退回 id，别留一片空白 */
  protected failureServiceName(row: FailureRow): string {
    return row.service?.name ?? row.serviceId;
  }

  /** 失败类型标签（带远端码），见 {@link modbusFailureLabel} */
  protected failureType(item: ModbusHistoryFailure): string {
    return this.failureLabel(item.type, item.remoteCode);
  }

  /** 单个类型的标签（汇总标签用，没有远端码） */
  protected failureLabel(type?: string, remoteCode?: number): string {
    // 语言变化信号：instant 本身不响应式，读一下它才能让模板在切换语言时重算
    this.langChange();
    return modbusFailureLabel(type, remoteCode, (key) => this.i18n.translate.instant(key));
  }
}

/** 当前值快照里最后一次成功采集的时刻（各方法里取最近的）；一个方法都没采到就是 null */
function recordedAt(current: ModbusHistoryCurrent | null): number | null {
  const times = (current?.functions ?? [])
    .map((state) => state.recordedAt)
    .filter((at): at is number => at != null);
  return times.length > 0 ? Math.max(...times) : null;
}

/**
 * 概览表的顺序：窗口内有异常的服务排前面（同有异常的按最近一次失败时刻倒序），其余保持空间图的顺序。
 * sort 稳定，故没异常的那部分（以及失败时刻相同的那些）顺序不变。
 */
function sortOverview(
  rows: ServiceOverview[],
  latest: Map<string, ModbusHistoryFailure>,
): ServiceOverview[] {
  const lastFailureAt = (row: ServiceOverview) => latest.get(row.service.id)?.at ?? null;
  return [...rows].sort((a, b) => {
    const left = lastFailureAt(a);
    const right = lastFailureAt(b);
    if (left == null || right == null) {
      return left == null ? (right == null ? 0 : 1) : -1;
    }
    return right - left;
  });
}
