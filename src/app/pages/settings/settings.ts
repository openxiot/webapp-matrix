import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzListModule } from 'ng-zorro-antd/list';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { AccountService } from '../../service/account.service';
import { ThemeService } from '../../service/theme.service';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, RouterLink, NzAvatarModule, NzIconModule, NzListModule, NzSwitchModule, NzTagModule],
  templateUrl: './settings.html',
  styleUrl: './settings.less',
})
export class Settings {
  constructor(
    public account: AccountService,
    public theme: ThemeService,
  ) {}

  initial(): string {
    return (this.account.user.name || 'U').charAt(0).toUpperCase();
  }
}
