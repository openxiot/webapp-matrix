import { Component, computed, inject, input } from '@angular/core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { MainI18nService } from '../../../../../service/i18n.service';
import { WidgetDataItem } from '../../../../../typedef/define/dashboard/DashboardWidgetData';

/**
 * 卡片身子里那一句「这张卡现在没有东西可读」。
 *
 * 三态各有各的样子，**揉成一句「没有数据」就丢掉了唯一的线索**：
 * - **还没取到**（`item` 是 `undefined`，首屏那几百毫秒、以及两次自动刷新之间）：整段不渲染，
 *   卡片留白。画一个「0」会被当成真读数 —— 而这正是最容易截图发出去的那一瞬间。
 * - **取数失败**（`success: false`）：显示**服务端那句话**。它分得清「这个组合还没做」与
 *   「配置错了」（见后端 `WidgetDataService.unsupportedDetail`），翻译它反而会把这两句
 *   抹成一句没有信息量的话。
 * - **成功**：整段不渲染，身子里是真空的那一块（曲线图画不出点、饼图没有片这类空态由各卡片
 *   自己处理，它们比这里更清楚该说什么）。
 *
 * `message` 是给宿主用的逃生口：后端说成功了、前端却不认识这个 `type` 时（P2 之后加了新类型
 * 而前端没跟上），没有 `item` 里的那句话可显示，那就明说一句「开发中」。
 */
@Component({
  selector: 'dashboard-widget-note',
  templateUrl: './widget.note.html',
  styleUrl: './widget.note.less',
  imports: [NzIconModule],
})
export class WidgetNoteComponent {
  /** 这张卡的取数结果。**还没取到**时是 `undefined`（不是一份空结果） */
  readonly item = input<WidgetDataItem | undefined>(undefined);

  /** 明说的一句话。给了就不再看 {@link item} */
  readonly message = input('');

  private readonly i18n = inject(MainI18nService);

  /** 翻译一个词条（读 currentLang 建立依赖，切语言时重算；见 `host/widget.host.ts`） */
  private readonly t = (key: string): string => {
    this.i18n.currentLang();
    return this.i18n.translate.instant(key);
  };

  /** 要显示的那句话；空串表示这一段整个不渲染 */
  readonly text = computed(() => {
    const explicit = this.message();
    if (explicit) {
      return explicit;
    }
    const item = this.item();
    // `取数失败` 是兜底：后端一定会给 `message`，真没有时也得有一句话，不能留一张白卡
    return item && !item.success ? item.message || this.t('取数失败') : '';
  });
}
