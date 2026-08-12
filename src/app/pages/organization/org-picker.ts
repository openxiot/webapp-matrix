import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzListModule } from 'ng-zorro-antd/list';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { AccountService } from '../../service/account.service';
import { UserService } from '../../service/user.service';
import { Organization } from '../../typedef/define/user/Organization';

@Component({
  selector: 'app-org-picker',
  imports: [
    FormsModule,
    NzButtonModule,
    NzEmptyModule,
    NzIconModule,
    NzInputModule,
    NzListModule,
    NzModalModule,
    NzPopconfirmModule,
    NzSpinModule,
    NzTagModule,
    NzTooltipModule,
  ],
  templateUrl: './org-picker.html',
  styleUrl: './org-picker.less',
})
export class OrgPicker implements OnInit {
  loading: boolean = false;
  createVisible: boolean = false;
  renameVisible: boolean = false;
  renameTarget: Organization | null = null;
  newId: string = '';
  newName: string = '';
  renameName: string = '';

  constructor(
    public account: AccountService,
    private service: UserService,
    private msg: NzMessageService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.service.getOrganizations().subscribe({
      next: (data) => {
        this.account.organizations = data;
        this.loading = false;
      },
      error: (e) => {
        this.msg.error(e?.message ?? e);
        this.loading = false;
      },
    });
  }

  routerBack() {
    this.router.navigate(['/project']);
  }

  toDetail(org: Organization) {
    this.router.navigate(['/org', org.id]);
  }

  select(org: Organization) {
    this.account.setOrganization(org);
    this.msg.success(`已切换到组织：${org.name}`);
    this.router.navigate(['/project']);
  }

  openCreate() {
    this.newId = '';
    this.newName = '';
    this.createVisible = true;
  }

  submitCreate() {
    const id = this.newId.trim();
    const name = this.newName.trim();
    if (!id || !name) {
      this.msg.warning('请填写组织标识和名称');
      return;
    }
    this.service.createOrganization(id, name).subscribe({
      next: () => {
        this.createVisible = false;
        this.msg.success('创建成功');
        this.load();
      },
      error: (e) => this.msg.error(e?.message ?? e),
    });
  }

  openRename(org: Organization) {
    this.renameTarget = org;
    this.renameName = org.name;
    this.renameVisible = true;
  }

  submitRename() {
    const name = this.renameName.trim();
    if (!name || !this.renameTarget) return;
    this.service.updateOrganizationName(this.renameTarget.id, name).subscribe({
      next: () => {
        this.renameVisible = false;
        this.msg.success('重命名成功');
        this.load();
      },
      error: (e) => this.msg.error(e?.message ?? e),
    });
  }

  remove(org: Organization) {
    this.service.removeOrganization(org.id).subscribe({
      next: () => {
        this.msg.success('删除成功');
        if (this.account.organization().id === org.id) {
          this.account.clearCurrentRootSpace();
        }
        this.load();
      },
      error: (e) => this.msg.error(e?.message ?? e),
    });
  }
}
