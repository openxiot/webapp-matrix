import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzModalModule } from 'ng-zorro-antd/modal';
import {
  DASHBOARD_EDITABLE_TYPES,
  DASHBOARD_WIDGET_TITLES,
  WidgetType,
} from '../../../../typedef/define/dashboard/WebDashboardLayout';

/**
 * 卡片类型选择框（工具条那个「添加卡片」）。
 *
 * 三条：
 * - **只负责选类型**，落点与配置都不归它管：选完 `emit` 一个类型，看板页把新卡加在末尾并紧接着
 *   开配置框（见 `dashboard.component.ts` 的 `pickWidget`）。所以这里连 `WebDashboardWidget` 都不认识。
 * - **类型清单是 {@link DASHBOARD_EDITABLE_TYPES}**，不是把 `WidgetType` 五个都列出来 ——
 *   那一份是「这个版本能新建哪几种」的唯一定义；名字复用 {@link DASHBOARD_WIDGET_TITLES}
 *   （卡片外壳没标题时用的是同一份，加了新类型不会有一处忘记补）。
 * - **每种类型只有名字，没有说明文字**：多一句话就得为它新增 66 份词典的词条，而
 *   「统计数字 / 曲线图 / 数据分布 / 设备 / 服务」五个名字本身已经说清了是什么。
 *
 * 对话框的开关由看板页持有（它才知道「正在编辑布局」这件事），这里只收 {@link nzVisible}。
 */
@Component({
  selector: 'dashboard-widget-picker',
  templateUrl: './widget.picker.html',
  styleUrl: './widget.picker.less',
  imports: [TranslatePipe, NzCardModule, NzModalModule],
})
export class WidgetPickerComponent {
  /** 对话框开着 */
  readonly nzVisible = input(false);

  /** 选定了一种类型 */
  readonly picked = output<WidgetType>();
  /** 关掉（取消 / ESC / 右上角那个叉） */
  readonly cancelled = output<void>();

  /** 可选的类型与它们的中文名（**词典键**，模板里翻译） */
  readonly types: WidgetType[] = DASHBOARD_EDITABLE_TYPES;
  readonly titles = DASHBOARD_WIDGET_TITLES;

  pick(type: WidgetType): void {
    this.picked.emit(type);
  }

  close(): void {
    this.cancelled.emit();
  }
}
