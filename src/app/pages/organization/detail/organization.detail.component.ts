import { Component, OnInit, signal } from '@angular/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { NzSpaceModule } from 'ng-zorro-antd/space';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { ActivatedRoute, Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { DatePipe, Location } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AccountService } from '../../../service/account.service';
import { UserOrganizationService } from '../../../service/user.organization.service';
import { BreadcrumbTranslateDirective } from '../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { Organization } from '../../../typedef/define/user/Organization';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzTableModule } from 'ng-zorro-antd/table';

@Component({
  selector: 'organization-detail',
  standalone: true,
  templateUrl: './organization.detail.component.html',
  styleUrl: './organization.detail.component.less',
  imports: [
    NzPageHeaderModule,
    NzBreadCrumbModule,
    NzSpinModule,
    NzCardModule,
    NzButtonModule,
    NzCheckboxModule,
    NzFormModule,
    NzInputModule,
    NzStepsModule,
    NzSpaceModule,
    NzDividerModule,
    TranslatePipe,
    BreadcrumbTranslateDirective,
    NzDescriptionsModule,
    DatePipe,
    NzTableModule,
  ],
})
export class OrganizationDetailComponent implements OnInit {
  loading = signal(false);
  id = signal('');
  organization = signal(new Organization());

  constructor(
    protected location: Location,
    private router: Router,
    private route: ActivatedRoute,
    private account: AccountService,
    private msg: NzMessageService,
    private service: UserOrganizationService,
  ) {
  }

  ngOnInit() {
    this.route.params.subscribe((params) => {
      this.id.set(params['code'] || '');
      this.load();
    });
  }

  private load(): void {
    this.loading.set(true);
    this.service.getOrganization(this.id()).subscribe({
      next: (data) => {
        this.organization.set(data);
        this.loading.set(false);
      },
      error: (error) => {
        this.msg.warning(error);
        this.loading.set(false);
      },
    });
  }

  // protected submitForm() {
  //   const name = this.form.value.name || 'null';
  //
  //   this.loading.set(true);
  //   this.service.updateOrganizationName(this.id(), name).subscribe({
  //     next: () => {
  //       console.log('updateOrganizationName ok');
  //       this.loading.set(false);
  //       this.router.navigate(['/']).then(() => {});
  //     },
  //     error: (error) => {
  //       this.msg.warning(error);
  //       this.loading.set(false);
  //     },
  //   });
  // }
}
