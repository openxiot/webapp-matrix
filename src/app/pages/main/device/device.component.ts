import { Component, OnInit } from '@angular/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { NzColDirective, NzRowDirective } from 'ng-zorro-antd/grid';
import { BreadcrumbTranslateDirective } from '../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { AccountService } from '../../../service/account.service';
import { DeviceEntity } from '../../../typedef/define/device/DeviceEntity';
import { UrnUtils } from '../../../typedef/utils/UrnUtils';

@Component({
  selector: 'main-device',
  standalone: true,
  templateUrl: './device.component.html',
  styleUrl: './device.component.less',
  imports: [
    NzPageHeaderModule,
    NzBreadCrumbModule,
    BreadcrumbTranslateDirective,
    NzSpinModule,
    NzCardModule,
    NzAvatarModule,
    NzTagModule,
    NzEmptyModule,
    RouterLink,
    TranslatePipe,
    NzColDirective,
    NzRowDirective,
  ],
})
export class DeviceComponent implements OnInit {
  constructor(
    public account: AccountService,
    private msg: NzMessageService,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    const rootId = this.account.space().id;
    if (!rootId) {
      this.msg.warning(this.translate.instant('请先在项目列表中选择一个项目'));
      return;
    }
  }

  /** 设备类型显示名（URN 类型段） */
  deviceTypeLabel(device: DeviceEntity): string {
    return UrnUtils.extractTypeName(device.type) || device.type || '-';
  }
}
