import {Directive, ElementRef, Input, OnChanges, OnDestroy, OnInit, inject} from '@angular/core';
import {init, use, type EChartsCoreOption, type EChartsType} from 'echarts/core';
import {LineChart, PieChart} from 'echarts/charts';
import {GridComponent, LegendComponent, TitleComponent, TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';

// 按需注册图表/组件，避免打包完整 echarts（体积更小）
use([
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
]);

/**
 * 轻量 echarts 包装指令（zoneless 兼容）：
 *   <div appEcharts [appEcharts]="option()" class="chart"></div>
 *
 * - @Input appEcharts 变化时自动 setOption 刷新
 * - 用 ResizeObserver 跟随宿主尺寸自适应，不依赖 zone 的 resize 事件
 * - 销毁时 dispose，避免内存泄漏
 */
@Directive({
  selector: '[appEcharts]',
  standalone: true,
})
export class EChartsDirective implements OnInit, OnChanges, OnDestroy {
  @Input() appEcharts: EChartsCoreOption | null = null;

  private readonly host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  private chart?: EChartsType;
  private resizeObserver?: ResizeObserver;

  ngOnInit() {
    this.chart = init(this.host);
    this.setOption();
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(this.host);
  }

  ngOnChanges() {
    // 首次绑定先于 ngOnInit，此时 chart 尚未创建，由 ngOnInit 兜底渲染
    this.setOption();
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
    this.chart = undefined;
  }

  private setOption() {
    if (this.chart && this.appEcharts) {
      this.chart.setOption(this.appEcharts);
    }
  }
}
