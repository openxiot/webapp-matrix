import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzListModule } from 'ng-zorro-antd/list';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { AccountService } from '../../service/account.service';
import { UserService } from '../../service/user.service';
import { Organization, OrganizationMember } from '../../typedef/define/user/Organization';

@Component({
  selector: 'app-org-detail',
  imports: [
    FormsModule,
    NzButtonModule,
    NzEmptyModule,
    NzIconModule,
    NzInputModule,
    NzListModule,
    NzModalModule,
    NzPopconfirmModule,
    NzRadioModule,
    NzSpinModule,
    NzTagModule,
    NzTooltipModule,
  ],
  templateUrl: './org-detail.html',
  styleUrl: './org-detail.less',
})
export class OrgDetail implements OnInit {
  orgId: string = '';
  loading: boolean = false;
  organization: Organization | null = null;
  addVisible: boolean = false;
  roleVisible: boolean = false;
  roleTarget: OrganizationMember | null = null;

  newDeveloperId: string = '';
  newName: string = '';
  newRole: string = 'member';
  changeRole: string = 'member';

  constructor(
    public account: AccountService,
    private route: ActivatedRoute,
    private router: Router,
    private service: UserService,
    private msg: NzMessageService,
  ) {}

  ngOnInit() {
    this.orgId = this.route.snapshot.paramMap.get('orgId') || '';
    this.load();
  }

  routerBack() {
    this.router.navigate(['/org-picker']);
  }

  load() {
    this.loading = true;
    this.service.getOrganization(this.orgId).subscribe({
      next: (org) => {
        this.organization = org;
        this.loading = false;
      },
      error: (e) => {
        this.msg.error(e?.message ?? e);
        this.loading = false;
      },
    });
  }

  /** 当前用户标识：优先 user.uid，兜底按名称匹配 */
  currentUserId(): string {
    return this.account.user().id || '';
  }

  isCurrentUser(member: OrganizationMember): boolean {
    if (this.currentUserId()) return member.developerId === this.currentUserId();
    return member.name === this.account.user.name;
  }

  isAdmin(): boolean {
    const me = this.organization?.members.find((m) => this.isCurrentUser(m));
    return !!me && me.role === 'admin';
  }

  isEditable(member: OrganizationMember): boolean {
    return this.isAdmin() && !this.isCurrentUser(member);
  }

  roleLabel(role: string): string {
    return role === 'admin' ? '管理员' : '成员';
  }

  openAdd() {
    this.newDeveloperId = '';
    this.newName = '';
    this.newRole = 'member';
    this.addVisible = true;
  }

  submitAdd() {
    const developerId = this.newDeveloperId.trim();
    if (!developerId) {
      this.msg.warning('请填写 developerId');
      return;
    }
    const member = new OrganizationMember();
    member.developerId = developerId;
    member.name = this.newName.trim() || developerId;
    member.role = this.newRole;

    this.service.addOrganizationMember(this.orgId, member).subscribe({
      next: () => {
        this.addVisible = false;
        this.msg.success('添加成功');
        this.load();
      },
      error: (e) => this.msg.error(e?.message ?? e),
    });
  }

  openRole(member: OrganizationMember) {
    this.roleTarget = member;
    this.changeRole = member.role;
    this.roleVisible = true;
  }

  submitRole() {
    if (!this.roleTarget) return;
    const member = Object.assign(new OrganizationMember(), this.roleTarget);
    member.role = this.changeRole;

    this.service.updateOrganizationMember(this.orgId, member).subscribe({
      next: () => {
        this.roleVisible = false;
        this.msg.success('角色已更新');
        this.load();
      },
      error: (e) => this.msg.error(e?.message ?? e),
    });
  }

  remove(member: OrganizationMember) {
    this.service.removeOrganizationMember(this.orgId, member.developerId).subscribe({
      next: () => {
        this.msg.success('移除成功');
        this.load();
      },
      error: (e) => this.msg.error(e?.message ?? e),
    });
  }
}
