import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzListModule } from 'ng-zorro-antd/list';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme.service';
import { TokenService } from '../../services/token.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, NzCardModule, NzIconModule, NzSwitchModule, NzListModule, NzAvatarModule, FormsModule],
  template: `
    <div class="page-container">
      <!-- Profile header -->
      <nz-card class="profile-card" nzHoverable (click)="router.navigate(['/profile/account'])">
        <div class="profile-header">
          <nz-avatar
            [nzSize]="56"
            nzIcon="user"
            [nzText]="(token.username || '?').charAt(0).toUpperCase()"
            nzColor="#0D84FF">
          </nz-avatar>
          <div class="profile-info">
            <strong>{{ token.username || '未登录' }}</strong>
            <small>{{ token.platform || '' }}</small>
          </div>
          <span nz-icon nzType="right" nzTheme="outline" style="color:#ccc"></span>
        </div>
      </nz-card>

      <!-- Current org & project -->
      <div class="section">
        <h4 class="section-title">当前组织</h4>
        <nz-card class="setting-card" nzHoverable (click)="router.navigate(['/organizations'])">
          <div class="setting-item">
            <span nz-icon nzType="team" nzTheme="outline" style="color:#0D84FF;font-size:20px"></span>
            <div class="setting-info">
              <strong>{{ token.currentOrgName || '未选择组织' }}</strong>
              <small>选择组织后方可选择项目</small>
            </div>
            <span nz-icon nzType="right" nzTheme="outline" style="color:#ccc"></span>
          </div>
        </nz-card>
      </div>

      <div class="section">
        <h4 class="section-title">当前项目</h4>
        <nz-card class="setting-card" nzHoverable (click)="token.currentOrgName ? router.navigate(['/projects/list']) : null">
          <div class="setting-item">
            <span nz-icon nzType="apartment" nzTheme="outline" style="color:#0D84FF;font-size:20px"></span>
            <div class="setting-info">
              <strong>{{ token.currentRootSpaceName || '未选择项目' }}</strong>
              <small>{{ token.currentOrgName ? '点击切换项目' : '请先选择组织' }}</small>
            </div>
            <span nz-icon nzType="right" nzTheme="outline" style="color:#ccc"></span>
          </div>
        </nz-card>
      </div>

      <!-- Settings -->
      <div class="section">
        <h4 class="section-title">设置</h4>
        <nz-card class="setting-card">
          <div class="setting-item">
            <span nz-icon [nzType]="themeService.theme() === 'dark' ? 'moon' : 'sun'" nzTheme="outline"
                  style="color:#0D84FF;font-size:20px"></span>
            <div class="setting-info">
              <strong>{{ themeService.theme() === 'dark' ? '深色模式' : '浅色模式' }}</strong>
              <small>点击切换主题</small>
            </div>
            <nz-switch [ngModel]="themeService.theme() === 'dark'"
                       (ngModelChange)="themeService.toggle()">
            </nz-switch>
          </div>
        </nz-card>
      </div>

      <!-- Other -->
      <div class="section">
        <h4 class="section-title">其他</h4>
        <nz-card class="setting-card" nzHoverable (click)="router.navigate(['/profile/about'])">
          <div class="setting-item">
            <span nz-icon nzType="info-circle" nzTheme="outline" style="color:#0D84FF;font-size:20px"></span>
            <div class="setting-info">
              <strong>关于</strong>
              <small>应用信息与版本</small>
            </div>
            <span nz-icon nzType="right" nzTheme="outline" style="color:#ccc"></span>
          </div>
        </nz-card>
      </div>
    </div>
  `,
  styles: [`
    .page-container { padding: 16px 24px 24px; max-width: 600px; margin: 0 auto; }
    .profile-card { margin-bottom: 16px; }
    .profile-header { display: flex; align-items: center; gap: 16px; }
    .profile-info { flex: 1; display: flex; flex-direction: column; }
    .profile-info small { color: #999; font-size: 12px; }
    .section { margin-bottom: 8px; }
    .section-title {
      font-size: 13px; font-weight: 500; color: #999;
      margin: 12px 20px 8px; text-transform: uppercase;
    }
    .setting-card { margin-bottom: 4px; }
    .setting-item { display: flex; align-items: center; gap: 12px; }
    .setting-info { flex: 1; display: flex; flex-direction: column; }
    .setting-info small { color: #999; font-size: 12px; }
    :host-context(.dark-theme) .section-title { color: #666; }
  `]
})
export class ProfileComponent {
  router = inject(Router);
  themeService = inject(ThemeService);
  token = inject(TokenService);
}
