import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NzListModule } from 'ng-zorro-antd/list';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { ApiService } from '../../services/api.service';
import { TokenService } from '../../services/token.service';
import { Organization, Member } from '../../models/api.models';

@Component({
  selector: 'app-org-detail',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    NzListModule, NzCardModule, NzIconModule, NzButtonModule,
    NzModalModule, NzInputModule, NzRadioModule, NzTagModule,
    NzSpinModule, NzEmptyModule, NzPageHeaderModule, NzBreadCrumbModule,
  ],
  template: `
    <div class="page-container">
      <nz-page-header (nzBack)="router.navigate(['/organizations'])" nzBackIcon>
        <nz-breadcrumb nz-page-header-breadcrumb nzSeparator=">">
          <nz-breadcrumb-item><a (click)="router.navigate(['/organizations'])">组织列表</a></nz-breadcrumb-item>
          <nz-breadcrumb-item>{{ org()?.name || '组织详情' }}</nz-breadcrumb-item>
        </nz-breadcrumb>
      </nz-page-header>

      <nz-spin [nzSpinning]="loading()" class="content-spin">
        <div class="org-info-card" *ngIf="org()">
          <div class="org-header">
            <div class="org-icon">
              <span nz-icon nzType="team" nzTheme="fill"></span>
            </div>
            <div>
              <h3>{{ org()?.name }}</h3>
              <nz-tag>{{ org()?.code }}</nz-tag>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-header">
            <h4>成员列表 ({{ members().length }})</h4>
            <button nz-button nzType="primary" nzSize="small" *ngIf="isAdmin()" (click)="showAddMember()">
              <span nz-icon nzType="user-add"></span>
              添加成员
            </button>
          </div>

          <nz-empty *ngIf="members().length === 0" nzNotFoundContent="暂无成员"></nz-empty>

          <nz-list *ngIf="members().length > 0" [nzDataSource]="members()" nzItemLayout="horizontal" nzBordered>
            <nz-list-item *ngFor="let m of members()">
              <div nz-list-item-extra *ngIf="isAdmin() && m.developerId !== currentUserId">
                <button nz-button nzType="link" nz-tooltip="更改角色" (click)="showChangeRole(m)">
                  <span nz-icon nzType="swap" nzTheme="outline"></span>
                </button>
                <button nz-button nzType="link" nzDanger nz-tooltip="移除" (click)="showRemove(m)">
                  <span nz-icon nzType="delete" nzTheme="outline"></span>
                </button>
              </div>
              <div class="member-item">
                <div class="member-avatar">{{ m.name.charAt(0).toUpperCase() }}</div>
                <div class="member-info">
                  <strong>{{ m.name }} <small *ngIf="m.developerId === currentUserId">(我)</small></strong>
                  <small>{{ m.developerId }}</small>
                </div>
                <nz-tag [nzColor]="m.role === 'admin' ? 'blue' : 'default'">
                  {{ m.role === 'admin' ? '管理员' : '成员' }}
                </nz-tag>
              </div>
            </nz-list-item>
          </nz-list>
        </div>
      </nz-spin>
    </div>

    <!-- Add member modal -->
    <nz-modal [(nzVisible)]="addVisible" nzTitle="添加成员" (nzOnCancel)="addVisible = false"
              (nzOnOk)="addMember()" [nzOkLoading]="submitting" [nzOkDisabled]="!addDevId">
      <div *nzModalContent>
        <input nz-input placeholder="开发者ID" [(ngModel)]="addDevId" style="margin-bottom:12px">
        <input nz-input placeholder="显示名称" [(ngModel)]="addName" style="margin-bottom:12px">
        <nz-radio-group [(ngModel)]="addRole">
          <label nz-radio nzValue="member">普通成员</label>
          <label nz-radio nzValue="admin" style="margin-left:16px">管理员</label>
        </nz-radio-group>
      </div>
    </nz-modal>

    <!-- Change role modal -->
    <nz-modal [(nzVisible)]="roleVisible" nzTitle="更改角色" (nzOnCancel)="roleVisible = false"
              (nzOnOk)="updateRole()" [nzOkLoading]="submitting">
      <div *nzModalContent>
        <nz-radio-group [(ngModel)]="roleNewRole">
          <label nz-radio nzValue="member">普通成员</label>
          <label nz-radio nzValue="admin" style="margin-left:16px">管理员</label>
        </nz-radio-group>
      </div>
    </nz-modal>

    <!-- Remove confirm -->
    <nz-modal [(nzVisible)]="removeVisible" nzTitle="确认移除" nzOkType="primary" nzOkDanger
              (nzOnCancel)="removeVisible = false" (nzOnOk)="removeMember()" [nzOkLoading]="submitting">
      <div *nzModalContent>
        <p>确定要移除「{{ removeTarget?.name }}」吗？</p>
      </div>
    </nz-modal>
  `,
  styles: [`
    .page-container { padding: 0 24px 24px; max-width: 800px; margin: 0 auto; }
    .content-spin { min-height: 200px; }
    .org-info-card {
      background: #fff; border-radius: 8px; padding: 20px; margin-bottom: 16px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.06);
    }
    .org-header { display: flex; align-items: center; gap: 16px; }
    .org-icon {
      width: 56px; height: 56px; border-radius: 12px;
      background: #e6f7ff; display: flex; align-items: center; justify-content: center;
      font-size: 28px; color: #0D84FF;
    }
    .org-header h3 { margin: 0 0 4px; font-size: 18px; }
    .section { margin-top: 16px; }
    .section-header {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;
    }
    .section-header h4 { margin: 0; font-size: 16px; font-weight: 600; }
    .member-item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 4px 0; }
    .member-avatar {
      width: 40px; height: 40px; border-radius: 50%;
      background: #0D84FF; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 16px; flex-shrink: 0;
    }
    .member-info { flex: 1; display: flex; flex-direction: column; }
    .member-info small { color: #999; font-size: 12px; }
    :host-context(.dark-theme) .org-info-card { background: #1f1f1f; }
    :host-context(.dark-theme) .org-icon { background: #111d2c; color: #177ddc; }
  `]
})
export class OrgDetailComponent implements OnInit {
  router = inject(Router);
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private msg = inject(NzMessageService);
  private token = inject(TokenService);

