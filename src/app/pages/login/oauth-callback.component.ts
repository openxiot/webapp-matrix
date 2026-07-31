import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TokenService } from '../../services/token.service';

@Component({
  selector: 'app-oauth-callback',
  standalone: true,
  imports: [NzSpinModule],
  template: `
    <div class="callback-container">
      <nz-spin nzTip="登录中..."></nz-spin>
    </div>
  `,
  styles: [`
    .callback-container {
      height: 100vh; display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #0D84FF 0%, #005BBF 100%);
    }
  `]
})
export class OauthCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private token = inject(TokenService);
  private msg = inject(NzMessageService);

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const token = params.get('token');
    const name = params.get('name');
    const avatar = params.get('avatar');
    const platform = params.get('platform');

    if (token) {
      this.token.token = token;
      this.token.username = name;
      this.token.avatar = avatar;
      this.token.platform = platform;
      this.token.developerId = this.token.extractDeveloperIdFromToken();
      this.msg.success('登录成功');
      this.router.navigate(['/projects']);
    } else {
      this.msg.error('登录失败：未收到有效的授权信息');
      this.router.navigate(['/login']);
    }
  }
}
