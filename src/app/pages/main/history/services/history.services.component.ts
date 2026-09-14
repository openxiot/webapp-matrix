import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, from, map, mergeMap, of, toArray } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzMessageService } from 'ng-zorro-antd/message';
import { BreadcrumbTranslateDirective } from '../../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { EChartsDirective } from '../../../../common/components/echarts/echarts.directive';
import { AccountService } from '../../../../service/account.service';
import { MatrixService } from '../../../../service/matrix.service';
import { ModbusService } from '../../../../service/modbus.service';
import { MainI18nService } from '../../../../service/i18n.service';
import { DeviceEntity } from '../../../../typedef/define/device/DeviceEntity';
import { GenericService } from '../../../../typedef/define/service/GenericService';
import {
  ModbusService as ModbusServiceDef,
  ModbusServiceField,
  ModbusServiceFunction,
} from '../../../../typedef/define/modbus/ModbusService';
import {
  ModbusHistoryBucket,
  ModbusHistoryFailures,
  ModbusHistoryRange,
} from '../../../../typedef/define/modbus/ModbusHistory';
import { isBucket } from '../../../../typedef/codec/modbus/ModbusHistoryCodec';
import { isReadFunction } from '../../device/services/service/service.functions';
import { historyFieldOption } from '../../device/services/service/history/device.service.history.charts';

/** 时间范围预设：三档「最近 N」+ 自定义（与另两个历史页同一个口径） */
type RangePreset = '1h' | '24h' | '7d' | 'custom';

/** 展示形式：一行一条采样的长表 / 每个字段一张小图 */
type HistoryView = 'table' | 'chart';

/** 预设窗口跨度（毫秒）：`to` 取当下，`from` 由此往前推 */
const PRESET_SPAN: Record<Exclude<RangePreset, 'custom'>, number> = {
  '1h': 3600 * 1000,
  '24h': 24 * 3600 * 1000,
  '7d': 7 * 24 * 3600 * 1000,
};

/**
 * 单次取数的点数上限（后端夹到 [1, 2000]，超过它才返回降采样桶）。
 *
 * <p>这一页比单服务历史页**低一档**：那边一屏只有一个服务，表格要尽量多的原始点；这边是
 * 「服务数 × 字段数」条序列乘在一起，哪怕十几个服务也能凑出上百个字段 —— 每字段 2000 点会
 * 把表格的行数推到几十万，而 500 点（一小时的 5 秒周期正好装得下）既够看又不至于卡住。</p>
 *
 * <p>表格与曲线图共用同一个值，于是**切换形式不必重取**（同一批数据两种看法）。</p>
 */
const MAX_POINTS = 500;

/** 失败清单一次取回的条数（后端夹到 [1, 1000]）：空间级清单的口径是整份，不是每个服务 */
const FAILURE_LIMIT = 1000;

/** 同时最多发几个 /range 请求：字段数上百时，全放出去会把浏览器与后端一起噎住 */
const CONCURRENCY = 6;

/**
 * 曲线图一次最多画几张。字段上百时全画出来，浏览器光建 ECharts 实例就要几十秒
 * （每个实例一张 canvas + 一堆监听），翻起来也不像在看图了 —— 取数照取，画只画前这些张。
 */
const MAX_CHARTS = 30;

/**
 * 一个能取数的字段（应答字段本身，或位区展开出来的某一位）；与单服务历史页同一个口径。
 *
 * <p>这里的 `serviceName` / `functionName` / `field` / `unit` 全是**服务端的文本**（用户配的点表），
 * 只作展示、**永不进翻译**（见 AGENTS.md 的 i18n 一节）：翻译它等于改数据，键名一变排查时还对不上日志。
 * 表格的值列同理 —— 取值表命中的字段，值本身就是服务端给的 `description`。</p>
 */
