import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzCardModule } from 'ng-zorro-antd/card';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [NzPageHeaderModule, NzBreadCrumbModule, NzCardModule],
  template: `
    <div class="page-container">
      <nz-page-header (nzBack)="router.navigate(['/profile'])" nzBackIcon>
        <nz-breadcrumb nz-page-header-breadcrumb nzSeparator=">">
          <nz-breadcrumb-item><a (click)="router.navigate(['/profile'])">我</a></nz-breadcrumb-item>
          <nz-breadcrumb-item>关于</nz-breadcrumb-item>
        </nz-breadcrumb>
      </nz-page-header>

      <div class="about-content">
        <div class="about-logo">
          <div class="logo-icon">W</div>
        </div>
        <h2 class="app-name">微矩阵</h2>
        <p class="app-version">v1.0.0</p>
        <p class="app-desc">物联网设备管理与监控平台</p>
      </div>
    </div>
  `,
  styles: [`
    .page-container { padding: 0 24px 24px; max-width: 600px; margin: 0 auto; }
    .about-content {
      text-align: center; padding: 80px 24px;
    }
    .about-logo { margin-bottom: 20px; }
    .logo-icon {
      display: inline-flex; width: 80px; height: 80px; border-radius: 20px;
      background: linear-gradient(135deg, #0D84FF 0%, #005BBF 100%);
      align-items: center; justify-content: center;
      font-size: 40px; font-weight: 800; color: #fff;
    }
    .app-name { font-size: 24px; font-weight: 700; margin: 0 0 8px; }
    .app-version { color: #999; font-size: 15px; margin: 0 0 24px; }
    .app-desc { color: #666; font-size: 14px; }
    :host-context(.dark-theme) .app-desc { color: #a6a6a6; }
  `]
})
export class AboutComponent {
  router = inject(Router);
}
