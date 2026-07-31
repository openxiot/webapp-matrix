import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ApiService } from '../../services/api.service';
import { DeviceEntity, SpaceGraph, extractModelFromUrn, extractTypeName, productDisplayName } from '../../models/api.models';

@Component({
  selector: 'app-device-detail',
  standalone: true,
  imports: [
    CommonModule,
    NzDescriptionsModule, NzIconModule, NzButtonModule, NzTagModule,
    NzCardModule, NzSpinModule, NzPageHeaderModule, NzBreadCrumbModule, NzDividerModule, NzEmptyModule,
  ],
  template: `
    <div class="page-container" *ngIf="did">
      <nz-page-header (nzBack)="router.navigate(['/devices'])" nzBackIcon>
        <nz-breadcrumb nz-page-header-breadcrumb nzSeparator=">">
          <nz-breadcrumb-item><a (click)="router.navigate(['/devices'])">设备列表</a></nz-breadcrumb-item>
          <nz-breadcrumb-item>{{ getProductName() }}</nz-breadcrumb-item>
        </nz-breadcrumb>
      </nz-page-header>

      <nz-spin [nzSpinning]="loading()" class="content-spin">
        <nz-empty *ngIf="!device() && !loading()" nzNotFoundContent="设备未找到"></nz-empty>

        <div *ngIf="device() as d">
          <!-- Status header -->
          <nz-card class="status-card">
            <div class="device-header">
              <div class="device-icon">
                <span nz-icon nzType="appstore" nzTheme="fill"></span>
              </div>
              <div class="device-title">
                <h3>{{ getProductName() }}</h3>
                <div class="status-row">
                  <span class="status-indicator" [class.online]="d.online" [class.offline]="!d.online"></span>
                  <nz-tag [nzColor]="d.online ? 'green' : 'default'">{{ d.online ? '在线' : '离线' }}</nz-tag>
                </div>
              </div>
              <button nz-button nzType="primary" (click)="openOperation(d)" *ngIf="d.did">
                <span nz-icon nzType="control"></span>
                设备操作
              </button>
            </div>
          </nz-card>

          <!-- Detail info -->
          <nz-card class="info-card" nzTitle="设备信息">
            <nz-descriptions [nzColumn]="1" nzBordered [nzSize]="'small'">
              <nz-descriptions-item nzTitle="设备 ID">{{ d.did || '-' }}</nz-descriptions-item>
              <nz-descriptions-item nzTitle="设备类型">{{ extractTypeName(d.type) || d.type || '-' }}</nz-descriptions-item>
              <nz-descriptions-item nzTitle="通信协议">{{ d.protocol || '-' }}</nz-descriptions-item>
              <nz-descriptions-item nzTitle="在线状态">{{ d.online ? '在线' : '离线' }}</nz-descriptions-item>
              <nz-descriptions-item nzTitle="最后上线">{{ d.lastOnline ? (d.lastOnline | date:'yyyy-MM-dd HH:mm:ss') : '-' }}</nz-descriptions-item>
              <nz-descriptions-item nzTitle="最后下线">{{ d.lastOffline ? (d.lastOffline | date:'yyyy-MM-dd HH:mm:ss') : '-' }}</nz-descriptions-item>
              <nz-descriptions-item nzTitle="所属空间">{{ d.space?.spaceId || '-' }}</nz-descriptions-item>
            </nz-descriptions>
          </nz-card>
        </div>
      </nz-spin>
    </div>
  `,
  styles: [`
    .page-container { padding: 0 24px 24px; max-width: 800px; margin: 0 auto; }
    .content-spin { min-height: 300px; }
    .status-card { margin-bottom: 16px; }
    .device-header { display: flex; align-items: center; gap: 16px; }
    .device-icon {
      width: 56px; height: 56px; border-radius: 12px; background: #e6f7ff;
      display: flex; align-items: center; justify-content: center;
      font-size: 28px; color: #0D84FF; flex-shrink: 0;
    }
    .device-title { flex: 1; }
    .device-title h3 { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
    .status-row { display: flex; align-items: center; gap: 8px; }
    .status-indicator { width: 10px; height: 10px; border-radius: 50%; }
    .status-indicator.online { background: #52c41a; }
    .status-indicator.offline { background: #ff4d4f; }
    .info-card { margin-bottom: 16px; }
    :host-context(.dark-theme) .device-icon { background: #111d2c; color: #177ddc; }
  `]
})
export class DeviceDetailComponent implements OnInit {
  router = inject(Router);
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private msg = inject(NzMessageService);

  did = '';
  device = signal<DeviceEntity | undefined>(undefined);
  loading = signal(false);
  productNames: Record<string, string> = {};

  ngOnInit(): void {
    this.did = this.route.snapshot.paramMap.get('did') || '';
    if (this.did) this.loadDevice();
  }

  private loadDevice(): void {
    this.loading.set(true);
    // Try to find device from the current project's graph
    const rootId = localStorage.getItem('openxiot_prefs_current_root_space_id');
    if (!rootId) { this.loading.set(false); return; }

    this.api.getSpaceGraph(rootId).subscribe({
      next: (graph) => {
        const d = (graph.devices || []).find(dev => dev.did === this.did);
        this.device.set(d);
        this.loading.set(false);
        // Load product names
        const orgId = localStorage.getItem('openxiot_prefs_current_org_id');
        if (orgId) {
          this.api.getVisibleProducts(orgId).subscribe({
            next: (products) => {
              products.forEach(p => { if (p.model) this.productNames[p.model] = productDisplayName(p); });
            }
          });
        }
      },
      error: (err) => { this.msg.error(err.message); this.loading.set(false); }
    });
  }

  getProductName(): string {
    const d = this.device();
    if (!d) return '设备详情';
    const model = extractModelFromUrn(d.type);
    return (model && this.productNames[model]) || extractTypeName(d.type) || d.type || d.did || '设备详情';
  }

  extractTypeName = extractTypeName;

  openOperation(d: DeviceEntity): void {
    if (d.did) this.router.navigate(['/devices', d.did, 'operation']);
  }
}