interface FieldRef {
  /** 缓存键 / 勾选键：服务 + 方法 + 字段名（三者一起才唯一） */
  key: string;
  serviceId: string;
  serviceName: string;
  did: string;
  functionIndex: number;
  functionName: string;
  field: string;
  unit: string;
  /** 开关量（位区逐位展开出来的 0/1）：曲线走阶梯，不走直连 */
  step: boolean;
  /** 数值才画得出来（取值表命中的描述串画不了曲线，但表格照样列） */
  numeric: boolean;
}

/** 一个字段的取数结果：失败时只留 ref 与 error，其余字段不参与展示 */
interface FieldData {
  ref: FieldRef;
  range?: ModbusHistoryRange;
  error?: string;
}

/** 表格里的一行：原始样本一行一条，降采样桶也占一行（一行 = 一段） */
interface HistoryRow {
  key: string;
  at: number;
  time: string;
  serviceId: string;
  serviceName: string;
  did: string;
  functionIndex: number;
  functionName: string;
  field: string;
  value: string;
  unit: string;
  note: string;
}

/** 一张曲线图的渲染输入 */
interface HistoryChart {
  key: string;
  serviceName: string;
  did: string;
  field: string;
  functionIndex: number;
  functionName: string;
  unit: string;
  error: string;
  option: ReturnType<typeof historyFieldOption> | null;
}

/**
 * 项目级历史（「所有服务」）：当前项目下**全部服务**的采集数据放在一个页面里看，
 * 默认最近 1 小时、表格与曲线图两种看法。
 *
 * <p>与另两个历史页的分工：一级的 `/main/history` 看「哪儿不对」（总览 + 异常清单），
 * 单服务的 `.../service/history/{id}` 看一个服务的每一个字段，这一页看**一批服务放在一起**
 * —— 「这个项目这一小时都采到什么」。</p>
 *
 * <p>取数是「服务 × 方法 × 字段」逐个请求（`/history/range` 的口径就是单字段），故这一页天生
 * 是扇出的：进页面先拿空间图（服务清单）与每个服务的定义（要解析出有哪些字段、什么单位），
 * 再按选中的服务把字段铺开、**限并发**逐个取。字段数一多就上百个请求 —— 那一层本该由后端
 * 一次给全（按空间的多序列接口），届时把这里的 mergeMap 换成单个订阅即可。</p>
 *
 * <p>三个筛选各管一段：**服务**决定取数范围（改了要重取），**时间**决定窗口（改了要重取），
 * **字段**只筛显示（数据已经在手上，改了不重取）—— 于是勾掉几个字段是瞬间的，
 * 想少发请求就去掉几个服务。</p>
 */
@Component({
  selector: 'history-services',
  templateUrl: './history.services.component.html',
  styleUrl: './history.services.component.less',
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
    NzEmptyModule,
    NzAlertModule,
    NzDescriptionsModule,
    NzIconModule,
    NzSegmentedModule,
    NzSelectModule,
    NzDatePickerModule,
    BreadcrumbTranslateDirective,
    EChartsDirective,
    TranslatePipe,
  ],
})
export class HistoryServicesComponent implements OnInit {
  protected readonly location = inject(Location);
  private readonly msg = inject(NzMessageService);
  private readonly account = inject(AccountService);
  private readonly matrix = inject(MatrixService);
  private readonly modbus = inject(ModbusService);
  protected readonly i18n = inject(MainI18nService);
  /** 语言切换信号：nz-segmented / nz-option 的文案与单位后缀都只能在 TS 里翻，靠它驱动重算 */
  private readonly langChange = toSignal(inject(TranslateService).onLangChange);

  /** 空间图加载中（服务清单是整页的骨架） */
  readonly loadingGraph = signal(true);
  /** 取数中（逐字段逐个请求） */
  readonly loading = signal(false);

  /** 当前项目下的全部服务（精简视图） */
  readonly services = signal<GenericService[]>([]);
  /** did → 设备：表格里显示依赖设备 */
  readonly devices = signal<Map<string, DeviceEntity>>(new Map());
  /** 服务定义（解析字段用）：id → 完整定义；取不到的服务不在其中 */
  readonly definitions = signal<Map<string, ModbusServiceDef>>(new Map());
  /** 定义取不到的服务（点表解析不出来，就没有字段可取）：服务名 + 原因 */
  readonly definitionErrors = signal<string[]>([]);

