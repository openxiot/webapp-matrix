import { Component, OnInit, ViewContainerRef } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { AccountService } from '../service/account.service';
import pkg from '../../../package.json';
import { NzSpaceModule } from 'ng-zorro-antd/space';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { TranslatePipe } from '@ngx-translate/core';
import { MainI18nService } from '../service/i18n.service';
import { NzModalService } from 'ng-zorro-antd/modal';
import { LanguageChangeComponent } from '../common/dialog/language/change/language.change.component';

@Component({
  selector: 'app-layout',
  templateUrl: './layout.html',
  styleUrl: './layout.less',
  imports: [
    RouterLink,
    RouterOutlet,
    NzIconModule,
    NzLayoutModule,
    NzMenuModule,
    NzSpaceModule,
    NzAvatarModule,
    TranslatePipe,
  ],
  providers: [
    NzModalService
  ],
})
export class Layout implements OnInit {
  isCollapsed = true;
  version: string = pkg.version;

  constructor(
    public i18n: MainI18nService,
    public account: AccountService,
    private modal: NzModalService,
    private viewContainerRef: ViewContainerRef,
  ) {}

  ngOnInit() {
    this.account.loadOrganizations();
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
