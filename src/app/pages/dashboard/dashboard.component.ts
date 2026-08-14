import {Component, computed, inject, signal} from '@angular/core';
import type {EChartsCoreOption} from 'echarts/core';
import {NzPageHeaderModule} from 'ng-zorro-antd/page-header';
import {NzBreadCrumbModule} from 'ng-zorro-antd/breadcrumb';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzCardModule} from 'ng-zorro-antd/card';
import {NzStatisticModule} from 'ng-zorro-antd/statistic';
import {NzIconModule} from 'ng-zorro-antd/icon';
import {NzRowDirective, NzColDirective} from 'ng-zorro-antd/grid';
import {TranslatePipe} from '@ngx-translate/core';
import {BreadcrumbTranslateDirective} from '../../common/components/breadcrumb/breadcrumb-translate.directive';
import {EChartsDirective} from '../../common/components/echarts/echarts.directive';
import {MainI18nService} from '../../service/i18n.service';
import {
  AlarmStats,
  DeviceStats,
  EnergyStats,
  mockAlarmStats,
  mockDeviceStats,
  mockEnergyStats,
} from './dashboard.mock';
import * as charts from './dashboard.charts';

@Component({
  selector: 'main-dashboard',
  standalone: true,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.less',
  imports: [
    NzPageHeaderModule,
    NzBreadCrumbModule,
    BreadcrumbTranslateDirective,
    NzSpinModule,
    NzCardModule,
    NzStatisticModule,
    NzIconModule,
    NzRowDirective,
    NzColDirective,
    EChartsDirective,
    TranslatePipe,
  ],
})
export class DashboardComponent {
  readonly i18n = inject(MainI18nService);

  private readonly now = new Date();

  /** 设备统计（mock：后台无统计接口，数据在前端伪造） */
  readonly deviceStats = signal<DeviceStats>(mockDeviceStats(this.now));
  /** 能耗统计（mock） */
  readonly energyStats = signal<EnergyStats>(mockEnergyStats(this.now));
  /** 报警统计（mock） */
  readonly alarmStats = signal<AlarmStats>(mockAlarmStats(this.now));

  /** 设备总量 */
  readonly deviceTotal = computed(() => this.deviceStats().total);
  /** 在线设备 */
  readonly onlineCount = computed(() => this.deviceStats().online);
  /** 本月能耗（kWh） */
  readonly monthEnergy = computed(() => this.energyStats().monthTotal);
  /** 今日报警 */
  readonly alarmToday = computed(() => this.alarmStats().todayCount);

  /**
   * 翻译 i18n 键。内部读取 currentLang 信号，
   * 使调用它的图表 getter 在语言切换时随视图重渲染自动重算。
   */
  private readonly t = (key: string): string => {
    this.i18n.currentLang();
    return this.i18n.translate.instant(key);
  };

  /**
   * 图表 option 用 getter 提供：内部读取 deviceStats/energyStats/alarmStats 信号，
   * zoneless 下视图渲染时读到信号即建立依赖，数据或语言变化时自动重算。
   * （模板检查器对 computed 复杂泛型的解析会退化为 string，故用 getter）
   */
  get deviceTypeOption(): EChartsCoreOption {
    return charts.deviceTypeOption(this.deviceStats(), this.t);
  }

  get energyOption(): EChartsCoreOption {
    return charts.energyOption(this.energyStats(), this.t);
  }

  get alarmTypeOption(): EChartsCoreOption {
    return charts.alarmTypeOption(this.alarmStats(), this.t);
  }

  get alarmCurveOption(): EChartsCoreOption {
    return charts.alarmCurveOption(this.alarmStats(), this.t);
  }
}
