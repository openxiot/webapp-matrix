import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, of } from 'rxjs';
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
import { BreadcrumbTranslateDirective } from '../../../../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { EChartsDirective } from '../../../../../../common/components/echarts/echarts.directive';
import { AccountService } from '../../../../../../service/account.service';
import { MatrixService } from '../../../../../../service/matrix.service';
import { ModbusService } from '../../../../../../service/modbus.service';
import { MainI18nService } from '../../../../../../service/i18n.service';
import { DeviceEntity } from '../../../../../../typedef/define/device/DeviceEntity';
import {
  ModbusService as ModbusServiceDef,
  ModbusServiceField,
  ModbusServiceFunction,
} from '../../../../../../typedef/define/modbus/ModbusService';
import {
  ModbusHistoryBucket,
  ModbusHistoryCurrent,
  ModbusHistoryFailures,
  ModbusHistoryRange,
  modbusFailureLabel,
} from '../../../../../../typedef/define/modbus/ModbusHistory';
import { isBucket } from '../../../../../../typedef/codec/modbus/ModbusHistoryCodec';
import { isReadFunction } from '../service.functions';
import { historyFieldOption } from './device.service.history.charts';

/** 时间范围预设：三档「最近 N」+ 自定义（自定义走区间选择器给绝对时刻） */
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
 * 单次取数的最大点数：表格要尽量多的原始点（一行一条采样，点越多越接近「每一次采集」），
 * 曲线图按后端缺省值就够（再多也画不出来，只会把线画糊）。
 * 两个值都在后端 [1, 2000] 的夹取范围内，超过它才返回降采样桶。
 */
const TABLE_MAX_POINTS = 2000;
const CHART_MAX_POINTS = 500;

/** 失败清单一次取回的条数（后端夹到 [1, 1000]）；超出时后端会给 truncated 标志 */
const FAILURE_LIMIT = 200;

/**
 * 曲线图默认勾选的字段数（方法多、字段多的服务一进页面就画几十张图既慢又看不过来），
 * 只是**默认**选择：字段选择框里能改，且不做数量上限 —— 勾了几张就画几张。
 */
const DEFAULT_CHART_FIELDS = 12;

/** 一个能取数的字段（应答字段本身，或位区展开出来的某一位） */
interface FieldRef {
  /** 同一个字段名可以出现在不同方法里，故缓存键带上方法序号 */
  key: string;
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
  field: string;
  functionIndex: number;
  functionName: string;
  unit: string;
  error: string;
  option: ReturnType<typeof historyFieldOption> | null;
}

/**
 * Modbus 服务的历史数据（服务端按各方法的调用周期自动采集，落库后由
 * ModbusHistoryResource 取回）。同一份窗口数据有两种看法：
 *
 * - **表格**：一行一条采样（时间 / 方法 / 字段 / 值 / 单位 / 备注）。采集是「值变了才记一条」，
 *   只有长表能把不同字段各自的时刻如实摊开 —— 宽表的行是齐的，但大部分格子会是空的。
 * - **曲线图**：一个字段一张小图、竖向排列、共享同一条时间轴（只有最下面那张画时间刻度），
 *   失败的采集在图上打一条竖虚线，明细见页尾的「采集异常」。
 *
 * 取数按「方法 × 字段」逐个请求（/history/range 的口径就是单字段），一个字段失败不影响其余，
 * 失败原因就挂在它自己那张图上。
 */
