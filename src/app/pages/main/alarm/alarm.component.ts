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
import { BreadcrumbTranslateDirective } from '../../../common/components/breadcrumb/breadcrumb-translate.directive';

@Component({
  selector: 'main-alarm',
  standalone: true,
  templateUrl: './alarm.component.html',
  styleUrl: './alarm.component.less',
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
  ],
})
export class AlarmComponent implements OnInit {
  constructor(
    public account: AccountService,
    private msg: NzMessageService,
  ) {}

  ngOnInit() {}
}
