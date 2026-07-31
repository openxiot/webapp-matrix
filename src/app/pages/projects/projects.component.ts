import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTreeModule } from 'ng-zorro-antd/tree';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { TokenService } from '../../services/token.service';
import { ApiService } from '../../services/api.service';
import { SpaceEntity, DeviceEntity, extractModelFromUrn, extractTypeName, productDisplayName } from '../../models/api.models';

interface FlatNode {
  id: string;
  name: string;
  type: string;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  children: FlatNode[];
  devices: DeviceEntity[];
  space: SpaceEntity;
}

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [
    CommonModule,
    NzIconModule, NzButtonModule, NzTreeModule, NzTagModule,
    NzSpinModule, NzEmptyModule, NzCardModule, NzTooltipModule,
  ],
  template: `
    <div class="page-container">
      <!-- Context header -->
      <div class="context-bar">
        <div class="context-left">
          <button nz-button nzType="default" nzSize="small" (click)="router.navigate(['/organizations'])">
            <span nz-icon nzType="team"></span>
            {{ token.currentOrgName || '选择组织' }}
          </button>
          <span nz-icon nzType="right" style="font-size:12px;color:#999"></span>
          <button nz-button nzType="default" nzSize="small" (click)="router.navigate(['/projects/list'])">
            <span nz-icon nzType="apartment"></span>
            {{ token.currentRootSpaceName || '选择项目' }}
          </button>
        </div>
      </div>

      <nz-spin [nzSpinning]="loading()" class="content-spin">
        <!-- No org -->
        <nz-empty *ngIf="!token.currentOrgName && !loading()"
                  nzNotFoundContent="请先选择当前组织"
                  [nzNotFoundFooter]="orgFooter">
        </nz-empty>
        <ng-template #orgFooter>
          <button nz-button nzType="primary" (click)="router.navigate(['/organizations'])">选择组织</button>
        </ng-template>

        <!-- Has org, no project -->
        <nz-empty *ngIf="token.currentOrgName && !token.currentRootSpaceId && !loading()"
                  nzNotFoundContent="请先选择当前项目"
                  [nzNotFoundFooter]="projFooter">
        </nz-empty>
        <ng-template #projFooter>
          <button nz-button nzType="primary" (click)="router.navigate(['/projects/list'])">选择项目</button>
        </ng-template>

        <!-- Has project selected - show tree -->
        <div *ngIf="token.currentRootSpaceId">
          <div class="project-title-bar">
            <span class="project-name">{{ token.currentRootSpaceName }}</span>
            <button nz-button nzType="link" nzSize="small" (click)="router.navigate(['/projects', token.currentRootSpaceId])">
              <span nz-icon nzType="setting"></span>
              管理
            </button>
          </div>

          <div class="summary-bar" *ngIf="devices().length > 0">
            <span>共 <strong>{{ devices().length }}</strong> 个设备</span>
          </div>

          <nz-empty *ngIf="!loading() && flatNodes().length === 0 && devices().length === 0"
                    nzNotFoundContent="该项目暂无空间或设备"></nz-empty>

          <!-- Device list as cards (web-friendly) -->
          <div class="device-grid" *ngIf="devices().length > 0">
            <div class="device-card" *ngFor="let d of devices()" (click)="router.navigate(['/devices', d.did])">
              <div class="device-status" [class.online]="d.online" [class.offline]="!d.online"></div>
              <div class="device-info">
                <strong>{{ getDeviceName(d) }}</strong>
                <small>{{ d.did | slice:0:20 }}...</small>
              </div>
              <nz-tag [nzColor]="d.online ? 'green' : 'default'">{{ d.online ? '在线' : '离线' }}</nz-tag>
              <span nz-icon nzType="right" nzTheme="outline" style="color:#ccc;margin-left:8px"></span>
            </div>
          </div>
        </div>
      </nz-spin>
    </div>
  `,
  styles: [`
    .page-container { padding: 16px 24px; max-width: 1000px; margin: 0 auto; }
    .context-bar {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px; gap: 8px; flex-wrap: wrap;
    }
    .context-left { display: flex; align-items: center; gap: 8px; }
    .content-spin { min-height: 300px; }
    .project-title-bar {
      display: flex; align-items: center; justify-content: space-between;
      background: #fff; padding: 12px 16px; border-radius: 8px; margin-bottom: 8px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.06);
    }
    .project-name { font-size: 16px; font-weight: 600; }
    .summary-bar {
      background: #fff; padding: 8px 16px; border-radius: 6px; margin-bottom: 8px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.06); font-size: 13px;
    }
    .device-grid { display: flex; flex-direction: column; gap: 4px; }
    .device-card {
      display: flex; align-items: center; gap: 12px; background: #fff;
      padding: 12px 16px; border-radius: 8px; cursor: pointer;
      box-shadow: 0 1px 2px rgba(0,0,0,0.06); transition: all 0.2s;
    }
    .device-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .device-status {
      width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
    }
    .device-status.online { background: #52c41a; }
    .device-status.offline { background: #ff4d4f; }
    .device-info { flex: 1; display: flex; flex-direction: column; }
    .device-info small { color: #999; font-size: 11px; }
    :host-context(.dark-theme) .project-title-bar,
    :host-context(.dark-theme) .summary-bar,
    :host-context(.dark-theme) .device-card { background: #1f1f1f; }
  `]
})
export class ProjectsComponent implements OnInit {
  token = inject(TokenService);
  router = inject(Router);
  private api = inject(ApiService);
  private msg = inject(NzMessageService);

  loading = signal(false);
  devices = signal<DeviceEntity[]>([]);
  flatNodes = signal<FlatNode[]>([]);
  productNames: Record<string, string> = {};

  ngOnInit(): void {
    if (this.token.currentRootSpaceId) {
      this.loadGraph();
    }
  }

  private loadGraph(): void {
    const rootId = this.token.currentRootSpaceId;
    if (!rootId) return;
    this.loading.set(true);
    this.api.getSpaceGraph(rootId).subscribe({
      next: (graph) => {
        this.devices.set(graph.devices || []);
        this.loading.set(false);
        if (graph.devices?.length && this.token.currentOrgId) {
          this.loadProductNames(this.token.currentOrgId);
        }
      },
      error: (err) => { this.msg.error(err.message); this.loading.set(false); }
    });
  }

  private loadProductNames(orgId: string): void {
    this.api.getVisibleProducts(orgId).subscribe({
      next: (products) => {
        products.forEach(p => { if (p.model) this.productNames[p.model] = productDisplayName(p); });
      }
    });
  }

  getDeviceName(d: DeviceEntity): string {
    const model = extractModelFromUrn(d.type);
    return (model && this.productNames[model]) || extractTypeName(d.type) || d.type || d.did || '未知设备';
  }
}
