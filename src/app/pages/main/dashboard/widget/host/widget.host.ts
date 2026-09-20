import { Component, computed, inject, input } from '@angular/core';
import { NzCardModule } from 'ng-zorro-antd/card';
import { TranslatePipe } from '@ngx-translate/core';
import { MainI18nService } from '@app/service/i18n.service';
import { ModbusConfig } from '../../../../../typedef/define/modbus/Modbus';
import {
  DASHBOARD_WIDGET_TITLES,
  WebDashboardWidget,
  titleOf,
} from '../../../../../typedef/define/dashboard/WebDashboardLayout';
import { WebDashboardWidgetDataItem } from '../../../../../typedef/define/dashboard/WebDashboardWidgetData';
import { DistributionWidgetComponent } from '../distribution/distribution.widget';
import { DeviceWidgetComponent } from '../device/device.widget';
import { LineWidgetComponent } from '../line/line.widget';
import { WidgetNoteComponent } from '../note/widget.note';
import { ServiceWidgetComponent } from '../service/service.widget';
import { StatWidgetComponent } from '../stat/stat.widget';

/**
 * 一张看板卡片的**分发口**：按 `type` 交给对应的卡片组件，自己不再画卡片。
 *
 * 每个类型各自拥有自己的 `<nz-card>`（版式本来就因类型而异：统计卡是无标题卡片 + `nz-statistic`，
 * 其余四种是带标题的 `small` 卡片），所以这一层只管两件事：
 * 把**卡名**算出来传下去（它同时是统计卡的 `nz-statistic` 标题与其余四种的卡头标题，
 * 各算一遍迟早会有一处忘记跟），以及兜住不认识的类型。
 *
 * 四处取舍：
 * - **预置卡片的标题是词条、用户改过的标题是数据**：`titleOf` 分得清清楚楚（`titleKey` 进翻译、
 *   `title` 原样显示），这里不再判断一次（§D8）。
 * - **外壳样式只剩一条留在这里**（`::ng-deep .ant-card-body`）：`<nz-card>` 已经搬到各类型组件里，
 *   每张卡自己的那几条（`display: flex`、高度）都在各自的 less 里；只有 `.ant-card-body` 走不了
 *   —— 它是 nz-card **内部**造出来的元素，不带任何组件的 `_ngcontent`，只能由某个祖先穿透，
 *   而宿主正好是它们共同的祖先。见 `widget.host.less`。
 * - **格子高度从这里往下传**：高度（见 `dashboard.grid` 的 `cardHeight`）由页面给到这一层，再转给四张撑满格子的卡。
 *   统计卡不要它（高度由内容定，见 `stat.widget.less`），宿主自己也不留高度 ——
 *   卡片多高这一格就多高，统计卡那一行才收得紧。
 * - **悬停浮起也往下传**（{@link hoverable}）：给的是各卡片自己的 `<nz-card>`，而不是在这一层
 *   套一个 div —— 浮起是 antd 画在 `.ant-card` 上的阴影，中间隔一层就浮不起来了。
 * - **失败态与「还没取到」由各卡片自己画**（都用 `note/` 那个组件）：放在这里集中画的话，
 *   失败时卡片会换成另一个壳（统计卡的标题就从 `nz-statistic` 里跳回卡头上去了），
 *   而「一张卡长什么样」正是各类型组件封装起来的东西。
 */
@Component({
  selector: 'dashboard-widget',
  templateUrl: './widget.host.html',
  styleUrl: './widget.host.less',
  imports: [
    NzCardModule,
    TranslatePipe,
    StatWidgetComponent,
    LineWidgetComponent,
    DistributionWidgetComponent,
    DeviceWidgetComponent,
    ServiceWidgetComponent,
    WidgetNoteComponent,
  ],
})
export class WidgetHostComponent {
  readonly widget = input.required<WebDashboardWidget>();
  /** 这张卡的取数结果。**还没有**时是 `undefined`（不是一份空数据） */
  readonly item = input<WebDashboardWidgetDataItem | undefined>(undefined);
  /** 可见点表：只有服务类型分布用得到（把 `configId` 解成「厂家 型号」） */
  readonly configs = input<ModbusConfig[]>([]);
  /** 这张卡的格子高度（像素，见 `dashboard.grid` 的 `cardHeight`）。四张撑满格子的类型用它 */
  readonly height = input.required<number>();
  /**
   * 鼠标移过时浮起（`nz-card` 的 `nzHoverable`）。
   *
   * **只有编辑态传 true**：看数据时卡片是拿来看的，浮起却点不动比不浮起更糟；而编辑态里
   * 整张卡可点（点它开配置框），浮起正是「这一整块可以点」的提示。
   */
  readonly hoverable = input(false);

  private readonly i18n = inject(MainI18nService);

  /**
   * 翻译一个词条。
   *
   * 读一次 `currentLang` 信号是为了**建立依赖**：调用它的是 `computed`，而 ngx-translate 的
   * `instant` 本身不是响应式的 —— 不读这个信号，切语言时卡头标题不会重算
   * （与 `dashboard.component.ts` 的 `t` 同一手法）。
   */
  private readonly t = (key: string, params?: Record<string, unknown>): string => {
    this.i18n.currentLang();
    return this.i18n.translate.instant(key, params);
  };

  /** 卡名。词条走翻译、用户敲的原样显示 */
  readonly title = computed(() => {
    const widget = this.widget();
    const fallback = DASHBOARD_WIDGET_TITLES[widget.type] ?? DASHBOARD_WIDGET_TITLES.stat;
    const label = titleOf(widget, fallback);
    return label.text ?? this.t(label.key ?? fallback);
  });
}
