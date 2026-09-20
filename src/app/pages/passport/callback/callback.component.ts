import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AccountService } from '@app/service/account.service';
import { User } from '../../../typedef/define/user/User';

@Component({
  selector: 'app-passport-callback',
  imports: [NzSpinModule, TranslatePipe],
  templateUrl: './callback.component.html',
  styleUrl: './callback.component.less',
})
export class CallbackComponent implements OnInit {
  loading = signal(true);

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private account: AccountService,
    private msg: NzMessageService,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.getProfile();
  }

  private getProfile() {
    const { token, uid: id, name, avatar, email, platform } = this.route.snapshot.queryParams;
    this.save(token, name, avatar, email, id, platform);
  }

  private save(token: string, name: string, avatar: string, email: string, id: string, platform: string) {
    if (!token) {
      this.loading.set(false);
      this.msg.info(this.translate.instant('登录失败, token is null'));
      return;
    }

    const user: User = new User();
    user.name = name;
    user.id = id;
    user.avatar = avatar;
    user.email = email;
    user.token = token;
    user.platform = platform;

    this.account.setUser(user);

    const redirect = this.route.snapshot.queryParams['redirect'];
    const target = redirect && redirect.startsWith('/') ? redirect : '/main/dashboard';
    // 跳转后本页即被销毁，无需再关掉 loading
    void this.router.navigateByUrl(target);
  }
}
