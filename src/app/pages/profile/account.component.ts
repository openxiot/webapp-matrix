import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TokenService } from '../../services/token.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [
    CommonModule, NzCardModule, NzIconModule, NzAvatarModule,
    NzDescriptionsModule, NzButtonModule, NzPageHeaderModule, NzBreadCrumbModule, NzDividerModule,
  ],
  template: `
    <div class="page-container">
      <nz-page-header (nzBack)="router.navigate(['/profile'])" nzBackIcon>
        <nz-breadcrumb nz-page-header-breadcrumb nzSeparator=">">
          <nz-breadcrumb-item><a (click)="router.navigate(['/profile'])">我</a></nz-breadcrumb-item>
          <nz-breadcrumb-item>账号详情</nz-breadcrumb-item>
        </nz-breadcrumb>
      </nz-page-header>

      <!-- Profile header -->
      <nz-card class="header-card">
        <div class="profile-header">
          <nz-avatar
            [nzSize]="64"
            nzIcon="user"
            [nzText]="(token.username || '?').charAt(0).toUpperCase()"
            nzColor="#0D84FF">
          </nz-avatar>
          <div class="profile-info">
            <h3>{{ token.username || '未登录' }}</h3>
            <span class="platform">{{ token.platform || '' }}</span>
          </div>
        </div>
      </nz-card>

      <!-- Account info -->
      <nz-card nzTitle="账号信息" class="info-card">
        <nz-descriptions [nzColumn]="1" [nzSize]="'small'">
          <nz-descriptions-item nzTitle="用户名">{{ token.username || '-' }}</nz-descriptions-item>
          <nz-descriptions-item nzTitle="平台">{{ token.platform || '-' }}</nz-descriptions-item>
          <nz-descriptions-item nzTitle="当前组织">{{ token.currentOrgName || '未选择' }}</nz-descriptions-item>
          <nz-descriptions-item nzTitle="当前项目">{{ token.currentRootSpaceName || '未选择' }}</nz-descriptions-item>
        </nz-descriptions>
      </nz-card>

      <!-- Logout -->
      <nz-card class="logout-card" nzHoverable (click)="logout()">
        <div class="logout-item">
          <span nz-icon nzType="logout" nzTheme="outline" style="color:#ff4d4f;font-size:20px"></span>
          <span class="logout-text">退出登录</span>
          <span nz-icon nzType="right" nzTheme="outline" style="color:#ff4d4f"></span>
        </div>
      </nz-card>
    </div>
  `,
  styles: [`
    .page-container { padding: 0 24px 24px; max-width: 600px; margin: 0 auto; }
    .header-card { margin-bottom: 16px; }
    .profile-header { display: flex; align-items: center; gap: 16px; }
    .profile-info h3 { margin: 0 0 4px; font-size: 20px; font-weight: 600; }
    .platform { color: #999; font-size: 13px; }
    .info-card { margin-bottom: 16px; }
    .logout-card { margin-top: 16px; }
    .logout-item { display: flex; align-items: center; gap: 12px; }
    .logout-text { flex: 1; color: #ff4d4f; font-weight: 500; font-size: 15px; }
  `]
})
export class AccountComponent {
  router = inject(Router);
  token = inject(TokenService);
  private msg = inject(NzMessageService);

  logout(): void {
    this.token.clear();
    this.msg.success('已退出登录');
    this.router.navigate(['/login']);
  }
}
