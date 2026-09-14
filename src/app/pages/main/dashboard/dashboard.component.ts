import { Component, computed, effect, inject, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import type { EChartsCoreOption } from 'echarts/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzRowDirective, NzColDirective } from 'ng-zorro-antd/grid';
import { TranslatePipe } from '@ngx-translate/core';
import { EChartsDirective } from '../../../common/components/echarts/echarts.directive';
import { AccountService } from '../../../service/account.service';
import { MainI18nService } from '../../../service/i18n.service';
import { ModbusService } from '../../../service/modbus.service';
import { StatisticsService } from '../../../service/statistics.service';
import { ModbusConfig } from '../../../typedef/define/modbus/Modbus';
import { OverviewStatistics } from '../../../typedef/define/statistics/OverviewStatistics';
import { EnergyStats, mockEnergyStats } from './dashboard.mock';
import { alarmWindow, dayStart, sumSince } from './dashboard.functions';
import * as charts from './dashboard.charts';

/**
 * 首页（数据看板）。
 *
 * 一屏的四个数字与四张图分两处取：
 * - **真实**：设备（总量，在线数挂在同一张卡的标题行）、服务（总量 / 按点表）、
 *   告警（今日 / 近 24 小时 / 按文本）—— 全来自一次 `GET /statistics/overview`，
 *   故卡片与曲线天然同源；
 * - **伪造**：本月能耗与日能耗曲线（没有能耗采集，见 dashboard.mock.ts）。
 *
 * 响应里有三个字段目前页面上不用：`failures.total`、`failures.hourly`（故障，卡片已去掉）
 * 与 `alarms.total`（「今日告警」是从 `alarms.hourly` 里按今天 00:00 求和得来的，口径见
 * {@link todayOf}）。接口照旧下发、codec 照旧解出来 —— 这类整屏一次取回的接口，
 * 增减一张卡片不该牵动后端。
 *
 * 窗口由本页算（后端只收 from/to）：近 24 小时整点，见 {@link alarmWindow}。「今日」= 窗口内
 * 桶起点不早于本地今天 00:00 的求和 —— 窗口恒盖住今天全天，不必第二次请求。
 *
 * 取数照 modbus.component 的范式：构造器先读一次当前项目，再用 `effect` 盯着
 * `account.space()` 的变化重载（首页没有路由参数，不需要订阅 route.params）。
 */
@Component({
  selector: 'main-dashboard',
  standalone: true,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.less',
  imports: [
    NzPageHeaderModule,
    NzBreadCrumbModule,
    NzSpinModule,
    NzCardModule,
    NzStatisticModule,
    NzEmptyModule,
    NzAlertModule,
    NzIconModule,
    NzRowDirective,
    NzColDirective,
    EChartsDirective,
    TranslatePipe,
  ],
})
export class DashboardComponent {
  protected readonly account = inject(AccountService);
  readonly i18n = inject(MainI18nService);

  private readonly stats = inject(StatisticsService);
  private readonly modbus = inject(ModbusService);

  private readonly now = new Date();

  readonly loading = signal(false);
  /** 取数失败的原因；非空时整页只显示这条告警 */
  readonly error = signal('');

  /**
   * 聚合数字。**没取到时是 null，不是一份全零的默认值** —— 0 是有效读数（项目里真没有设备），
   * 拿它冒充「没数据」会让卡片信誓旦旦地报一个假数；null 在页面上是空白。
   */
  readonly overview = signal<OverviewStatistics | null>(null);

  /** 可见点表：把服务的 configId 解成「厂家 型号」，用与服务清单页同一个函数 */
  readonly configs = signal<ModbusConfig[]>([]);

  /** 能耗统计（mock，唯一还伪造的两张卡） */
  readonly energyStats = signal<EnergyStats>(mockEnergyStats(this.now));

  /** 已加载的项目 id（与 account.space() 比对，变了才重载） */
  private currentSpaceId = '';

  constructor() {
    this.currentSpaceId = this.account.space().id;
    this.load();

    // 项目信号后续变化（切换项目 / 清空）时自动刷新
    effect(() => {
      const spaceId = this.account.space().id;
      if (spaceId !== this.currentSpaceId) {
        this.currentSpaceId = spaceId;
        this.load();
      }
    });
  }

  /* ----------------------------------------------------------------------------------------------
   * 四个数字。null = 还没取到（或取失败），页面上是空白
   * ----------------------------------------------------------------------------------------------*/

  /** 设备总量（含子空间） */
  readonly deviceTotal = computed(() => this.overview()?.devices.total ?? null);
  /**
   * 在线设备（后端按 `device.online` 数）。与 {@link deviceTotal} 同出一张卡：
   * 总量是卡里的大数，在线挂在标题行右端 —— 故这里只要算数，不管摆哪儿。
   */
  readonly onlineCount = computed(() => this.overview()?.devices.online ?? null);
  /** 服务总量（含子空间） */
  readonly serviceTotal = computed(() => this.overview()?.services.total ?? null);
  /** 今日告警：本地今天 00:00 起的告警条数 */
  readonly alarmToday = computed(() => this.todayOf(this.overview()?.alarms.hourly));
  /** 本月能耗（kWh，mock） */
  readonly monthEnergy = computed(() => this.energyStats().monthTotal);

  /*
   * 值位与单位位都随「有没有数」走。
   *
   * nz-statistic 内部是 `String(nzValue)`：直接把 null / undefined 递进去，卡片上会印出
   * 面不改色的「null」「undefined」两个词；而值位空着、单位照留，又像是「0 台」掉了个 0。
   * 故两者都由这两个小函数统一成空串 —— 空白的卡片才是「还没数」该有的样子。
   */

  protected readonly statValue = (value: number | null): string =>
    value === null ? '' : `${value}`;
  protected readonly statUnit = (value: number | null, unit: string): string =>
    value === null ? '' : unit;

  /* ----------------------------------------------------------------------------------------------
   * 三张饼的空数据判定（空饼画出来是一片空白，不如明说「没有数据」）
   * 两条曲线不吃这一套：后端密集零填充，桶永远在，全 0 就是全 0
   * ----------------------------------------------------------------------------------------------*/

  readonly hasDeviceTypes = computed(() => (this.overview()?.devices.byType.length ?? 0) > 0);
  readonly hasServiceTypes = computed(() => (this.overview()?.services.byConfig.length ?? 0) > 0);
  readonly hasAlarmTypes = computed(() => (this.overview()?.alarms.byText.length ?? 0) > 0);

  /* ----------------------------------------------------------------------------------------------
   * 取数
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 一次取回整页的数：聚合接口 + 可见点表。
   *
   * 两处失败的后果不一样，故兜错也分开：聚合接口失败 = 整页没有真数据可显示，走错误态；
   * 点表清单只用于把 configId 解成显示名，取不到就退回 id（与服务清单页同口径），不该拖垮整页。
   */
  load(): void {
    const spaceId = this.currentSpaceId;
    this.error.set('');
    this.configs.set([]);

    if (!spaceId) {
      // 未选项目：模板走空态，别发一个注定 403 的请求
      this.overview.set(null);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    const { from, to } = alarmWindow(Date.now());
    forkJoin({
      overview: this.stats.overview(spaceId, from, to),
      configs: this.modbus.listVisible().pipe(catchError(() => of<ModbusConfig[]>([]))),
    }).subscribe({
      next: ({ overview, configs }) => {
        this.overview.set(overview);
        this.configs.set(configs);
        this.loading.set(false);
      },
      error: (e) => {
        this.overview.set(null);
        this.loading.set(false);
        this.error.set(e?.message ?? String(e));
      },
    });
  }

  /**
   * 「今日」：窗口内桶起点不早于本地今天 00:00 的求和。
   *
   * 基准取响应里的 `to`（实际生效的窗口终点）而不是本地 `Date.now()`：两者差几毫秒，
   * 而桶是整点的，跨零点那一瞬间用本地时间会算到「昨天」。没数据时给 null 而不是 0。
   */
  private todayOf(hourly: Parameters<typeof sumSince>[0] | undefined): number | null {
    const o = this.overview();
    if (!o || !hourly) {
      return null;
    }
    return sumSince(hourly, dayStart(o.to));
  }

  /* ----------------------------------------------------------------------------------------------
   * 图表 option
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 翻译 i18n 键。内部读取 currentLang 信号，
   * 使调用它的图表 getter 在语言切换时随视图重渲染自动重算。
   */
  private readonly t = (key: string): string => {
    this.i18n.currentLang();
    return this.i18n.translate.instant(key);
  };

  /**
   * 图表 option 用 getter 提供：内部读取 overview/energyStats/configs 信号，
   * zoneless 下视图渲染时读到信号即建立依赖，数据或语言变化时自动重算。
   * （模板检查器对 computed 复杂泛型的解析会退化为 string，故用 getter）
   */
  get deviceTypeOption(): EChartsCoreOption {
    return charts.deviceTypeOption(this.overview());
  }

  get serviceTypeOption(): EChartsCoreOption {
    return charts.serviceTypeOption(this.overview(), this.configs(), this.t('未定义'));
  }

  get alarmTypeOption(): EChartsCoreOption {
    return charts.alarmTypeOption(this.overview());
  }

  get alarmCurveOption(): EChartsCoreOption {
    return charts.alarmCurveOption(this.overview());
  }

  get energyOption(): EChartsCoreOption {
    return charts.energyOption(this.energyStats());
  }
}
