import { Component, OnInit, ViewContainerRef, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { AccountService } from '@app/service/account.service';
import pkg from '../../../../package.json';
import { NzSpaceModule } from 'ng-zorro-antd/space';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MainI18nService } from '@app/service/i18n.service';
import { NzModalService } from 'ng-zorro-antd/modal';
import { LanguageChangeComponent } from '../../common/dialog/language/change/language.change.component';
import { NzSpinModule } from 'ng-zorro-antd/spin';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrl: './main.component.less',
  imports: [
    RouterLink,
    RouterOutlet,
    NzIconModule,
    NzLayoutModule,
    NzMenuModule,
    NzSpaceModule,
    NzAvatarModule,
    TranslatePipe,
    NzSpinModule,
  ],
  providers: [
    NzModalService
  ],
})
export class MainComponent implements OnInit {
  isCollapsed = true;
  version: string = pkg.version;

  /** 品牌默认名的 i18n key：未选项目时 logo 与浏览器标题回退该值。 */
  private static readonly BRAND_KEY = '矩阵';

  /** 语言切换信号：品牌名走翻译，切语言时要重算标题。 */
  private readonly langChange = toSignal(inject(TranslateService).onLangChange);

  /** 当前标题：已选项目显示项目名，否则显示品牌名。侧栏 logo 与浏览器标题共用。 */
  protected readonly currentTitle = computed(() => {
    this.langChange();
    const space = this.account.space();
    return space.id ? space.name : this.i18n.translate.instant(MainComponent.BRAND_KEY);
  });

  constructor(
    public i18n: MainI18nService,
    public account: AccountService,
    private modal: NzModalService,
    private viewContainerRef: ViewContainerRef,
    private readonly title: Title,
  ) {
    // 选中/切换项目后同步浏览器标签页标题；未选项目时保持品牌名。
    effect(() => {
      this.title.setTitle(this.currentTitle());
    });
  }

  ngOnInit() {
    this.account.load();
  }

  protected changeLanguage() {
    this.modal.create<LanguageChangeComponent, string, string>({
      nzTitle: '',
      nzWidth: 1400,
      nzContent: LanguageChangeComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: '',
      nzFooter: null,
      nzClosable: false,
      nzMaskClosable: true,
      nzKeyboard: true,
    });
  }
}