  /* ----------------------------------------------------------------------------------------------
   * 查询条件
   * ----------------------------------------------------------------------------------------------*/

  /** 默认最近 1 小时：这一页是「现在采成什么样」，翻旧账切 24 小时 / 7 天 */
  readonly preset = signal<RangePreset>('1h');
  /** 自定义区间（nz-range-picker 绑定的两元素数组，随用户选择更新） */
  readonly customRange = signal<Date[]>([]);
  /** 生效的窗口（毫秒，左闭右开），取数一律用它 */
  readonly from = signal(0);
  readonly to = signal(0);

  /** 参与取数的服务 id（默认全部）；空数组 = 一个都不取，页面就是空的 */
  readonly selectedServiceIds = signal<string[]>([]);
  /** 参与显示的字段（{@link FieldRef.key} 的集合）：只是筛显示，不影响已取回的数据 */
  readonly selectedFieldKeys = signal<string[]>([]);
  readonly view = signal<HistoryView>('table');

  /**
   * 两张表各自的页码。查询条件一变行数就跟着变，页码要回到第一页 ——
   * nz-table 面对越界页码是把新数据整批丢掉、继续显示上一批的行，停在那儿会看到过期的内容。
   */
  readonly pageIndex = signal(1);

  /* ----------------------------------------------------------------------------------------------
   * 取数结果
   * ----------------------------------------------------------------------------------------------*/

  readonly data = signal<FieldData[]>([]);
  /** 已取回的字段数 / 本次要取的字段数：逐字段取，这个进度比一个转圈有信息量 */
  readonly fetched = signal(0);
  readonly toFetch = signal(0);
  /** 空间级失败清单（画竖线用）；取不到就只是没有竖线，不影响数据本身 */
  readonly failures = signal<ModbusHistoryFailures | undefined>(undefined);

  /* ----------------------------------------------------------------------------------------------
   * 派生数据
   * ----------------------------------------------------------------------------------------------*/

  /** 选中的服务（按空间图顺序，故取数顺序稳定） */
  readonly selectedServices = computed<GenericService[]>(() => {
    const picked = new Set(this.selectedServiceIds());
    return this.services().filter((service) => picked.has(service.id));
  });

  /** 选中服务的全部字段：表格列的是这些，曲线图只用其中数值的那部分 */
  readonly fields = computed<FieldRef[]>(() => {
    const defs = this.definitions();
    const refs: FieldRef[] = [];
    for (const service of this.selectedServices()) {
      const def = defs.get(service.id);
      for (const func of def?.functions ?? []) {
        if (!isReadFunction(func)) {
          continue;
        }
        for (const field of func.response ?? []) {
          refs.push(fieldRef(service, func, field, false));
          for (const bit of field.bitList ?? []) {
            // 位区展开出来的位是同一次调用的另外几个取值，各自也有一条历史
            refs.push({
              key: refKey(service.id, func.index, bit.field),
              serviceId: service.id,
              serviceName: service.name,
              did: service.did,
              functionIndex: func.index,
              functionName: func.name,
              field: bit.field,
              unit: '',
              step: true,
              numeric: true,
            });
          }
        }
      }
    }
    return refs;
  });

  /** 画得出曲线的字段：取值表命中的字符串字段只能进表格 */
  readonly numericFields = computed<FieldRef[]>(() => this.fields().filter((ref) => ref.numeric));

  /** 要显示的字段：勾选 ∩ 可得字段（换服务后勾选里可能留着别的服务的键，故要夹一次） */
  readonly displayFields = computed<FieldRef[]>(() => {
    const picked = new Set(this.selectedFieldKeys());
    return this.fields().filter((ref) => picked.has(ref.key));
  });

  /** 曲线图要画的字段：显示的里取前 {@link MAX_CHARTS} 个（见该常量的理由） */
  readonly chartRefs = computed<FieldRef[]>(() =>
    this.numericFields()
      .filter((ref) => {
        const picked = new Set(this.selectedFieldKeys());
        return picked.has(ref.key);
      })
      .slice(0, MAX_CHARTS),
  );

