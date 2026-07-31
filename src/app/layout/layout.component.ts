import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../services/theme.service';
import { TokenService } from '../services/token.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive,
    NzLayoutModule, NzMenuModule, NzIconModule, NzSwitchModule,
    NzBadgeModule, NzTooltipModule,
  ],
  template: `
    <nz-layout class="app-layout">
      <!-- Sidebar -->
      <nz-sider
        nzCollapsible
        [(nzCollapsed)]="isCollapsed"
        [nzWidth]="220"
        [nzCollapsedWidth]="64"
        nzTheme="light"
        class="app-sider">
        <div class="sidebar-header">
          <span class="sidebar-logo" *ngIf="!isCollapsed">微矩阵</span>
          <span class="sidebar-logo-small" *ngIf="isCollapsed" nz-tooltip nzTooltipTitle="微矩阵">W</span>
        </div>
        <ul nz-menu nzMode="inline" nzTheme="light" class="sidebar-menu">
          <li nz-menu-item routerLink="/projects" routerLinkActive="ant-menu-item-selected">
            <span nz-icon nzType="apartment" nzTheme="outline"></span>
            <span>项目</span>
          </li>
          <li nz-menu-item routerLink="/devices" routerLinkActive="ant-menu-item-selected">
            <span nz-icon nzType="appstore" nzTheme="outline"></span>
            <span>设备</span>
          </li>
          <li nz-menu-item routerLink="/products" routerLinkActive="ant-menu-item-selected">
            <span nz-icon nzType="inbox" nzTheme="outline"></span>
            <span>产品</span>
          </li>
          <li nz-menu-item routerLink="/profile" routerLinkActive="ant-menu-item-selected">
            <span nz-icon nzType="user" nzTheme="outline"></span>
            <span>我</span>
          </li>
        </ul>
      </nz-sider>

      <!-- Right area -->
      <nz-layout>
        <!-- Header bar -->
        <nz-header class="app-header">
          <div class="header-left">
            <span class="header-org" *ngIf="token.currentOrgName">
              <span nz-icon nzType="team" nzTheme="outline"></span>
              {{ token.currentOrgName }}
            </span>
            <span class="header-separator" *ngIf="token.currentOrgName && token.currentRootSpaceName">/</span>
            <span class="header-project" *ngIf="token.currentRootSpaceName">
              <span nz-icon nzType="apartment" nzTheme="outline"></span>
              {{ token.currentRootSpaceName }}
            </span>
          </div>
          <div class="header-right">
            <nz-switch
              [ngModel]="themeService.theme() === 'dark'"
              (ngModelChange)="themeService.toggle()"
              nzCheckedChildren="🌙"
              nzUnCheckedChildren="☀️">
            </nz-switch>
            <span class="header-user" (click)="goToProfile()">
              <span nz-icon nzType="user" nzTheme="outline"></span>
              {{ token.username || '用户' }}
            </span>
          </div>
        </nz-header>

        <!-- Content -->
        <nz-content class="app-content">
          <router-outlet></router-outlet>
        </nz-content>
      </nz-layout>
    </nz-layout>
  `,
  styles: [`
    .app-layout { height: 100vh; }
    .app-sider {
      background: #fff;
      border-right: 1px solid #f0f0f0;
      overflow: auto;
    }
    .sidebar-header {
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-bottom: 1px solid #f0f0f0;
    }
    .sidebar-logo {
      font-size: 20px;
      font-weight: 700;
      color: #0D84FF;
      letter-spacing: 1px;
    }
    .sidebar-logo-small {
      font-size: 22px;
      font-weight: 800;
      color: #0D84FF;
    }
    .sidebar-menu {
      border-inline-end: none !important;
    }
    .app-header {
      background: #fff;
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #f0f0f0;
      height: 48px;
      line-height: 48px;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }
    .header-org, .header-project {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #595959;
    }
    .header-separator { color: #d9d9d9; font-weight: 300; }
    .header-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .header-user {
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      color: #595959;
    }
    .header-user:hover { color: #0D84FF; }
    .app-content {
      padding: 0;
      overflow-y: auto;
      background: #f5f5f5;
    }

    :host-context(.dark-theme) .app-sider {
      background: #141414;
      border-right-color: #303030;
    }
    :host-context(.dark-theme) .sidebar-header {
      border-bottom-color: #303030;
    }
    :host-context(.dark-theme) .sidebar-logo { color: #177ddc; }
    :host-context(.dark-theme) .app-header {
      background: #1f1f1f;
      border-bottom-color: #303030;
    }
    :host-context(.dark-theme) .app-content { background: #141414; }
    :host-context(.dark-theme) .header-org,
    :host-context(.dark-theme) .header-project,
    :host-context(.dark-theme) .header-user { color: #a6a6a6; }
    :host-context(.dark-theme) .header-user:hover { color: #177ddc; }
  `]
})
export class LayoutComponent {
  isCollapsed = false;
  themeService = inject(ThemeService);
  token = inject(TokenService);
  private router = inject(Router);

  goToProfile(): void {
    this.router.navigate(['/profile']);
  }
}
