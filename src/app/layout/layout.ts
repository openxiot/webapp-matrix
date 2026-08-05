import { Component, OnInit } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { AccountService } from '../service/account.service';
import pkg from '../../../package.json';

@Component({
  selector: 'app-layout',
  imports: [RouterLink, RouterOutlet, NzIconModule, NzLayoutModule, NzMenuModule],
  templateUrl: './layout.html',
  styleUrl: './layout.less',
})
export class Layout implements OnInit {
  isCollapsed = false;
  version: string = pkg.version;

  constructor(public account: AccountService) {}

  ngOnInit() {
    this.account.loadOrganizations();
  }
}