  /** 选中的字段多于能画的张数：提示用「字段」收窄（不是错误，只是不给全画） */
  readonly chartTruncated = computed<boolean>(
    () => this.view() === 'chart' && this.displayFields().length > MAX_CHARTS,
  );

  /** 表格行：按时间倒序（最新的在最上面），桶行的时间写成「桶起点 ~ 桶终点」 */
  readonly rows = computed<HistoryRow[]>(() => {
    this.langChange();
    const keepalive = this.i18n.translate.instant('保持');
    const shown = new Set(this.displayFields().map((ref) => ref.key));
    const rows: HistoryRow[] = [];
    for (const item of this.data()) {
      if (!shown.has(item.ref.key)) {
        continue;
      }
      for (const point of item.range?.points ?? []) {
        const head = {
          at: point.at,
          serviceId: item.ref.serviceId,
          serviceName: item.ref.serviceName,
          did: item.ref.did,
          functionIndex: item.ref.functionIndex,
          functionName: item.ref.functionName,
          field: item.ref.field,
          unit: item.ref.unit,
        };
        if (isBucket(point)) {
          // 降采样时一行 = 一个时间桶（一段），时间写成「起点 ~ 终点」
          rows.push({
            ...head,
            key: `${item.ref.key}#${point.at}`,
            time: timeText(point.at, point.until),
            value: bucketText(point),
            note: '',
          });
          continue;
        }
        rows.push({
          ...head,
          key: `${item.ref.key}#${point.at}`,
          time: timeText(point.at),
          value: valueText(point.value),
          // 值没变、按 keep-alive 时限补记的一条：与「变了才记」区分开
          note: point.keepalive === true ? keepalive : '',
        });
      }
    }
    // 同一时刻的多个字段保持服务/字段的定义顺序（sort 是稳定的），看着有规律
    rows.sort((a, b) => b.at - a.at);
    return rows;
  });

  /** 「服务 + 方法」→ 该方法在窗口内的失败时刻（图上画竖线用） */
  private readonly failureTimes = computed<Map<string, number[]>>(() => {
    const map = new Map<string, number[]>();
    for (const item of this.failures()?.items ?? []) {
      const key = chartKey(item.serviceId ?? '', item.functionIndex);
      const list = map.get(key) ?? [];
      list.push(item.at);
      map.set(key, list);
    }
    return map;
  });

  readonly charts = computed<HistoryChart[]>(() => {
    const refs = this.chartRefs();
    const byKey = new Map(this.data().map((item) => [item.ref.key, item]));
    const times = this.failureTimes();
    return refs.map((ref, i) => {
      const item = byKey.get(ref.key);
      const range = item?.range;
      return {
        key: ref.key,
        serviceName: ref.serviceName,
        did: ref.did,
        field: ref.field,
        functionIndex: ref.functionIndex,
        functionName: ref.functionName,
        unit: ref.unit,
        error: item?.error ?? '',
        option: range
          ? historyFieldOption(
              {
                field: ref.field,
                unit: ref.unit,
                step: ref.step,
                range,
                failures: times.get(chartKey(ref.serviceId, ref.functionIndex)) ?? [],
              },
              // 时间轴只有最下面那张画：几张图纵向排开、时间轴对齐，刻度重复画没意义
              { from: this.from(), to: this.to(), showTimeAxis: i === refs.length - 1 },
            )
          : null,
      };
    });
  });

  /** 命中降采样时给一句说明：表格里的括号与图上的虚线都靠它解释 */
  readonly downsampled = computed(() =>
    this.data().some((item) => item.range?.downsampled === true),
  );

  /** 取数失败的字段：一个字段失败不影响其余，表格没有挂错处，去重后统一提示在内容上方 */
  readonly loadErrors = computed<string[]>(() => {
    const errors = [...this.definitionErrors(), ...this.data().map((item) => item.error)];
    return [...new Set(errors.filter((e): e is string => !!e))];
  });

