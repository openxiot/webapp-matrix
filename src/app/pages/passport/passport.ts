import { Component, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { AccountService } from '../../service/account.service';
import { MatrixService } from '../../service/matrix.service';
import { Oauth2Configuration } from '../../typedef/define/oauth/Oauth2Configuration';

@Component({
  selector: 'app-passport',
  imports: [
    NzLayoutModule,
    NzCardModule,
    NzButtonModule,
    NzIconModule,
    NzDividerModule,
    NzTooltipModule,
    NzSpinModule,
  ],
  templateUrl: './passport.html',
  styleUrl: './passport.less',
})
export class Passport implements OnInit {
  loading: boolean = true;
  list: Oauth2Configuration[] = [];
  config: Oauth2Configuration | undefined = undefined;
  redirectUrl: string = '';

  constructor(
    private title: Title,
    private msg: NzMessageService,
    private service: MatrixService,
    private account: AccountService,
  ) {}

  ngOnInit() {
    this.title.setTitle('登录');
    this.account.clear();
    this.loadOauth2Configurations();

    const baseUrl = window.location.href.split('#')[0];
    this.redirectUrl = baseUrl + '#passport/callback';
  }

  open(config: Oauth2Configuration): void {
    if (!config.available) {
      this.msg.info('该平台暂未开放');
      return;
    }

    const url = this.getAuthorizeURL(config.platformId);
    if (url == null) {
      this.msg.error('AuthorizeURL is null');
      return;
    }

    window.location.href = url;
  }

  iconOf(platformId: string): string {
    switch (platformId) {
      case 'dingtalk':
        return 'dingding';
      case 'wechat':
        return 'wechat';
      case 'github':
        return 'github';
      case 'google':
        return 'google';
      case 'facebook':
        return 'facebook';
      default:
        return 'question';
    }
  }

  private loadOauth2Configurations(): void {
    this.loading = true;

    this.service.getDeveloperPlatforms().subscribe({
      next: (data) => {
        this.list = data;
        this.config = data.find((x) => x.platformId === 'github');
        this.loading = false;
      },
      error: (error) => {
        this.msg.warning(error);
        this.loading = false;
      },
    });
  }

  private getAuthorizeURL(platformId: string): string | null {
    for (const x of this.list) {
      if (x.platformId === platformId) {
        return this.getOAuthURL(x);
      }
    }

    return null;
  }

  private getOAuthURL(x: Oauth2Configuration): string {
    const callback0 = decodeURIComponent(x.callbackUrl);
    const callback1 = encodeURIComponent(x.callbackUrl);
    const clientId = x.clientId;
    const url = x.authorizeUrl;

    // 兼容非 latin1 字符的 base64
    const state = btoa(unescape(encodeURIComponent(this.redirectUrl)));

    switch (x.platformId) {
      case 'feishu': {
        return `${url}?app_id=${clientId}&redirect_uri=${callback0}&scope=passport:session_mask:readonly&state=${state}`;
      }

      case 'wechat': {
        return `${url}?appid=${clientId}&redirect_uri=${callback1}&response_type=code&scope=snsapi_login&state=${state}`;
      }

      case 'xiaomi': {
        return `${url}?client_id=${clientId}&response_type=code&redirect_uri=${callback0}&state=${state}`;
      }

      case 'google': {
        const scope = 'openid profile email';
        return `${url}?client_id=${clientId}&response_type=code&redirect_uri=${callback0}&state=${state}&include_granted_scopes=true&scope=${scope}&prompt=consent`;
      }

      // github账号，需要scope=user:email才能拿到邮箱。
      case 'github':
      default: {
        const scope = 'user:email';
        return `${url}?client_id=${clientId}&response_type=code&redirect_uri=${callback0}&prompt=consent&scope=${scope}&state=${state}`;
      }
    }
  }
}
