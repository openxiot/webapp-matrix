import { Component, computed, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconDirective } from 'ng-zorro-antd/icon';
import { NzTooltipDirective } from 'ng-zorro-antd/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { MainI18nService } from '../../../../../service/i18n.service';
import { DashboardWidget } from '../../../../../typedef/define/dashboard/DashboardLayout';
import {
  ServiceData,
  WidgetDataItem,
  serviceData,
} from '../../../../../typedef/define/dashboard/DashboardWidgetData';
import { WidgetNoteComponent } from '../note/widget.note';
import { WidgetWindowComponent } from '../window/widget.window';
import { serviceLines, serviceState } from './service.state';

/**
 * 服务卡（`type: 'service'`，§5.7）：一行一个 `字段: 数值 单位`，底下一行采集时刻。
 *
 * 三态（见 {@link serviceState}）各有各的样子，**揉成一句「没有数据」就丢掉了唯一的线索**：
 * - **尚未采集**（这个方法还没有影子）：`尚未采集`。它**必须走 `[message]` 而不是只传 `[item]`**
 *   —— 这一态 `success` 是 `true`（这张卡确实取到了数，只是这个点位没有值），只传 `[item]`
 *   的话 `home-widget-note` 整段不渲染，卡片会是一张白卡。
 * - **这台卡的取数失败**：服务端那句话（`[item]`），与其余四种卡同一个口径。
 * - **正常**：一行行读数 + 采集时刻。
 *
 * 两处刻意的取舍：
 * - **不判「陈旧」**：不设陈旧阈值（用户明确选了「不判」），该态并入正常态。卡片就两句话要说
 *   —— 尚未采集 / 采集失败 —— 外加一行「采集时间」表明读数的新鲜度，由人自己看。
 * - **失败不清空读数**：`lastError` 与值是**并存**的（影子里的值是最后一次**成功**的采集，
 *   失败时服务端不动它），所以失败时卡片显示的是「最后一次已知读数 + 采集时间 + 一个失败标识」。
 *   把值一并撤掉，看板就少了一个它本来答得上来的问题。
 *
 * 采集时刻属于**整个 method**（同一张卡的字段必须来自同一个方法），所以时间只有一行、在底部。
 */
@Component({
  selector: 'home-service',
  templateUrl: './service.widget.html',
  styleUrl: './service.widget.less',
  imports: [
    DatePipe,
    NzCardModule,
    NzIconDirective,
    NzTooltipDirective,
    TranslatePipe,
    WidgetNoteComponent,
    WidgetWindowComponent,
  ],
})
export class ServiceWidgetComponent {
  readonly widget = input.required<DashboardWidget>();
  /** 这张卡的取数结果。**还没有**时是 `undefined`（不是一份空结果） */
  readonly item = input<WidgetDataItem | undefined>(undefined);
  /** 卡名。由宿主算好传下来（见 `host/widget.host.ts`） */
  readonly title = input.required<string>();
  /** 悬停浮起（`nz-card` 的 `nzHoverable`）。**只有编辑态为真** —— 见 `host/widget.host.ts` */
  readonly hoverable = input(false);
  /** 格子高度（像素，`h × 38 + (h−1) × 16`）。它是列表滚动区那个确定高度的盒子 */
  readonly height = input.required<number>();

  private readonly i18n = inject(MainI18nService);

  /** 翻译一个词条（读 currentLang 建立依赖，切语言时重算；见 `host/widget.host.ts`） */
  private readonly t = (key: string): string => {
    this.i18n.currentLang();
    return this.i18n.translate.instant(key);
  };

  private readonly config = computed(() => this.widget().config ?? {});

  /** 取数结果。**没取到时给一份空数据**：下面的行渲染自己会落到 `-`，不必各自判一次空 */
  private readonly data = computed<ServiceData>(() => {
    const item = this.item();
    return item ? serviceData(item) : new ServiceData();
  });

  readonly state = computed(() => serviceState(this.item(), this.data()));

  /** 一行行 `字段: 值 单位`（顺序由服务端按配置顺序给，见 `service.state.ts`） */
  readonly lines = computed(() => serviceLines(this.data(), this.config(), this.t));

  /** 最后一次成功采集的时刻（毫秒）。没有时那一行显示 `-` —— 「采过但没成功过」也是要说的 */
  readonly recordedAt = computed(() => this.data().recordedAt);

  /**
   * 卡头右端那个失败标识要说的话；**空串表示不显示图标**。
   *
   * 它说的是**这个方法的最后一次采集失败**（服务端 `lastError` 原文，按 AGENTS 原样显示、
   * 不翻译），与「这张卡的取数失败」是两件事 —— 后者由 `home-widget-note` 整段说话，
   * 这里便不再重复一个图标。
   *
   * 值还在的时候这个图标尤其重要：卡片看着是正常的（有读数、有采集时间），
   * 只有它能说明「这些数是几分钟前的，从那以后就没再更新过」。
   */
  readonly errorText = computed(() => {
    if (this.state() === 'failed') {
      return '';
    }
    return this.data().error ?? '';
  });
}
