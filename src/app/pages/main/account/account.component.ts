import { Component, OnInit } from '@angular/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { AccountService } from '../../../service/account.service';
import { MatrixService } from '../../../service/matrix.service';
import { BreadcrumbTranslateDirective } from '../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { MainI18nService } from '../../../service/i18n.service';
import { NzColDirective, NzRowDirective } from 'ng-zorro-antd/grid';
import { NzInputModule, NzInputSearchEvent } from 'ng-zorro-antd/input';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'main-account',
  standalone: true,
  templateUrl: './account.component.html',
  styleUrl: './account.component.less',
  imports: [
    NzPageHeaderModule,
    NzBreadCrumbModule,
    BreadcrumbTranslateDirective,
    NzSpinModule,
    NzCardModule,
    NzTabsModule,
    NzDescriptionsModule,
    NzAvatarModule,
    NzIconModule,
    TranslatePipe,
    NzColDirective,
    NzRowDirective,
    NzInputModule,
    FormsModule,
  ],
})
export class AccountComponent implements OnInit {
  constructor(
    public account: AccountService,
    private service: MatrixService,
    private msg: NzMessageService,
    private i18n: MainI18nService,
  ) {}

  ngOnInit() {}

  /** 拷贝输入框内容（用户 ID）到系统剪贴板 */
  protected async onCopy($event: NzInputSearchEvent) {
    const copied = await this.copyToClipboard($event.value);
    if (copied) {
      this.msg.success(this.i18n.translate.instant('复制成功'));
    } else {
      this.msg.warning(this.i18n.translate.instant('复制失败'));
    }
  }

  /** 优先 navigator.clipboard，失败（权限拒绝/非安全上下文）时回退 textarea + execCommand */
  private async copyToClipboard(text: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // 继续尝试兜底方案
      }
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
