import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TokenService } from '../../services/token.service';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, NzButtonModule, NzIconModule, NzSpinModule],
  template: `
    <div class="login-container">
      <div class="login-card">
        <div class="login-logo">
          <div class="logo-icon">W</div>
        </div>
        <h1 class="login-title">AI能源管理</h1>
        <p class="login-subtitle">AI Energy Management</p>

        <div class="login-actions">
          <button nz-button nzSize="large" class="btn-github" (click)="githubLogin()" [disabled]="!githubUrl || loading()">
            <span nz-icon nzType="github" nzTheme="fill"></span>
            {{ loading() ? '加载中...' : '使用 GitHub 登录' }}
          </button>
          <button nz-button nzSize="large" class="btn-test" (click)="testLogin()">
            <span nz-icon nzType="qrcode" nzTheme="outline"></span>
            使用测试账号登录
          </button>
        </div>

        <p class="login-version">v1.0.0</p>
      </div>
    </div>
  `,
  styles: [`
    .login-container {
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0D84FF 0%, #005BBF 100%);
    }
    .login-card {
      text-align: center;
      padding: 48px 40px;
      max-width: 400px;
      width: 100%;
    }
    .login-logo { margin-bottom: 24px; }
    .logo-icon {
      display: inline-flex;
      width: 80px;
      height: 80px;
      border-radius: 20px;
      background: rgba(255,255,255,0.2);
      align-items: center;
      justify-content: center;
      font-size: 40px;
      font-weight: 800;
      color: #fff;
    }
    .login-title {
      font-size: 28px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 8px;
    }
    .login-subtitle {
      font-size: 16px;
      color: rgba(255,255,255,0.7);
      margin-bottom: 60px;
    }
    .login-actions {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .login-actions button {
      width: 100%;
      height: 48px;
      border-radius: 24px;
      font-size: 16px;
      font-weight: 500;
    }
    .btn-github {
      background: #fff !important;
      color: #005BBF !important;
      border: none !important;
    }
    .btn-github:hover { background: #f0f0f0 !important; }
    .btn-test {
      background: transparent !important;
      color: #fff !important;
      border: 1px solid rgba(255,255,255,0.5) !important;
    }
    .btn-test:hover { border-color: #fff !important; }
    .login-loading { padding: 40px 0; }
    .login-version {
      margin-top: 80px;
      font-size: 12px;
      color: rgba(255,255,255,0.5);
    }
  `]
})
export class LoginComponent {
  private api = inject(ApiService);
  private token = inject(TokenService);
  private router = inject(Router);
  private msg = inject(NzMessageService);

  loading = signal(false);
  githubUrl = signal<string | null>(null);

  constructor() {
    if (this.token.isLoggedIn) {
      this.router.navigate(['/projects']);
      return;
    }
    this.loadGithubUrl();
  }

  private loadGithubUrl(): void {
    this.loading.set(true);
    this.api.getGithubPlatform().subscribe({
      next: (platform) => {
        const state = btoa('openxiot://oauth/callback').replace(/=+$/, '');
        const url = `${platform.authorizeUrl}?client_id=${platform.clientId}&redirect_uri=${platform.callbackUrl}&state=${state}&scope=read:user,user:email`;
        this.githubUrl.set(url);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  githubLogin(): void {
    const url = this.githubUrl();
    if (url) window.location.href = url;
  }

  testLogin(): void {
    const testToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tL2lzc3VlciIsInVwbiI6IjZhNGRhZmU1YTE3Nzg2ZGJlMDEyOTlhYyIsInVzZXJuYW1lIjoiZ2tjaXR5IiwiZ3JvdXBzIjpbImRldmVsb3BlciJdLCJiaXJ0aGRhdGUiOiJGcmkgSnVsIDE3IDAyOjE2OjAyIEdNVCAyMDI2IiwiZXhwIjoxNzg0ODU5MzYyLCJpYXQiOjE3ODQyNTQ1NjIsImp0aSI6ImRlM2NhMTRhLTkwMzUtNGQ3Zi05ZTJhLTM1MTg3YmIxMmYyNSJ9.Tw3RkfVCchzEDYQQs9pckQKsF6OoZZtXU6FbZYeNBc3McurOeKLKVQrOcH-usNEvJYgcbx-U1zoCREE9kdd0yylJmUQuopVX7gBCnCZU8-7dCZLQ6qYzhGLGOV-1GBIi3oE_PpiJxkBqYyW1diBesyo6aoAbgoVToX5hGJPjrHFnXDAyboZRX8wHsimSrAR98RyDwRTnnXMFhez0OPS4-y2FolN14dDB_0xN0vtzx1S4NGbbVq5F2f1pXIchanlUmHBb4SSDoeCp19QB7HnPZbx8U4qv-wVahvNg57R5EODsTLBZMKARUIfCYkAfdEhMbWBqvXjwpgetIbwf4KLNyw';
    this.token.token = testToken;
    this.token.username = 'gkcity';
    this.msg.success('登录成功');
    this.router.navigate(['/projects']);
  }
}
