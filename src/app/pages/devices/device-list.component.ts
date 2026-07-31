import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NzListModule } from 'ng-zorro-antd/list';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TokenService } from '../../services/token.service';
import { ApiService } from '../../services/api.service';
import { DeviceEntity, extractModelFromUrn, extractTypeName, productDisplayName } from '../../models/api.models';

@Component({
  selector: 'app-device-list',
  standalone: true,
  imports: [CommonModule, NzListModule, NzIconModule, NzTagModule, NzSpinModule, NzEmptyModule, NzCardModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h2>设备</h2>
        <span class="device-count" *ngIf="devices().length > 0">{{ devices().length }} 个设备</span>
      </div>

      <nz-spin [nzSpinning]="loading()" class="content-spin">
        <nz-empty *ngIf="!loading() && !token.currentRootSpaceId"
                  nzNotFoundContent="请先在「我」的页面选择项目"
                  [nzNotFoundFooter]="projectFooter">
        </nz-empty>
        <ng-template #projectFooter>
          <button nz-button nzType="primary" (click)="router.navigate(['/projects/list'])">选择项目</button>
        </ng-template>

        <nz-empty *ngIf="!loading() && token.currentRootSpaceId && devices().length === 0"
                  nzNotFoundContent="暂无设备"></nz-empty>

        <div class="device-grid" *ngIf="devices().length > 0">
          <div class="device-card" *ngFor="let d of devices()" (click)="router.navigate(['/devices', d.did])">
            <div class="device-icon">
              <span nz-icon nzType="appstore" nzTheme="fill"></span>
            </div>
            <div class="device-body">
              <div class="device-name">
                <span class="status-dot" [class.online]="d.online" [class.offline]="!d.online"></span>
                <strong>{{ getDeviceName(d) }}</strong>
              </div>
              <div class="device-meta">
                <nz-tag nzSize="small">{{ d.online ? '在线' : '离线' }}</nz-tag>
                <small>{{ d.protocol || '-' }}</small>
                <small *ngIf="d.space?.spaceId">空间: {{ d.space?.spaceId | slice:0:12 }}...</small>
              </div>
            </div>
            <span nz-icon nzType="right" nzTheme="outline" style="color:#ccc"></span>
          </div>
        </div>
      </nz-spin>
    </div>
  `,
  styles: [`
    .page-container { padding: 24px; max-width: 800px; margin: 0 auto; }
    .page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
    .device-count { color: #999; font-size: 13px; }
    .content-spin { min-height: 300px; }
    .device-grid { display: flex; flex-direction: column; gap: 6px; }
    .device-card {
      display: flex; align-items: center; gap: 12px; background: #fff;
      padding: 12px 16px; border-radius: 8px; cursor: pointer;
      box-shadow: 0 1px 2px rgba(0,0,0,0.06); transition: all 0.2s;
    }
    .device-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .device-icon {
      width: 40px; height: 40px; border-radius: 10px; background: #e6f7ff;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; color: #0D84FF; flex-shrink: 0;
    }
    .device-body { flex: 1; }
    .device-name { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .status-dot.online { background: #52c41a; }
    .status-dot.offline { background: #ff4d4f; }
    .device-meta { display: flex; align-items: center; gap: 8px; }
    .device-meta small { color: #999; font-size: 11px; }
    :host-context(.dark-theme) .device-card { background: #1f1f1f; }
    :host-context(.dark-theme) .device-icon { background: #111d2c; color: #177ddc; }
  `]
})
export class DeviceListComponent implements OnInit {
  token = inject(TokenService);
  router = inject(Router);
  private api = inject(ApiService);
  private msg = inject(NzMessageService);

  devices = signal<DeviceEntity[]>([]);
  loading = signal(false);
  productNames: Record<string, string> = {};

  ngOnInit(): void {
    if (this.token.currentRootSpaceId) this.loadDevices();
  }

  private loadDevices(): void {
    const rootId = this.token.currentRootSpaceId;
    if (!rootId) return;
    this.loading.set(true);
    this.api.getSpaceGraph(rootId).subscribe({
      next: (graph) => {
        this.devices.set(graph.devices || []);
        this.loading.set(false);
        if (graph.devices?.length && this.token.currentOrgId) {
          this.api.getVisibleProducts(this.token.currentOrgId).subscribe({
            next: (products) => {
              products.forEach(p => { if (p.model) this.productNames[p.model] = productDisplayName(p); });
            }
          });
        }
      },
      error: (err) => { this.msg.error(err.message); this.loading.set(false); }
    });
  }

  getDeviceName(d: DeviceEntity): string {
    const model = extractModelFromUrn(d.type);
    return (model && this.productNames[model]) || extractTypeName(d.type) || d.type || d.did || '未知设备';
  }
}
