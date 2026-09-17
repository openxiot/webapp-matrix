import { Component, computed, input } from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { TranslatePipe } from '@ngx-translate/core';
import { EChartsDirective } from '../../../../../common/components/echarts/echarts.directive';
import { DashboardWidget } from '../../../../../typedef/define/dashboard/DashboardLayout';
import { lineData, WidgetDataItem } from '../../../../../typedef/define/dashboard/DashboardWidgetData';
import { historyFieldOption } from '../../../device/services/service/history/device.service.history.charts';
import { alarmCurveOption } from '../../home.charts';
import { readBoolean, readString } from '../../home.config';
import { WidgetNoteComponent } from '../note/widget.note';
import { WidgetWindowComponent } from '../window/widget.window';
import {
  ServiceFieldData,
  hasDrawablePoints,
  hasNoPoints,
  serviceFieldContext,
  serviceFieldData,
  serviceFieldSeries,
} from './line.series';

/**
 * 曲线卡（`type: 'line'`，§5.4）：带标题的 `small` 卡片，身子整块交给 ECharts。
 *
 * 两种数据源，`config.source` 分叉：
 * - `alarmCount`（缺省）：窗口内每小时的告警条数，复用 `overview.alarms.hourly`
 *   （{@link alarmCurveOption}）。后端对窗口内的整点做密集零填充，没发生告警的整点是 `0`
 *   且在数组里 —— 所以这里不需要「窗口内一段没有数据」的虚线或断点处理，直接连线即可，
 *   前端去猜「这段是没告警还是没数据」只会猜错。
 * - `serviceField`：一个 Modbus 字段在窗口内的曲线，复用历史页的 {@link historyFieldOption}
 *   （见 `line.series.ts`：画法只有一份实现，看板这边只做形状转换）。
 *
 * **空态分两句**（`serviceField` 那一支；`alarmCount` 的点是零填充的，不会「一个点都没有」）：
 * 一个点都没有 → `尚未采集`；有样本但整条线都是断点（非数值字段）→ ng-zorro 自己的
 * `nz-empty`（不另造词条）。
 *
 * `option` 用 `computed`（不是 getter）：option 构造每次都产出一个新对象，而指令是
 * `ngOnChanges` 上无条件 `setOption` 的 —— 用 getter 会让每次变更检测都重画一次图。
 */
@Component({
  selector: 'home-line',
  templateUrl: './line.widget.html',
  styleUrl: './line.widget.less',
  imports: [
    NzCardModule,
    NzEmptyModule,
    TranslatePipe,
    EChartsDirective,
    WidgetNoteComponent,
    WidgetWindowComponent,
  ],
})
export class LineWidgetComponent {
  readonly widget = input.required<DashboardWidget>();
  /** 这张卡的取数结果。**还没有**时是 `undefined`（不是一份空结果） */
  readonly item = input<WidgetDataItem | undefined>(undefined);
  /** 卡名。由宿主算好传下来（见 `host/widget.host.ts`） */
  readonly title = input.required<string>();
  /** 悬停浮起（`nz-card` 的 `nzHoverable`）。**只有编辑态为真** —— 见 `host/widget.host.ts` */
  readonly hoverable = input(false);
  /** 格子高度（像素，`h × 38 + (h−1) × 16`）。图必须有确定高度的盒子，而高度由档位给 */
  readonly height = input.required<number>();

  private readonly config = computed(() => this.widget().config ?? {});

  /** 数据源。缺省是告警条数（老配置里没有这个键，那时的曲线卡就是它） */
  private readonly source = computed(() => readString(this.config(), 'source') ?? 'alarmCount');

  /**
   * 字段曲线的 data；**不是那一支、还没取到、或取数失败**时是 null。
   *
   * 一个 `computed` 供下面两处读（画图与空态），而不是各自解一遍 data：同一份响应体解两次，
   * 两处对「什么算一个点」的判断迟早会走岔。
   */
  private readonly serviceField = computed<ServiceFieldData | null>(() => {
    const item = this.item();
    return this.source() === 'serviceField' && item?.success ? serviceFieldData(item) : null;
  });

  /** `null` = 没有东西可画，卡片走空态 */
  readonly option = computed<EChartsCoreOption | null>(() => {
    const item = this.item();
    // 失败与「还没取到」都走空态：模板那时画的是失败提示，这里不该先把图算出来（算了也没人用）
    if (!item?.success) {
      return null;
    }
    const data = this.serviceField();
    if (data) {
      // 有样本也未必画得出来：非数值字段（取值表命中的字符串）整条线都是断点，
      // 那种图是一个空坐标系，比一句「暂无数据」更让人以为图坏了
      return hasDrawablePoints(data.range)
        ? historyFieldOption(
            serviceFieldSeries(
              data,
              readString(this.config(), 'field') ?? '',
              // 缺省画：竖线是这张卡少有的「什么时候出过问题」的线索，不画没人知道有这一项
              readBoolean(this.config(), 'showFailureShadow', true),
            ),
            serviceFieldContext(data),
          )
        : null;
    }
    const points = lineData(item).points;
    return points.length > 0 ? alarmCurveOption(points) : null;
  });

  /**
   * 画不出图时那句提示的**词条键**；空串 = 走 ng-zorro 的空态。
   *
   * 只对字段曲线那一支有「一个点都没有」这一态：告警曲线的点由后端零填充，窗口里每个整点
   * 都在数组里，画不出来只可能是别的原因。
   */
  readonly emptyMessageKey = computed(() => {
    const data = this.serviceField();
    return data && hasNoPoints(data.range) ? '尚未采集' : '';
  });
}
