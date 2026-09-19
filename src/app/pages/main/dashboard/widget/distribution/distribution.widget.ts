import { Component, computed, inject, input } from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { EChartsDirective } from '../../../../../common/components/echarts/echarts.directive';
import { MainI18nService } from '../../../../../service/i18n.service';
import { ModbusConfig } from '../../../../../typedef/define/modbus/Modbus';
import { WebDashboardWidget } from '../../../../../typedef/define/dashboard/WebDashboardLayout';
import {
  distributionData,
  WebDashboardWidgetDataItem,
} from '../../../../../typedef/define/dashboard/WebDashboardWidgetData';
import { readNumber, readString } from '../../dashboard.config';
import { distributionFor, truncatePoints } from '../../dashboard.folding';
import { distributionOption } from '../../dashboard.charts';
import { WidgetNoteComponent } from '../note/widget.note';
import { WidgetWindowComponent } from '../window/widget.window';

/**
 * 分布卡（`type: 'distribution'`，§5.5）：带标题的 `small` 卡片，身子是一个环形饼。
 *
 * 折算分两步，**都在这一层做完再交给 `dashboard.charts`**：
 * 1. {@link distributionFor}：按 `dimension` 把后端的 `groups` 折成 `{name, value}`
 *    —— 其中 `serviceType` 要把 `configId` 解成「厂家 型号」并合并同名、空 `configId` 归口；
 * 2. {@link truncatePoints}：「前 N + 其他」的显示层截断。
 *
 * 两步的顺序**不能反**（先截断再合并会把本该合并的两片拆到截断线两边），
 * 而「其他」那一片也不参与排序 —— 它在最后，不是因为它小。
 *
 * 两个词条由这里翻好再传进去：`dashboard.folding` 与 `dashboard.charts` 都不认识 i18n
 * （见 §7.5：图上每个字都是服务端/用户数据，只有「未定义」与「其他」这两片是我们自己写的）。
 */
@Component({
  selector: 'dashboard-distribution',
  templateUrl: './distribution.widget.html',
  styleUrl: './distribution.widget.less',
  imports: [NzCardModule, EChartsDirective, NzEmptyModule, WidgetNoteComponent, WidgetWindowComponent],
})
export class DistributionWidgetComponent {
  readonly widget = input.required<WebDashboardWidget>();
  /** 这张卡的取数结果。**还没有**时是 `undefined`（不是一份空结果） */
  readonly item = input<WebDashboardWidgetDataItem | undefined>(undefined);
  /** 卡名。由宿主算好传下来（见 `host/widget.host.ts`） */
  readonly title = input.required<string>();
  /** 悬停浮起（`nz-card` 的 `nzHoverable`）。**只有编辑态为真** —— 见 `host/widget.host.ts` */
  readonly hoverable = input(false);
  /** 可见点表：`serviceType` 维度把 `configId` 解成显示名要用（与服务清单页同一个函数） */
  readonly configs = input<ModbusConfig[]>([]);
  /** 格子高度（像素，见 `dashboard.grid` 的 `cardHeight`）。饼必须有确定高度的盒子，而高度由档位给 */
  readonly height = input.required<number>();

  private readonly i18n = inject(MainI18nService);

  /** 翻译一个词条（读 currentLang 建立依赖，切语言时重算；见 `host/widget.host.ts`） */
  private readonly t = (key: string): string => {
    this.i18n.currentLang();
    return this.i18n.translate.instant(key);
  };

  private readonly config = computed(() => this.widget().config ?? {});

  /** 折好、截好、可以直接画的片。空数组 = 没有片，卡片走空态 */
  readonly points = computed(() => {
    const item = this.item();
    // 失败与「还没取到」都没有片可折：失败时后端给的是空 `data`，折出来必然是空的
    if (!item?.success) {
      return [];
    }
    const config = this.config();
    const all = distributionFor(
      readString(config, 'dimension'),
      distributionData(item),
      this.configs(),
      this.t('未定义'),
    );
    return truncatePoints(all, readNumber(config, 'limit'), this.t('其他'));
  });

  /** `null` = 没有片可画，卡片走空态（一张空饼画出来是一片空白，不如明说没有数据） */
  readonly option = computed<EChartsCoreOption | null>(() =>
    this.points().length > 0 ? distributionOption(this.points()) : null,
  );
}
