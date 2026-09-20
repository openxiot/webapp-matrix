import { Component, effect, OnInit } from '@angular/core';
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
import { AccountService } from '@app/service/account.service';
import { BreadcrumbTranslateDirective } from '../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { MainI18nService } from '@app/service/i18n.service';
import { NzColDirective, NzRowDirective } from 'ng-zorro-antd/grid';
import { NzInputModule, NzInputSearchEvent } from 'ng-zorro-antd/input';
import {
  FormControl,
  FormGroup,
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
} from '@angular/forms';
import { NzFormControlComponent, NzFormDirective, NzFormItemComponent, NzFormLabelComponent } from 'ng-zorro-antd/form';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { UserSettings } from '../../../typedef/define/user/UserSettings';

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
    NzFormControlComponent,
    NzFormDirective,
    NzFormItemComponent,
    NzFormLabelComponent,
    ReactiveFormsModule,
    NzRadioModule,
  ],
})
export class AccountComponent implements OnInit {

  form: FormGroup<{
    enabled: FormControl<boolean>;
  }>;

  constructor(
    private fb: NonNullableFormBuilder,
    public account: AccountService,
    private msg: NzMessageService,
    private i18n: MainI18nService,
  ) {
    this.form = this.fb.group({
      enabled: this.fb.control(false),
    });

    // 设置加载/回滚时（service 更新 signal）同步到表单；emitEvent: false 避免触发下方保存逻辑
    effect(() => {
      const enabled = this.account.userSettings().organizationEnabled;
      if (this.form.get('enabled')!.value !== enabled) {
        this.form.get('enabled')!.setValue(enabled, { emitEvent: false });
      }
    });

    // 选中即保存：切换 radio 立即持久化，失败由 service 回滚并重新加载
    this.form.get('enabled')!.valueChanges.subscribe((enabled) => {
      const next = new UserSettings();
      next.organizationEnabled = enabled;
      this.account.updateSettings(next);
    });
  }

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
