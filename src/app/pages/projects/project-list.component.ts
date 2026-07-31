import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NzListModule } from 'ng-zorro-antd/list';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ApiService } from '../../services/api.service';
import { TokenService } from '../../services/token.service';
import { SpaceEntity } from '../../models/api.models';

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    NzListModule, NzIconModule, NzButtonModule,
    NzModalModule, NzInputModule, NzSpinModule, NzEmptyModule,
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h2>当前项目</h2>
        <button nz-button nzType="primary" (click)="showCreate()">
          <span nz-icon nzType="plus"></span>
          创建项目
        </button>
      </div>

      <nz-spin [nzSpinning]="loading()" class="content-spin">
        <nz-empty *ngIf="!loading() && projects().length === 0" nzNotFoundContent="暂无项目"></nz-empty>

        <nz-list *ngIf="projects().length > 0" [nzDataSource]="projects()" nzBordered nzItemLayout="horizontal">
          <nz-list-item *ngFor="let p of projects()" [class.selected]="p.id === token.currentRootSpaceId">
            <div nz-list-item-extra>
              <button nz-button nzType="link" nz-tooltip="管理空间" (click)="goToDetail(p)">
                <span nz-icon nzType="apartment" nzTheme="outline"></span>
              </button>
              <button nz-button nzType="link" nz-tooltip="重命名" (click)="showRename(p)">
                <span nz-icon nzType="edit" nzTheme="outline"></span>
              </button>
              <button nz-button nzType="link" nzDanger nz-tooltip="删除" (click)="showDelete(p)">
                <span nz-icon nzType="delete" nzTheme="outline"></span>
              </button>
            </div>
            <div class="project-item" (click)="selectProject(p)">
              <div class="project-avatar">
                <span nz-icon nzType="apartment" nzTheme="fill"></span>
              </div>
              <div class="project-info">
                <strong>{{ p.name || '未命名' }}</strong>
                <small>{{ p.type || '-' }}</small>
              </div>
              <span nz-icon nzType="check-circle" nzTheme="fill" class="selected-badge"
                    *ngIf="p.id === token.currentRootSpaceId"></span>
            </div>
          </nz-list-item>
        </nz-list>
      </nz-spin>
    </div>

    <!-- Create modal -->
    <nz-modal [(nzVisible)]="createVisible" nzTitle="创建项目" (nzOnCancel)="createVisible = false"
              (nzOnOk)="createProject()" [nzOkLoading]="submitting" [nzOkDisabled]="!newName">
      <div *nzModalContent>
        <input nz-input placeholder="项目名称" [(ngModel)]="newName">
      </div>
    </nz-modal>

    <!-- Rename modal -->
    <nz-modal [(nzVisible)]="renameVisible" nzTitle="重命名项目" (nzOnCancel)="renameVisible = false"
              (nzOnOk)="renameProject()" [nzOkLoading]="submitting" [nzOkDisabled]="!renameName">
      <div *nzModalContent>
        <input nz-input placeholder="项目名称" [(ngModel)]="renameName">
      </div>
    </nz-modal>

    <!-- Delete confirm -->
    <nz-modal [(nzVisible)]="deleteVisible" nzTitle="确认删除" nzOkType="primary" nzOkDanger
              (nzOnCancel)="deleteVisible = false" (nzOnOk)="deleteProject()" [nzOkLoading]="submitting">
      <div *nzModalContent>
        <p>确定要删除这个项目吗？如果项目下有空间数据，将无法删除。</p>
      </div>
    </nz-modal>
  `,
  styles: [`
    .page-container { padding: 24px; max-width: 800px; margin: 0 auto; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
    .content-spin { min-height: 200px; }
    .project-item { display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 4px 0; width: 100%; }
    .project-avatar {
      width: 40px; height: 40px; border-radius: 10px;
      background: #e6f7ff; display: flex; align-items: center; justify-content: center;
      font-size: 20px; color: #0D84FF; flex-shrink: 0;
    }
    .project-info { flex: 1; display: flex; flex-direction: column; }
    .project-info small { color: #999; font-size: 12px; }
    .selected-badge { color: #52c41a; font-size: 18px; }
    .selected { background: #f6ffed; }
    :host-context(.dark-theme) .selected { background: #1a1a1a; }
    :host-context(.dark-theme) .project-avatar { background: #111d2c; color: #177ddc; }
  `]
})
export class ProjectListComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private msg = inject(NzMessageService);
  token = inject(TokenService);

  projects = signal<SpaceEntity[]>([]);
  loading = signal(false);
  submitting = false;

  createVisible = false;
  newName = '';

  renameVisible = false;
  renameTarget: SpaceEntity | null = null;
  renameName = '';

  deleteVisible = false;
  deleteTarget: SpaceEntity | null = null;

  ngOnInit(): void { this.loadProjects(); }

  private loadProjects(): void {
    this.loading.set(true);
    this.api.getAllSpaces().subscribe({
      next: (spaces) => { this.projects.set(spaces); this.loading.set(false); },
      error: (err) => { this.msg.error(err.message); this.loading.set(false); }
    });
  }

  selectProject(p: SpaceEntity): void {
    if (!p.id) return;
    this.token.currentRootSpaceId = p.id;
    this.token.currentRootSpaceName = p.name || p.id;
    this.msg.success(`已选择项目: ${p.name}`);
    this.router.navigate(['/projects']);
  }

  goToDetail(p: SpaceEntity): void {
    if (p.id) this.router.navigate(['/projects', p.id]);
  }

  showCreate(): void { this.createVisible = true; this.newName = ''; }
  createProject(): void {
    if (!this.newName) return;
    this.submitting = true;
    this.api.createSpace({ name: this.newName, type: 'site' } as SpaceEntity).subscribe({
      next: () => { this.submitting = false; this.createVisible = false; this.msg.success('创建成功'); this.loadProjects(); },
      error: (err) => { this.submitting = false; this.msg.error(err.message); }
    });
  }

  showRename(p: SpaceEntity): void { this.renameTarget = p; this.renameName = p.name || ''; this.renameVisible = true; }
  renameProject(): void {
    if (!this.renameTarget?.id || !this.renameName) return;
    this.submitting = true;
    this.api.updateSpace({ id: this.renameTarget.id, name: this.renameName } as SpaceEntity).subscribe({
      next: () => { this.submitting = false; this.renameVisible = false; this.msg.success('重命名成功'); this.loadProjects(); },
      error: (err) => { this.submitting = false; this.msg.error(err.message); }
    });
  }

  showDelete(p: SpaceEntity): void { this.deleteTarget = p; this.deleteVisible = true; }
  deleteProject(): void {
    if (!this.deleteTarget?.id) return;
    this.submitting = true;
    this.api.deleteSpace(this.deleteTarget.id).subscribe({
      next: () => { this.submitting = false; this.deleteVisible = false; this.msg.success('删除成功'); this.loadProjects(); },
      error: (err) => { this.submitting = false; this.msg.error(err.message); }
    });
  }
}