@Component({
  selector: 'device-service-history',
  templateUrl: './device.service.history.component.html',
  styleUrls: ['./device.service.history.component.less'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormsModule,
    DatePipe,
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
export class DeviceServiceHistoryComponent implements OnInit {
  /** 返回上一页：这个页面从设备页与服务列表两个入口都能进来，退回来源比退回某条固定路由自然 */
  protected readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly msg = inject(NzMessageService);
  private readonly account = inject(AccountService);
  private readonly matrix = inject(MatrixService);
  private readonly modbus = inject(ModbusService);
  protected readonly i18n = inject(MainI18nService);
  /** 语言切换信号：nz-segmented 的选项文案只能在 TS 里翻，靠它驱动重算。 */
  private readonly langChange = toSignal(inject(TranslateService).onLangChange);

  /** 依赖设备（DTU）did */
  readonly did = signal('');
  /** 服务 id */
  readonly id = signal('');

  readonly loadingService = signal(true);
  readonly loading = signal(false);
  readonly service = signal<ModbusServiceDef | undefined>(undefined);
  readonly device = signal<DeviceEntity | undefined>(undefined);
  /** 各方法最后一次成功采到的值（页头显示「已采到数据的方法数 / 最后采集时刻」） */
  readonly current = signal<ModbusHistoryCurrent | undefined>(undefined);

  /* ----------------------------------------------------------------------------------------------
   * 查询条件
   * ----------------------------------------------------------------------------------------------*/

  readonly preset = signal<RangePreset>('1h');
  /** 自定义区间（nz-range-picker 绑定的两元素数组，随用户选择更新） */
  readonly customRange = signal<Date[]>([]);
  /** 生效的窗口（毫秒，左闭右开），取数一律用它 */
  readonly from = signal(0);
  readonly to = signal(0);

  /** 方法筛选：0 = 全部方法（方法序号是 1 起自然数，0 空着，省得 nz-select 的 null 值来回折腾） */
  readonly functionIndex = signal(0);
  readonly view = signal<HistoryView>('table');
  /** 曲线图勾选的字段（FieldRef.key）；换方法时按新范围的数值字段重置 */
  readonly chartFields = signal<string[]>([]);

  /**
   * 两张表各自的页码。查询条件一变行数就跟着变，页码要回到第一页 ——
   * nz-table 面对越界页码是把新数据整批丢掉、继续显示上一批的行，停在那儿会看到过期的内容。
   */
  readonly pageIndex = signal(1);
  readonly failurePageIndex = signal(1);

  /* ----------------------------------------------------------------------------------------------
   * 取数结果
   * ----------------------------------------------------------------------------------------------*/

  readonly data = signal<FieldData[]>([]);
  readonly failures = signal<ModbusHistoryFailures | undefined>(undefined);
  readonly failuresError = signal('');

  /* ----------------------------------------------------------------------------------------------
   * 派生数据
   * ----------------------------------------------------------------------------------------------*/

  readonly functions = computed<ModbusServiceFunction[]>(() => this.service()?.functions ?? []);

  /** 能配轮询的只有读方法，历史也只可能出在它们身上，故方法筛选只列这些 */
  readonly readFunctions = computed<ModbusServiceFunction[]>(() =>
    this.functions().filter((func) => isReadFunction(func)),
  );

  /** 当前方法筛选下的全部字段（表格列的就是这些；曲线图只用其中数值的那部分） */
  readonly fields = computed<FieldRef[]>(() => {
    const pick = this.functionIndex();
    const refs: FieldRef[] = [];
    for (const func of this.readFunctions()) {
      if (pick > 0 && func.index !== pick) {
        continue;
      }
      for (const field of func.response ?? []) {
        refs.push(fieldRef(func, field, false));
        for (const bit of field.bitList ?? []) {
          // 位区展开出来的位是同一次调用的另外几个取值，各自也有一条历史
          refs.push({
            key: refKey(func.index, bit.field),
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
    return refs;
  });

  /** 画得出曲线的字段：取值表命中的字符串字段只能进表格 */
  readonly numericFields = computed<FieldRef[]>(() => this.fields().filter((ref) => ref.numeric));

  /** 曲线图要画的字段：勾选 ∩ 可得字段（换方法后勾选里可能留着别的方法的键，故要夹一次） */
  readonly chartRefs = computed<FieldRef[]>(() => {
    const selected = new Set(this.chartFields());
    return this.numericFields().filter((ref) => selected.has(ref.key));
  });

  /** 表格行：按时间倒序（最新的在最上面），桶行的时间写成「桶起点 ~ 桶终点」 */
  readonly rows = computed<HistoryRow[]>(() => {
    this.langChange();
    const keepalive = this.i18n.translate.instant('保持');
    const rows: HistoryRow[] = [];
    for (const item of this.data()) {
      for (const point of item.range?.points ?? []) {
        const head = {
          at: point.at,
          functionIndex: item.ref.functionIndex,
          functionName: item.ref.functionName,
          field: item.ref.field,
          unit: item.ref.unit,
        };
        if (isBucket(point)) {
          // 降采样时一行 = 一个时间桶（一段），时间写成「起点 ~ 终点」
          rows.push({
            ...head,
            key: `${point.at}#${item.ref.key}`,
            time: timeText(point.at, point.until),
            value: bucketText(point),
            note: '',
          });
          continue;
        }
        rows.push({
          ...head,
          key: `${point.at}#${item.ref.key}`,
          time: timeText(point.at),
          value: valueText(point.value),
          // 值没变、按 keep-alive 时限补记的一条：与「变了才记」区分开
          note: point.keepalive === true ? keepalive : '',
        });
      }
    }
    // 同一时刻的多个字段保持方法/字段的定义顺序（sort 是稳定的），看着有规律
    rows.sort((a, b) => b.at - a.at);
    return rows;
  });

  /** 方法序号 → 该方法在窗口内的失败时刻（图上画竖线用） */
  readonly failureTimes = computed<Map<number, number[]>>(() => {
    const map = new Map<number, number[]>();
    for (const item of this.failures()?.items ?? []) {
      const list = map.get(item.functionIndex) ?? [];
      list.push(item.at);
      map.set(item.functionIndex, list);
    }
    return map;
  });

  readonly charts = computed<HistoryChart[]>(() => {
    const refs = this.chartRefs();
    const byKey = new Map(this.data().map((item) => [item.ref.key, item]));
    return refs.map((ref, i) => {
      const item = byKey.get(ref.key);
      const range = item?.range;
      const failures = this.failureTimes().get(ref.functionIndex) ?? [];
      return {
        key: ref.key,
        field: ref.field,
        functionIndex: ref.functionIndex,
        functionName: ref.functionName,
        unit: ref.unit,
        error: item?.error ?? '',
        option: range
          ? historyFieldOption(
              { field: ref.field, unit: ref.unit, step: ref.step, range, failures },
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
    const errors = this.data().map((item) => item.error);
    return [...new Set(errors.filter((e): e is string => !!e))];
  });

  /** 页头：最后一次成功采集的时刻（各方法里取最近的那个） */
  readonly lastRecordedAt = computed<number | null>(() => {
    const times = (this.current()?.functions ?? [])
      .map((state) => state.recordedAt)
      .filter((at): at is number => at != null);
    return times.length > 0 ? Math.max(...times) : null;
  });

  /** 页头：真正采到过数据的方法数（配了轮询、且至少成功采过一次） */
  readonly sampledCount = computed<number>(
    () => (this.current()?.functions ?? []).filter((state) => state.recordedAt != null).length,
  );

  /* ----------------------------------------------------------------------------------------------
   * 选项文案（nz-segmented / nz-option 的 label 只能在 TS 里翻，故用 computed 跟着语言重算）
   * ----------------------------------------------------------------------------------------------*/

  protected readonly presetOptions = computed(() => {
    this.langChange();
    const t = (key: string) => this.i18n.translate.instant(key);
    // 每档整体一个词条（而不是「数字 + 时间单位」拼）：各语言里 1 与 24 / 7 的名词形态未必相同，
    // 拼出来的「24 小时」在多数语言里会露出单复数的破绽，整句交给译者才写得自然
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

  /* ----------------------------------------------------------------------------------------------
   * 生命周期
   * ----------------------------------------------------------------------------------------------*/

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      this.did.set(params['did'] ?? '');
      this.id.set(params['id'] ?? '');
      this.loadDevice(this.did());
      this.loadService(this.id());
    });
  }

  private loadService(id: string): void {
    if (!id) {
      return;
    }
    const spaceId = this.account.space().id;
    if (!spaceId) {
      this.loadingService.set(false);
      this.msg.warning(this.i18n.translate.instant('请先在项目列表中选择一个项目'));
      return;
    }
    this.loadingService.set(true);
    this.modbus.getService(spaceId, id).subscribe({
      next: (service) => {
        this.service.set(service);
        this.loadingService.set(false);
        this.resetChartFields();
        // 字段要等定义到手才解析得出来，取数从这里起步
        this.load();
      },
      error: (e) => {
        this.loadingService.set(false);
        this.msg.error(e?.message ?? e);
      },
    });
  }

  /** 设备只用于展示摘要（在线态），取不到不影响历史数据本身 */
  private loadDevice(did: string): void {
    const spaceId = this.account.space().id;
    if (!spaceId || !did) {
      return;
    }
    this.matrix.getDevice(spaceId, did).subscribe({
      next: (device) => this.device.set(device),
      error: () => {},
    });
  }

  /* ----------------------------------------------------------------------------------------------
   * 取数
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 按当前条件重算窗口并取数（「刷新」与切时间范围都走这里）。
   * 预设是「最近 N」，故每次都重新对齐到现在 —— 页面开着不动时窗口不会自己走，刷新即跟上。
   */
  protected load(): void {
    const preset = this.preset();
    if (preset === 'custom') {
      const range = this.customRange();
      if (range.length !== 2 || !range[0] || !range[1]) {
        return;
      }
      this.from.set(range[0].getTime());
      this.to.set(range[1].getTime());
    } else {
      const now = Date.now();
      this.to.set(now);
      this.from.set(now - PRESET_SPAN[preset]);
    }
    this.reload();
  }

  private reload(): void {
    const spaceId = this.account.space().id;
    const serviceId = this.id();
    if (!spaceId || !serviceId) {
      return;
    }
    const from = this.from();
    const to = this.to();
    // 表格要看到全部字段（含只能显示、画不出来的字符串字段），曲线图只要画得出来的
    const chart = this.view() === 'chart';
    const refs = chart ? this.chartRefs() : this.fields();
    const maxPoints = chart ? CHART_MAX_POINTS : TABLE_MAX_POINTS;

    this.loading.set(true);
    this.loadCurrent(spaceId, serviceId);
    this.loadFailures(spaceId, serviceId, from, to);

    if (refs.length === 0) {
      this.data.set([]);
      this.loading.set(false);
      return;
    }
    // 一个字段一个请求，逐个兜错：某个字段取不到（窗口过密、后端拒绝）不该拖垮整页
    forkJoin(
      refs.map((ref) =>
        this.modbus
          .getHistoryRange(spaceId, serviceId, ref.functionIndex, ref.field, from, to, maxPoints)
          .pipe(
            map((range): FieldData => ({ ref, range })),
            catchError((e) => of<FieldData>({ ref, error: e?.message ?? String(e) })),
          ),
      ),
    ).subscribe((results) => {
      this.data.set(results);
      this.loading.set(false);
    });
  }

  /** 当前值快照（只喂页头那两格：采集到的方法数、最后采集时刻），取不到就不显示 */
  private loadCurrent(spaceId: string, serviceId: string): void {
    this.modbus.getHistoryCurrent(spaceId, serviceId).subscribe({
      next: (current) => this.current.set(current),
      error: () => {},
    });
  }

  private loadFailures(spaceId: string, serviceId: string, from: number, to: number): void {
    const functionIndex = this.functionIndex() > 0 ? this.functionIndex() : null;
    this.modbus
      .getHistoryFailures(spaceId, serviceId, from, to, functionIndex, FAILURE_LIMIT)
      .subscribe({
        next: (failures) => {
          this.failures.set(failures);
          this.failuresError.set('');
        },
        error: (e) => {
          this.failures.set(undefined);
          this.failuresError.set(e?.message ?? String(e));
        },
      });
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
    this.load();
  }

  protected onCustomRangeChange(range: Date[] | null): void {
    this.customRange.set(range ?? []);
    if (this.preset() === 'custom' && range?.length === 2 && range[0] && range[1]) {
      this.resetPages();
      this.load();
    }
  }

  protected onFunctionChange(functionIndex: number): void {
    this.functionIndex.set(functionIndex);
    this.resetChartFields();
    this.resetPages();
    this.reload();
  }

  protected onViewChange(view: HistoryView): void {
    this.view.set(view);
    this.resetPages();
    // 两种形式取的字段集与 maxPoints 都不同，换过去要重取一次
    this.reload();
  }

  protected onChartFieldsChange(keys: string[]): void {
    this.chartFields.set(keys);
    this.reload();
  }

  /** 默认勾选排在前面的若干个数值字段（不勾满：字段多时先给几张图看个大概） */
  private resetChartFields(): void {
    this.chartFields.set(
      this.numericFields()
        .slice(0, DEFAULT_CHART_FIELDS)
        .map((ref) => ref.key),
    );
  }

  private resetPages(): void {
    this.pageIndex.set(1);
    this.failurePageIndex.set(1);
  }

  /* ----------------------------------------------------------------------------------------------
   * 展示文案
   * ----------------------------------------------------------------------------------------------*/

  protected functionLabel(func: ModbusServiceFunction): string {
    return `#${func.index} ${func.name ?? ''}`.trim();
  }

  protected fieldLabel(ref: FieldRef): string {
    const unit = ref.unit ? ` (${ref.unit})` : '';
    return this.functionIndex() === ref.functionIndex
      ? `${ref.field}${unit}`
      : `#${ref.functionIndex} ${ref.field}${unit}`;
  }

  /**
   * 失败类型标签：枚举名翻成当前语言、缀上远端码（见 {@link modbusFailureLabel}）——
   * 只有从站异常应答那个码是 Modbus 异常码，其余原样给号。
   * 枚举名本身另有出处（表格里以小字附在标签后、汇总标签上给 title），排查时能直接拿去搜日志。
   */
  protected failureType(item: { type?: string; remoteCode?: number }): string {
    return this.failureLabel(item.type, item.remoteCode);
  }

  /** 单个类型的标签（汇总标签用，没有远端码） */
  protected failureLabel(type?: string, remoteCode?: number): string {
    // 语言变化信号：instant 本身不响应式，读一下它才能让模板在切换语言时重算
    this.langChange();
    return modbusFailureLabel(type, remoteCode, (key) => this.i18n.translate.instant(key));
  }
}

/** 缓存键：字段名在方法之间可能重名，故带上方法序号 */
function refKey(functionIndex: number, field: string): string {
  return `${functionIndex}#${field}`;
}

/** 应答字段 → 可取数的字段；数值判定见 {@link fieldRef} 里的说明 */
function fieldRef(func: ModbusServiceFunction, field: ModbusServiceField, step: boolean): FieldRef {
  return {
    key: refKey(func.index, field.field),
    functionIndex: func.index,
    functionName: func.name,
    field: field.field,
    unit: field.unit ?? '',
    step,
    // 取值表命中时字段值直接是描述串（不再缩放），画不成曲线；string 同理
    numeric: field.format !== 'string' && (field.valueList ?? []).length === 0,
  };
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
