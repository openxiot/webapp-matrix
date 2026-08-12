import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalService } from 'ng-zorro-antd/modal';
import { AccountService } from '../../service/account.service';

@Component({
  selector: 'app-account',
  imports: [NzAvatarModule, NzButtonModule, NzCardModule, NzDescriptionsModule, NzIconModule],
  templateUrl: './account.html',
  styleUrl: './account.less',
})
export class Account {
  constructor(
    public account: AccountService,
    private router: Router,
    private modal: NzModalService,
  ) {}

  initial(): string {
    return (this.account.user.name || 'U').charAt(0).toUpperCase();
  }

  routerBack() {
    this.router.navigate(['/settings']);
  }

  logout() {
    this.modal.confirm({
      nzTitle: '确定要退出登录吗？',
      nzOkText: '退出',
      nzOkDanger: true,
      nzCancelText: '取消',
      nzOnOk: () => {
        this.account.clear();
        this.router.navigate(['/passport']);
      },
    });
  }
}
