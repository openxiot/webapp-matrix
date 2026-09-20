import { Component, computed, inject, input } from '@angular/core';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconDirective } from 'ng-zorro-antd/icon';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzTooltipDirective } from 'ng-zorro-antd/tooltip';
import { MainI18nService } from '@app/service/i18n.service';
import { dashboardMetricUnit, WebDashboardWidget } from '../../../../../typedef/define/dashboard/WebDashboardLayout';
import { statData, StatData, WebDashboardWidgetDataItem } from '../../../../../typedef/define/dashboard/WebDashboardWidgetData';
import { readString } from '../../dashboard.config';
import { metricValue } from '../../dashboard.folding';
import { WidgetWindowComponent } from '../window/widget.window';

/**
 * 统计卡（`type: 'stat'`，§5.3）：一个大数字。
 *
 * **它是唯一一张无卡头的卡**：卡名与窗口都落在 `nz-statistic` 自己的标题行里
 * （`nzTitle` 收 `TemplateRef`），所以外面那张 `<nz-card>` 不带 `nzTitle` ——
 * 两边都给的话卡名会印两遍。`nzSize` 仍是 `small`：那影响的是身子的留白，
 * 五张卡片留白一致才像同一套东西。
 *
 * 两条口径：
 * - **`metricValue` 说没有就是没有**：它给 `undefined` 时卡片显示 `-`，而不是 `0` ——
 *   `alarms.today` 折不出来（后端没给窗口）时显示「今日告警 0」是个彻头彻尾的假数字，
 *   而 `0` 本身是有效读数（项目里今天真有 0 条告警），两者必须分得开。
 * - **单位由 metric 决定，不由卡片标题决定**：用户可以把标题改成「东区设备」，
 *   但 metric 还是 `devices.total`，后缀仍是「台」。单位表见 `DASHBOARD_METRICS`。
 *
 * `item` 是**可选**的（别的类型都是必填）：统计卡的身子即使还没取到数也要画 ——
 * 卡名与窗口就在身子里，整张卡空着的话，这一格就成了一个没有名字的白块。
 * 数字那时是 `-`；**取数失败**时 `-` 旁边多一个图标，悬停是服务端的原话（见 {@link errorText}）。
 *
 * **它是五张卡里唯一不收 `height` 输入的**：另外四张撑满格子（图 / 列表必须有确定高度的盒子），
 * 统计卡**一个高度值都不给** —— 卡片就是 `<nz-card>` 包一个 `<nz-statistic>` 的缺省高度，
 * 行高跟着卡片走（见 `stat.widget.less` 与 `dashboard.component.html`）。
 */
@Component({
  selector: 'dashboard-stat',
  templateUrl: './stat.widget.html',
  styleUrl: './stat.widget.less',
  imports: [NzCardModule, NzStatisticModule, WidgetWindowComponent, NzIconDirective, NzTooltipDirective],
})
export class StatWidgetComponent {
  readonly widget = input.required<WebDashboardWidget>();
  /** 这张卡的取数结果。**还没有**时是 `undefined`（不是一份空数据） */
  readonly item = input<WebDashboardWidgetDataItem | undefined>(undefined);
  /** 卡名。由宿主算好传下来（它同时是别的类型的卡头标题，各算一遍迟早会有一处忘记跟） */
  readonly title = input.required<string>();
  /** 悬停浮起（`nz-card` 的 `nzHoverable`）。**只有编辑态为真** —— 见 `host/widget.host.ts` */
  readonly hoverable = input(false);

  private readonly i18n = inject(MainI18nService);

  /** 翻译一个词条（读 currentLang 建立依赖，切语言时重算；见 `host/widget.host.ts`） */
  private readonly t = (key: string): string => {
    this.i18n.currentLang();
    return this.i18n.translate.instant(key);
  };

  private readonly config = computed(() => this.widget().config ?? {});

  /** 取数结果。**没取到时给一份空数据**：下面每个读数自己会落到 `-`，不必各自判一次空 */
  private readonly data = computed<StatData>(() => {
    const item = this.item();
    return item ? statData(item) : new StatData();
  });

  private readonly metric = computed(() => readString(this.config(), 'metric'));

  /** 主数字。`null` → 卡片显示 `-`（见类注释） */
  readonly value = computed(() => metricValue(this.metric(), this.data()) ?? null);

  /**
   * 交给 `nz-statistic` 的主数字。
   *
   * 取数失败时**必须是 `-` 而不是上一次的读数**：失败的那一份 `data` 是空的，
   * `metricValue` 自然会落到 `null`，这里只是把它连同「还没取到」一起写成 `-`，
   * 因为 `nz-statistic` 内部是 `String(nzValue)` —— 把 `null` 递进去卡片上会印出「null」。
   */
  readonly valueText = computed(() => (this.item()?.success ? (this.value() ?? '-') : '-'));

  readonly unit = computed(() => dashboardMetricUnit(this.metric(), this.t));

  /**
   * 标题行右端那个图标要说的话；**空串表示不显示图标**。
   *
   * 只有失败时有话可说。**还没取到不算失败**（首屏那几百毫秒、两次自动刷新之间），
   * 成功时也没有可说的 —— 图标常驻的话，人会以为每张卡都有话要说。
   *
   * 那句话是**服务端原文**（`WebDashboardWidgetDataItem.message`），按 AGENTS 原样显示、不翻译：
   * 它分得清「这个组合还没做」与「配置错了」（见后端 `WidgetDataService.unsupportedDetail`），
   * 翻译它反而会把这两句抹成一句没有信息量的话。服务端一定会给 `message`，
   * 真没有时退回词典里那句「取数失败」（与 `widget.note` 同一个词条），不能给一个空 tooltip。
   */
  readonly errorText = computed(() => {
    const item = this.item();
    return item && !item.success ? item.message || this.t('取数失败') : '';
  });
}
