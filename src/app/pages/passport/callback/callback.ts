import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { AccountService } from '../../../service/account.service';
import { User } from '../../../typedef/define/user/User';

@Component({
  selector: 'app-passport-callback',
  imports: [NzSpinModule],
  templateUrl: './callback.html',
  styleUrl: './callback.less',
})
export class Callback implements OnInit {
  loading = signal(true);

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private account: AccountService,
    private msg: NzMessageService,
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
      this.msg.info('登录失败, token is null');
      return;
    }

    const developer: User = new User();
    developer.name = name;
    developer.id = id;
    developer.avatar = avatar;
    developer.email = email;
    developer.token = token;
    developer.platform = platform;

    this.account.setUser(developer);

    const redirect = this.route.snapshot.queryParams['redirect'];
    const target = redirect && redirect.startsWith('/') ? redirect : '/project';
    // 跳转后本页即被销毁，无需再关掉 loading
    void this.router.navigateByUrl(target);
  }
}