  /** 页头：选中服务里最近一次成功采集的时刻 */
  readonly lastRecordedAt = computed<number | null>(() => {
    const times = this.data()
      .flatMap((item) => item.range?.points ?? [])
      .map((point) => (isBucket(point) ? point.until : point.at));
    return times.length > 0 ? Math.max(...times) : null;
  });

  /** 有服务的失败清单被截断（窗口内失败多于 limit）：竖线只画了最近的那部分 */
  readonly failuresTruncated = computed(() => this.failures()?.truncated === true);

  /* ----------------------------------------------------------------------------------------------
   * 选项文案（nz-segmented / nz-option 的 label 只能在 TS 里翻，故用 computed 跟着语言重算）
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

  protected readonly viewOptions = computed(() => {
    this.langChange();
    const t = (key: string) => this.i18n.translate.instant(key);
    return [
      { label: t('表格'), value: 'table' as HistoryView },
      { label: t('曲线图'), value: 'chart' as HistoryView },
    ];
  });

  /** 服务选择器的选项：名称 + 依赖设备（同名服务靠 did 区分） */
  protected readonly serviceOptions = computed(() => {
    this.langChange();
    return this.services().map((service) => ({
      value: service.id,
      label: `${service.name} · ${service.did}`,
    }));
  });

  /** 字段选择器的选项：服务名 + 方法 + 字段（+ 单位），并标出非数值字段只能进表格 */
  protected readonly fieldOptions = computed(() => {
    this.langChange();
    return this.fields().map((ref) => ({
      value: ref.key,
      label: this.fieldOptionLabel(ref),
    }));
  });

  /** 已选的字段数 / 全部（工具栏里直接报数，比让人去数标签快） */
  protected readonly fieldCount = computed<[number, number]>(() => [
    this.displayFields().length,
    this.fields().length,
  ]);

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

  /** 空间图给出本项目全部服务 + 设备；服务清单是这一页的骨架，它取不到就没什么可看的 */
  private loadGraph(spaceId: string): void {
    this.loadingGraph.set(true);
    this.matrix.getSpaceGraph(spaceId).subscribe({
      next: (graph) => {
        const services = graph.services ?? [];
        this.services.set(services);
        this.devices.set(new Map((graph.devices ?? []).map((device) => [device.did, device])));
        this.selectedServiceIds.set(services.map((service) => service.id));
        this.loadingGraph.set(false);
        // 字段要等定义到手才解析得出来，取数从这里起步
        this.loadDefinitions(spaceId, services);
      },
      error: (e) => {
        this.loadingGraph.set(false);
        this.msg.error(e?.message ?? e);
      },
    });
  }

  /** 逐服务取定义（要的是 functions / response：字段清单与单位都在里面），一个失败不影响其余 */
  private loadDefinitions(spaceId: string, services: GenericService[]): void {
    if (services.length === 0) {
      this.load();
      return;
    }
    forkJoin(
      services.map((service) =>
        this.modbus.getService(spaceId, service.id).pipe(
          map((def): { id: string; def: ModbusServiceDef | null; error: string } => ({
            id: service.id,
            def,
            error: '',
          })),
          catchError((e) =>
            of({ id: service.id, def: null, error: `${service.name}: ${e?.message ?? e}` }),
          ),
        ),
      ),
    ).subscribe((results) => {
      this.definitions.set(
        new Map(
          results
            .filter(
              (part): part is { id: string; def: ModbusServiceDef; error: string } =>
                part.def != null,
            )
            .map((part) => [part.id, part.def]),
        ),
      );
      this.definitionErrors.set(results.map((part) => part.error).filter((error) => !!error));
      // 字段全集到手才谈得上默认勾选（进页面默认全取数值字段）
      this.resetFieldSelection();
      this.load();
    });
  }

