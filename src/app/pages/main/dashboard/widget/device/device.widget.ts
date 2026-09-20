import { Component, computed, effect, inject, input } from '@angular/core';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconDirective } from 'ng-zorro-antd/icon';
import { NzTooltipDirective } from 'ng-zorro-antd/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { DeviceSpecService } from '@app/service/device.spec.service';
import { WebDashboardWidget } from '@app/typedef/define/dashboard/WebDashboardLayout';
import {
  DeviceData,
  WebDashboardWidgetDataItem,
  deviceData,
} from '@app/typedef/define/dashboard/WebDashboardWidgetData';
import { readString } from '../../dashboard.config';
import { WidgetNoteComponent } from '../note/widget.note';
import { DeviceCardState, deviceLine, deviceState } from './device.state';

/**
 * 设备卡（`type: 'device'`，§5.6）：一行 `属性名: 数值 单位`。
 *
 * **一张卡只看一个属性**（`config.did` + `config.pid`）：设备卡要回答的是「这台设备的这个数
 * 现在是多少」，一个格子里放一整台设备的全部属性，读数就没人看得过来了。
 *
 * 三处刻意的取舍：
 * - **名字与单位来自产品规格**（{@link DeviceSpecService}），规格里查不到就显示 pid 原文、
 *   不带单位 —— 空白看不出是「配置错了」还是「没数据」（见 `device.state.ts`）；
 * - **没有「尚未上报」这一态**：见 `DeviceCardState` 的说明；
 * - **不显示时间**：设备影子不给上报时刻，而拿 render 的 `asOf` 冒充更新时刻是编数据
 *   （服务卡有时间，是因为服务的影子带 `recordedAt`）。
 *
 * 读取失败时卡头右端出一个失败标识（tooltip 是服务端原文），形状与服务卡一致：
 * 那时读数仍是 `-`，图标说明的是「不是这台设备没上报，是这一次读失败了」。
 */
@Component({
  selector: 'dashboard-device',
  templateUrl: './device.widget.html',
  styleUrl: './device.widget.less',
  imports: [
    NzCardModule,
    NzIconDirective,
    NzTooltipDirective,
    TranslatePipe,
    WidgetNoteComponent,
  ],
})
export class DeviceWidgetComponent {
  readonly widget = input.required<WebDashboardWidget>();
  /** 这张卡的取数结果。**还没有**时是 `undefined`（不是一份空结果） */
  readonly item = input<WebDashboardWidgetDataItem | undefined>(undefined);
  /** 卡名。由宿主算好传下来（见 `host/widget.host.ts`） */
  readonly title = input.required<string>();
  /** 悬停浮起（`nz-card` 的 `nzHoverable`）。**只有编辑态为真** —— 见 `host/widget.host.ts` */
  readonly hoverable = input(false);
  /** 格子高度（像素，见 `dashboard.grid` 的 `cardHeight`）。与服务卡同一个确定高度的盒子 */
  readonly height = input.required<number>();

  private readonly specs = inject(DeviceSpecService);

  private readonly config = computed(() => this.widget().config ?? {});

  /** 取数结果。**没取到时给一份空数据**：下面的行渲染自己会落到 `-`，不必各自判一次空 */
  private readonly data = computed<DeviceData>(() => {
    const item = this.item();
    return item ? deviceData(item) : new DeviceData();
  });

  readonly state = computed(() => deviceState(this.item()));

  /** 这台设备的 did（配置里那一份）。切 pid 的后两段要用它，见 `DeviceSpecService.propertyOf` */
  private readonly did = computed(() => readString(this.config(), 'did') ?? '');

  /** 那一行 `属性名: 值 单位` */
  readonly line = computed(() => {
    const data = this.data();
    const property = this.specs.propertyOf(data.type, this.did(), data.pid);
    return deviceLine(data, property, this.config());
  });

  /**
   * 卡头右端那个失败标识要说的话；**空串表示不显示图标**。
   *
   * 服务端原文（英文），原样显示、不翻译 —— 与其余接口的 `message` 同口径。
   */
  readonly errorText = computed(() => (this.state() === 'failed' ? '' : this.data().error ?? ''));

  constructor() {
    // 型号到了就去取产品规格（幂等，同型号只发一次请求）。**副作用放在 effect 里、不在
    // computed 里**：computed 可能被重算任意多次，而它不该发请求
    effect(() => {
      const type = this.data().type;
      if (type) {
        this.specs.load(type);
      }
    });
  }
}
