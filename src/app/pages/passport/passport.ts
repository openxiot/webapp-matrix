import { Component, computed, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { rxResource } from '@angular/core/rxjs-interop';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { AccountService } from '../../service/account.service';
import { UserService } from '../../service/user.service';
import { Oauth2Configuration } from '../../typedef/define/oauth/Oauth2Configuration';

const PLATFORM_ICONS: Record<string, string> = {
  dingtalk: 'dingding',
  wechat: 'wechat',
  github: 'github',
  google: 'google',
  facebook: 'facebook',
};

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
export class Passport {
  private readonly title = inject(Title);
  private readonly msg = inject(NzMessageService);
  private readonly service = inject(UserService);
  private readonly account = inject(AccountService);

  /** 登录平台列表（含加载/错误状态），来自 OAuth2 配置接口 */
  readonly platforms = rxResource<Oauth2Configuration[], void>({
    stream: () => this.service.getUserPlatforms(),
  });
  readonly list = computed(() => this.platforms.value() ?? []);
  readonly config = computed(() => this.list().find((x) => x.platformId === 'github'));
  readonly others = computed(() =>
    this.list().filter((x) => x.platformId !== this.config()?.platformId),
  );

  readonly redirectUrl = `${window.location.href.split('#')[0]}#passport/callback`;

  constructor() {
    this.title.setTitle('登录');
    this.account.clear();

    // 加载失败时弹出提示（响应 error signal 变化）
    effect(() => {
      const error = this.platforms.error();
      if (error) {
        this.msg.warning((error as { message?: string })?.message ?? String(error));
      }
    });
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
    return PLATFORM_ICONS[platformId] ?? 'question';
  }

  private getAuthorizeURL(platformId: string): string | null {
    for (const x of this.list()) {
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
    const state = btoa(String.fromCharCode(...new TextEncoder().encode(this.redirectUrl)));

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