  org = signal<Organization | null>(null);
  members = signal<Member[]>([]);
  loading = signal(false);
  isAdmin = signal(false);
  currentUserId = this.token.developerId;

  submitting = false;

  // Add member
  addVisible = false;
  addDevId = '';
  addName = '';
  addRole: 'member' | 'admin' = 'member';

  // Change role
  roleVisible = false;
  roleTarget: Member | null = null;
  roleNewRole: string = 'member';

  // Remove
  removeVisible = false;
  removeTarget: Member | null = null;

  private orgId = '';

  ngOnInit(): void {
    this.orgId = this.route.snapshot.paramMap.get('orgId') || '';
    if (this.orgId) this.loadOrg();
  }

  private loadOrg(): void {
    this.loading.set(true);
    this.api.getOrganization(this.orgId).subscribe({
      next: (org) => {
        this.org.set(org);
        const all = org.members || [];
        this.members.set(all);
        const currentMember = all.find(m => m.developerId === this.currentUserId)
          || all.find(m => m.name === this.token.username);
        this.isAdmin.set(currentMember?.role === 'admin');
        this.loading.set(false);
      },
      error: (err) => { this.msg.error(err.message); this.loading.set(false); }
    });
  }

  showAddMember(): void { this.addVisible = true; this.addDevId = ''; this.addName = ''; this.addRole = 'member'; }
  addMember(): void {
    if (!this.addDevId) return;
    this.submitting = true;
    this.api.addMember(this.orgId, {
      developerId: this.addDevId,
      name: this.addName || this.addDevId,
      role: this.addRole
    }).subscribe({
      next: () => { this.submitting = false; this.addVisible = false; this.msg.success('添加成功'); this.loadOrg(); },
      error: (err) => { this.submitting = false; this.msg.error(err.message); }
    });
  }

  showChangeRole(m: Member): void { this.roleTarget = m; this.roleNewRole = m.role; this.roleVisible = true; }
  updateRole(): void {
    if (!this.roleTarget) return;
    this.submitting = true;
    this.api.updateMember(this.orgId, {
      developerId: this.roleTarget.developerId,
      name: this.roleTarget.name,
      role: this.roleNewRole
    }).subscribe({
      next: () => { this.submitting = false; this.roleVisible = false; this.msg.success('角色已更新'); this.loadOrg(); },
      error: (err) => { this.submitting = false; this.msg.error(err.message); }
    });
  }

  showRemove(m: Member): void { this.removeTarget = m; this.removeVisible = true; }
  removeMember(): void {
    if (!this.removeTarget) return;
    this.submitting = true;
    this.api.removeMember(this.orgId, this.removeTarget.developerId).subscribe({
      next: () => { this.submitting = false; this.removeVisible = false; this.msg.success('已移除'); this.loadOrg(); },
      error: (err) => { this.submitting = false; this.msg.error(err.message); }
    });
  }
}
