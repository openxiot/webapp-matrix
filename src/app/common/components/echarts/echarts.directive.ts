import {Directive, ElementRef, Input, OnChanges, OnDestroy, OnInit, inject} from '@angular/core';
import {init, use, type EChartsCoreOption, type EChartsType} from 'echarts/core';
import {LineChart, PieChart} from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';

// 按需注册图表/组件，避免打包完整 echarts（体积更小）。
// MarkLine 是采集历史页画「失败时刻竖线」用的，其余页面用不到也不会因此变大。
use([
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
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
    // 首次渲染时容器可能尚未完成布局（clientWidth/clientHeight 为 0），
    // 此时 init 会触发 ECharts "Can't get DOM width or height" 警告；
    // 统一由 ResizeObserver 在容器具备非零尺寸后再创建图表，顺带避免 0 尺寸闪帧。
    this.resizeObserver = new ResizeObserver(() => {
      if (this.chart) {
        this.chart.resize();
      } else {
        this.initChart();
      }
    });
    this.resizeObserver.observe(this.host);
    this.initChart();
  }

  ngOnChanges() {
    // 首次绑定先于 ngOnInit，此时 chart 尚未创建，由 initChart 兜底渲染
    this.setOption();
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
    this.chart = undefined;
  }

  /** 仅在容器具备非零尺寸时创建图表，避免 ECharts 0 尺寸警告 */
  private initChart() {
    if (this.chart || this.host.clientWidth === 0 || this.host.clientHeight === 0) {
      return;
    }
    this.chart = init(this.host);
    this.setOption();
  }

  private setOption() {
    if (this.chart && this.appEcharts) {
      this.chart.setOption(this.appEcharts);
    }
  }
}
