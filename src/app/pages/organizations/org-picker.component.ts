import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NzListModule } from 'ng-zorro-antd/list';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ApiService } from '../../services/api.service';
import { TokenService } from '../../services/token.service';
import { Organization } from '../../models/api.models';

@Component({
  selector: 'app-org-picker',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    NzListModule, NzCardModule, NzIconModule, NzButtonModule,
    NzModalModule, NzInputModule, NzSpinModule, NzEmptyModule,
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h2>当前组织</h2>
        <button nz-button nzType="primary" (click)="showCreate()">
          <span nz-icon nzType="plus"></span>
          创建组织
        </button>
      </div>

      <nz-spin [nzSpinning]="loading()" class="content-spin">
        <nz-empty *ngIf="!loading() && orgs().length === 0 && !error()" nzNotFoundContent="还没有组织"></nz-empty>

        <nz-list *ngIf="orgs().length > 0" [nzDataSource]="orgs()" nzBordered nzItemLayout="horizontal">
          <nz-list-item *ngFor="let org of orgs()" [class.selected]="org.code === token.currentOrgId">
            <div nz-list-item-extra>
              <button nz-button nzType="link" nz-tooltip="管理" (click)="goToDetail(org)">
                <span nz-icon nzType="setting" nzTheme="outline"></span>
              </button>
              <button nz-button nzType="link" nz-tooltip="重命名" (click)="showRename(org)">
                <span nz-icon nzType="edit" nzTheme="outline"></span>
              </button>
              <button nz-button nzType="link" nzDanger nz-tooltip="删除" (click)="showDelete(org)">
                <span nz-icon nzType="delete" nzTheme="outline"></span>
              </button>
            </div>
            <div class="org-item" (click)="selectOrg(org)">
              <div class="org-avatar">
                <span nz-icon nzType="team" nzTheme="fill"></span>
              </div>
              <div class="org-info">
                <strong>{{ org.name || org.code }}</strong>
                <small *ngIf="org.members?.length">{{ org.members!.length }} 位成员</small>
              </div>
              <span nz-icon nzType="check-circle" nzTheme="fill" class="selected-badge"
                    *ngIf="org.code === token.currentOrgId"></span>
            </div>
          </nz-list-item>
        </nz-list>
      </nz-spin>
    </div>

    <!-- Create modal -->
    <nz-modal [(nzVisible)]="createVisible" nzTitle="创建组织" (nzOnCancel)="createVisible = false"
              (nzOnOk)="createOrg()" [nzOkLoading]="submitting" [nzOkDisabled]="!newId || !newName">
      <div *nzModalContent>
        <input nz-input placeholder="组织标识 (如: my-company)" [(ngModel)]="newId" style="margin-bottom:12px">
        <input nz-input placeholder="组织名称 (如: 我的公司)" [(ngModel)]="newName">
      </div>
    </nz-modal>

    <!-- Rename modal -->
    <nz-modal [(nzVisible)]="renameVisible" nzTitle="重命名组织" (nzOnCancel)="renameVisible = false"
              (nzOnOk)="renameOrg()" [nzOkLoading]="submitting" [nzOkDisabled]="!renameName">
      <div *nzModalContent>
        <input nz-input placeholder="组织名称" [(ngModel)]="renameName">
      </div>
    </nz-modal>

    <!-- Delete confirm -->
    <nz-modal [(nzVisible)]="deleteVisible" nzTitle="确认删除" nzOkType="primary" nzOkDanger
              (nzOnCancel)="deleteVisible = false" (nzOnOk)="deleteOrg()" [nzOkLoading]="submitting">
      <div *nzModalContent>
        <p>确定要删除这个组织吗？此操作不可逆。</p>
      </div>
    </nz-modal>
  `,
  styles: [`
    .page-container { padding: 24px; max-width: 800px; margin: 0 auto; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
    .content-spin { min-height: 200px; }
    .org-item { display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 4px 0; width: 100%; }
    .org-avatar {
      width: 40px; height: 40px; border-radius: 10px;
      background: #e6f7ff; display: flex; align-items: center; justify-content: center;
      font-size: 20px; color: #0D84FF; flex-shrink: 0;
    }
    .org-info { flex: 1; display: flex; flex-direction: column; }
    .org-info small { color: #999; font-size: 12px; }
    .selected-badge { color: #52c41a; font-size: 18px; }
    .selected { background: #f6ffed; }

    :host-context(.dark-theme) .selected { background: #1a1a1a; }
    :host-context(.dark-theme) .org-avatar { background: #111d2c; color: #177ddc; }
  `]
})
export class OrgPickerComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private msg = inject(NzMessageService);
  token = inject(TokenService);

  orgs = signal<Organization[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  submitting = false;

  createVisible = false;
  newId = '';
  newName = '';

  renameVisible = false;
  renameTarget: Organization | null = null;
  renameName = '';

  deleteVisible = false;
  deleteTarget: Organization | null = null;

  ngOnInit(): void {
    this.loadOrgs();
  }

  private loadOrgs(): void {
    this.loading.set(true);
    this.api.getMyOrganizations().subscribe({
      next: (orgs) => { this.orgs.set(orgs); this.loading.set(false); },
      error: (err) => { this.error.set(err.message); this.loading.set(false); }
    });
  }

  selectOrg(org: Organization): void {
    if (!org.code) return;
    this.token.currentOrgId = org.code;
    this.token.currentOrgName = org.name || org.code;
    this.token.currentRootSpaceId = null;
    this.token.currentRootSpaceName = null;
    this.msg.success(`已选择组织: ${org.name}`);
    this.router.navigate(['/projects']);
  }

  goToDetail(org: Organization): void {
    if (org.code) this.router.navigate(['/organizations', org.code]);
  }

  showCreate(): void { this.createVisible = true; this.newId = ''; this.newName = ''; }
  createOrg(): void {
    if (!this.newId || !this.newName) return;
    this.submitting = true;
    this.api.createOrganization(this.newId, this.newName).subscribe({
      next: () => { this.submitting = false; this.createVisible = false; this.msg.success('创建成功'); this.loadOrgs(); },
      error: (err) => { this.submitting = false; this.msg.error(err.message); }
    });
  }

  showRename(org: Organization): void {
    this.renameTarget = org;
    this.renameName = org.name || '';
    this.renameVisible = true;
  }
  renameOrg(): void {
    if (!this.renameTarget?.code || !this.renameName) return;
    this.submitting = true;
    this.api.updateOrganization(this.renameTarget.code, this.renameName).subscribe({
      next: () => { this.submitting = false; this.renameVisible = false; this.msg.success('重命名成功'); this.loadOrgs(); },
      error: (err) => { this.submitting = false; this.msg.error(err.message); }
    });
  }

  showDelete(org: Organization): void { this.deleteTarget = org; this.deleteVisible = true; }
  deleteOrg(): void {
    if (!this.deleteTarget?.code) return;
    this.submitting = true;
    this.api.deleteOrganization(this.deleteTarget.code).subscribe({
      next: () => { this.submitting = false; this.deleteVisible = false; this.msg.success('删除成功'); this.loadOrgs(); },
      error: (err) => { this.submitting = false; this.msg.error(err.message); }
    });
  }
}
