import { Component, OnInit, signal } from '@angular/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonComponent } from 'ng-zorro-antd/button';
import { NzWaveDirective } from 'ng-zorro-antd/core/wave';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { NzColDirective, NzRowDirective } from 'ng-zorro-antd/grid';
import { NzIconDirective } from 'ng-zorro-antd/icon';
import { BreadcrumbTranslateDirective } from '../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { UserOrganization } from '../../../typedef/define/user/UserOrganization';
import { AccountService } from '../../../service/account.service';
import { UserOrganizationService } from '../../../service/user.organization.service';

@Component({
  selector: 'main-organization',
  standalone: true,
  templateUrl: './organization.component.html',
  styleUrl: './organization.component.less',
  imports: [
    FormsModule,
    NzPageHeaderModule,
    NzBreadCrumbModule,
    BreadcrumbTranslateDirective,
    NzSpinModule,
    NzCardModule,
    NzTabsModule,
    NzTableModule,
    NzDescriptionsModule,
    NzButtonComponent,
    NzWaveDirective,
    RouterLink,
    TranslatePipe,
    NzColDirective,
    NzIconDirective,
    NzRowDirective,
  ],
})
export class OrganizationComponent implements OnInit {
  loading = signal(true);
  organizations = signal<UserOrganization[]>([]);

  constructor(
    public account: AccountService,
    private router: Router,
    private service: UserOrganizationService,
    private msg: NzMessageService,
  ) {}

  ngOnInit() {
    this.loadDataFromServer();
  }

  loadDataFromServer(): void {
    this.loading.set(true);
    this.service.getOrganizations().subscribe({
      next: (data) => {
        this.organizations.set(data);
        this.loading.set(false);
      },
      error: (error) => {
        this.msg.warning(error);
        this.loading.set(false);
      },
    });
  }

  protected clickOrganization(organization: UserOrganization) {
    if (this.account.organization().id === organization.id) {
      this.account.setOrganization(new UserOrganization());
    } else {
      this.account.setOrganization(organization);
    }

    this.router
      .navigate(['/'])
      .then(() => {
        console.log('clickOrganization ok!');
      })
      .catch((e) => {
        console.log('clickOrganization failed: ', e);
      });
  }
}
