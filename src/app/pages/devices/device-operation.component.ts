import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-device-operation',
  standalone: true,
  imports: [CommonModule, FormsModule, NzIconModule, NzButtonModule, NzCardModule, NzSwitchModule, NzSpinModule, NzPageHeaderModule, NzBreadCrumbModule, NzEmptyModule],
  template: `
    <div class="page-container">
      <nz-page-header (nzBack)="router.navigate(['/devices', did])" nzBackIcon>
        <nz-breadcrumb nz-page-header-breadcrumb nzSeparator=">">
          <nz-breadcrumb-item><a (click)="router.navigate(['/devices'])">设备列表</a></nz-breadcrumb-item>
          <nz-breadcrumb-item>设备操作</nz-breadcrumb-item>
        </nz-breadcrumb>
      </nz-page-header>

      <nz-spin [nzSpinning]="loading()" class="content-spin">
        <!-- Remote preview placeholder (iframe) -->
        <nz-card class="preview-card" nzTitle="远程控制">
          <div class="preview-placeholder">
            <span nz-icon nzType="control" nzTheme="fill" style="font-size:48px;color:#0D84FF"></span>
            <h4>远程设备控制</h4>
            <p>设备 DID: {{ did }}</p>
            <p>远程预览功能开发中，后续将通过 iframe 集成设备控制面板。</p>
          </div>
        </nz-card>

        <!-- Basic controls placeholder -->
        <nz-card nzTitle="基本操作" *ngIf="switches().length > 0">
          <div class="switch-item" *ngFor="let s of switches()">
            <div class="switch-label">
              <span nz-icon nzType="power" nzTheme="outline"></span>
              <span>{{ s.label }}</span>
            </div>
            <nz-switch [(ngModel)]="s.isOn" (ngModelChange)="onSwitchChange(s, $event)"></nz-switch>
          </div>
        </nz-card>

        <nz-empty *ngIf="!loading()" nzNotFoundContent="未找到可操作的设备控制项"
                  style="margin-top: 24px"></nz-empty>
      </nz-spin>
    </div>
  `,
  styles: [`
    .page-container { padding: 0 24px 24px; max-width: 800px; margin: 0 auto; }
    .content-spin { min-height: 300px; }
    .preview-card { margin-bottom: 16px; }
    .preview-placeholder {
      text-align: center; padding: 48px 24px; color: #999;
    }
    .preview-placeholder h4 { margin: 16px 0 8px; font-size: 16px; color: #333; }
    .switch-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 0; border-bottom: 1px solid #f0f0f0;
    }
    .switch-item:last-child { border-bottom: none; }
    .switch-label { display: flex; align-items: center; gap: 8px; }
    :host-context(.dark-theme) .preview-placeholder h4 { color: #ccc; }
    :host-context(.dark-theme) .switch-item { border-bottom-color: #303030; }
  `]
})
export class DeviceOperationComponent implements OnInit {
  router = inject(Router);
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private msg = inject(NzMessageService);

  did = '';
  loading = signal(false);
  switches = signal<Array<{ label: string; isOn: boolean; siid: number; piid: number }>>([]);

  ngOnInit(): void {
    this.did = this.route.snapshot.paramMap.get('did') || '';
    // In a full implementation, load product instance and parse switches
    // For now, show placeholder
    this.loading.set(false);
  }

  onSwitchChange(s: any, checked: boolean): void {
    this.msg.info(`开关 "${s.label}" ${checked ? '开' : '关'}（功能开发中）`);
  }
}
