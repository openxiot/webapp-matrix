import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { AccountService } from '../../service/account.service';
import { Developer } from '../../typedef/define/developer/Developer';

@Component({
  selector: 'app-passport-callback',
  imports: [NzSpinModule],
  templateUrl: './callback.html',
  styleUrl: './callback.less',
})
export class Callback implements OnInit {
  loading: boolean = true;

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
    const token = this.route.snapshot.queryParams['token'];
    const id = this.route.snapshot.queryParams['uid'];
    const name = this.route.snapshot.queryParams['name'];
    const avatar = this.route.snapshot.queryParams['avatar'];
    const email = this.route.snapshot.queryParams['email'];
    const platform = this.route.snapshot.queryParams['platform'];
    this.save(token, name, avatar, email, id, platform);
  }

  private save(token: string, name: string, avatar: string, email: string, id: string, platform: string) {
    const developer: Developer = new Developer();
    developer.name = name;
    developer.uid = id;
    developer.avatar = avatar;
    developer.email = email;
    developer.token = token;
    developer.platform = platform;

    this.account.setDeveloper(developer);

    if (developer.token !== null && developer.token !== '') {
      const redirect = this.route.snapshot.queryParams['redirect'];
      const target = redirect && redirect.startsWith('/') ? redirect : '/project';
      this.router
        .navigateByUrl(target)
        .then(() => {
          this.loading = false;
        });
    } else {
      this.msg.info('登录失败, token is null');
    }
  }
}