  /* ----------------------------------------------------------------------------------------------
   * 取数
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 按当前条件重算窗口并取数（进页面、「刷新」、切时间范围都走这里）。
   * 预设是「最近 N」，故每次都重新对齐到现在 —— 页面开着不动窗口不会自己走，刷新即跟上。
   *
   * <p>**不动字段勾选**：换一档时间范围与挑哪几个字段是两件事，把人家刚收窄的选择重置掉很讨厌；
   * 勾选只在服务变了（字段全集跟着变）时才重置。</p>
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
    if (!spaceId) {
      return;
    }
    const refs = this.fields();
    // 别用 from / to 当局部名：会把 rxjs 的 from 遮住（下面要用它把字段清单铺成流）
    const start = this.from();
    const end = this.to();
    this.loadFailures(spaceId, start, end);

    if (refs.length === 0) {
      this.data.set([]);
      this.fetched.set(0);
      this.toFetch.set(0);
      return;
    }
    this.fetched.set(0);
    this.toFetch.set(refs.length);
    this.loading.set(true);
    // 限并发：字段上百时全放出去，浏览器（连接数上限）与后端（同时几十条聚合查询）都吃不消
    from(refs)
      .pipe(
        mergeMap(
          (ref) =>
            this.modbus
              .getHistoryRange(
                spaceId,
                ref.serviceId,
                ref.functionIndex,
                ref.field,
                start,
                end,
                MAX_POINTS,
              )
              .pipe(
                map((range): FieldData => ({ ref, range })),
                // 一个字段取不到（窗口过密、后端拒绝）不该拖垮整页：原因挂在它自己那张图上
                catchError((e) => of<FieldData>({ ref, error: e?.message ?? String(e) })),
                // 进度：这个计数只喂页面上的「已取 N / M」，不参与取数逻辑
                map((item) => {
                  this.fetched.update((n) => n + 1);
                  return item;
                }),
              ),
          CONCURRENCY,
        ),
        // 并发回来是无序的，收齐后按字段清单的顺序排一次，表格里同一时刻的行才稳定
        toArray(),
      )
      .subscribe((results) => {
        this.data.set(byFieldOrder(results, refs));
        this.loading.set(false);
      });
  }

  /** 失败清单（空间级，一条请求带回整个项目的）：只用于图上的竖线，取不到就不画 */
  private loadFailures(spaceId: string, from: number, to: number): void {
    this.modbus.getHistoryFailures(spaceId, null, from, to, null, FAILURE_LIMIT).subscribe({
      next: (failures) => this.failures.set(failures),
      error: () => this.failures.set(undefined),
    });
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

  /** 换服务要重取（取数范围变了），字段选择也按新范围重置 */
  protected onServicesChange(ids: string[]): void {
    this.selectedServiceIds.set(ids);
    this.resetFieldSelection();
    this.resetPages();
    this.reload();
  }

  /** 换字段**不重取**：数据已经在手上，勾选只决定显示哪几条（见类注释里的分工） */
  protected onFieldsChange(keys: string[]): void {
    this.selectedFieldKeys.set(keys);
    this.resetPages();
  }

  protected onViewChange(view: HistoryView): void {
    this.view.set(view);
    this.resetPages();
    // 两种形式共用同一批数据（同一个 maxPoints），切换不必重取
  }

  protected refresh(): void {
    this.load();
  }

  /**
   * 默认勾选全部数值字段（+ 位区展开出来的位）：这一页要的就是「所有服务的采集数据」，
   * 非数值字段（取值表命中的描述串）默认不勾 —— 它们画不出曲线，列进表格又会把行数翻倍，
   * 要看的在字段选择框里勾上即可。
   */
  private resetFieldSelection(): void {
    this.selectedFieldKeys.set(this.numericFields().map((ref) => ref.key));
  }

  private resetPages(): void {
    this.pageIndex.set(1);
  }

  /* ----------------------------------------------------------------------------------------------
   * 展示文案
   * ----------------------------------------------------------------------------------------------*/

  protected serviceHistoryLink(row: { did: string; serviceId: string }): string[] {
    return ['/main/device/services', row.did, 'service', 'history', row.serviceId];
  }

  protected device(did: string): DeviceEntity | undefined {
    return this.devices().get(did);
  }

  /** 字段选择器里的一行文案：服务 + 方法 + 字段 + 单位（都是服务端的名字，原样拼，不翻） */
  protected fieldOptionLabel(ref: FieldRef): string {
    const unit = ref.unit ? ` (${ref.unit})` : '';
    return `${ref.serviceName} · #${ref.functionIndex} ${ref.field}${unit}`;
  }

  /** 图上方的标题：字段名 + 单位，第二行给服务与方法（这一页字段是跨服务的，标题必须带服务） */
  protected chartTitle(chart: HistoryChart): string {
    return chart.unit ? `${chart.field} (${chart.unit})` : chart.field;
  }

  protected chartSubtitle(chart: HistoryChart): string {
    return `${chart.serviceName} · #${chart.functionIndex} ${chart.functionName}`;
  }

  /** 取数进度文案：「已取 12 / 480」——纯数字与斜杠，不必占词条 */
  protected readonly progressText = computed<string>(() => `${this.fetched()} / ${this.toFetch()}`);
}

/** 缓存键：字段名在方法与服务之间都可能重名，故三样一起才唯一 */
function refKey(serviceId: string, functionIndex: number, field: string): string {
  return `${serviceId}#${functionIndex}#${field}`;
}

/** 「服务 + 方法」的键：失败竖线要按它归到图上 */
function chartKey(serviceId: string, functionIndex: number): string {
  return `${serviceId}#${functionIndex}`;
}

/** 应答字段 → 可取数的字段；数值判定见 {@link fieldRef} */
function fieldRef(
  service: GenericService,
  func: ModbusServiceFunction,
  field: ModbusServiceField,
  step: boolean,
): FieldRef {
  return {
    key: refKey(service.id, func.index, field.field),
    serviceId: service.id,
    serviceName: service.name,
    did: service.did,
    functionIndex: func.index,
    functionName: func.name,
    field: field.field,
    unit: field.unit ?? '',
    step,
    // 取值表命中时字段值直接是描述串（不再缩放），画不成曲线；string 同理
    numeric: field.format !== 'string' && (field.valueList ?? []).length === 0,
  };
}

/** 并发取回的结果按字段清单的顺序排好：同一时刻的行序才稳定（sort 稳定，不再受完成先后影响） */
function byFieldOrder(results: FieldData[], refs: FieldRef[]): FieldData[] {
  const order = new Map(refs.map((ref, i) => [ref.key, i]));
  return [...results].sort(
    (a, b) => (order.get(a.ref.key) ?? 0) - (order.get(b.ref.key) ?? 0),
  );
}

/** 采样值的展示文案：数值收一收浮点误差，对象退化成 JSON，null 显示 - */
function valueText(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'number') {
    return numberText(value);
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/**
 * 降采样桶的展示文案：有统计量（数值字段）时给「均值 (最小 ~ 最大)」，与曲线图上
 * 「实线 + 两条虚线」是同三个数；非数值字段没有统计量，退回桶首尾的状态值。
 */
function bucketText(bucket: ModbusHistoryBucket): string {
  if (bucket.avg != null) {
    const rangeText =
      bucket.min != null && bucket.max != null
        ? ` (${numberText(bucket.min)} ~ ${numberText(bucket.max)})`
        : '';
    return `${numberText(bucket.avg)}${rangeText}`;
  }
  const first = valueText(bucket.first);
  const last = valueText(bucket.last);
  return first === last ? first : `${first} ~ ${last}`;
}

/** 数值文案：整数不带小数点，浮点收到 4 位（0.30000000000000004 → 0.3） */
function numberText(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

/** 采集时刻：桶写成「起点 ~ 终点」，跨天时终点写全，同一天只写时分秒 */
function timeText(at: number, until?: number): string {
  const head = dateTime(at);
  if (until == null || until === at) {
    return head;
  }
  const tail = dateTime(until);
  return `${head} ~ ${sameDay(at, until) ? tail.slice(11) : tail}`;
}

function dateTime(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function sameDay(a: number, b: number): boolean {
  return dateTime(a).slice(0, 10) === dateTime(b).slice(0, 10);
}
