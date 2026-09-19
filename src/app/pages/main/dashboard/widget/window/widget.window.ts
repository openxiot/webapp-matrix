import { Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { WebDashboardWidget } from '../../../../../typedef/define/dashboard/WebDashboardLayout';
import { readWindow } from '../../dashboard.config';
import { windowLabel } from '../../dashboard.folding';

/**
 * 卡头右端那一段窗口：「这张卡的数字是哪段时间的」。
 *
 * 抽成独立组件是因为它**每张卡片都要**，而它落在哪儿却因卡而异 —— 带标题的卡片挂在 `nzExtra`
 * 上（与标题同一行、靠右），统计卡没有卡头、要挂进 `nz-statistic` 的标题行里（见 `stat/`）。
 * 抄五份的话，「最近 24 小时」这句文案与日期格式就有五个会各自漂移的副本。
 *
 * 窗口属于「这张卡是什么」这一层，**不落进身子**：掉到数字底下会和读数抢位置，
 * 而它说的是读数的口径，不是读数本身。
 *
 * 没配窗口（`devices.total` 这类）时整段不渲染。`windowLabel` 那边给的 `key` 是词条
 * （`最近 {{hours}} 小时`），由模板的 `translate` 管道翻成当前语言；`range` 那种给的是两个
 * 毫秒时间戳，交给 `date` 管道 —— 所以这里没有 `t()`，也就没有「切语言要重算」的问题，
 * 两个管道自己会跟着语言走。
 */
@Component({
  selector: 'dashboard-widget-window',
  templateUrl: './widget.window.html',
  styleUrl: './widget.window.less',
  imports: [DatePipe, TranslatePipe],
})
export class WidgetWindowComponent {
  readonly widget = input.required<WebDashboardWidget>();

  /**
   * 卡头右端的窗口。没配窗口时是 `undefined`，那一段整个不渲染。
   *
   * 叫 `timeWindow` 而不是 `window`：模板里的 `window` 会盖住全局那个 `window`，
   * 现在没有别的写法要用到它，但一个盖住全局对象的名字不该留在模板里。
   */
  readonly timeWindow = computed(() => windowLabel(readWindow(this.widget().config)));
}
