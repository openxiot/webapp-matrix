import { Component, OnInit, signal, ViewContainerRef } from '@angular/core';
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
import { Organization, OrganizationMember } from '../../../typedef/define/user/Organization';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzTableModule } from 'ng-zorro-antd/table';
import { ConfirmComponent } from '../../../common/dialog/confirm/confirm.component';
import { MainI18nService } from '../../../service/i18n.service';
import { NzModalService } from 'ng-zorro-antd/modal';
import { StringValueEditComponent } from '../../../common/dialog/string/string.value.edit.component';
import { StringValue } from '../../../common/dialog/string/StringValue';
import { MemberAddComponent } from '../../../common/dialog/member/member.add.component';

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
  providers: [NzModalService],
})
export class OrganizationDetailComponent implements OnInit {
  loading = signal(false);
  id = signal('');
  organization = signal(new Organization());

  constructor(
    public i18n: MainI18nService,
    private modal: NzModalService,
    private viewContainerRef: ViewContainerRef,
    protected location: Location,
    private router: Router,
    private route: ActivatedRoute,
    private account: AccountService,
    private msg: NzMessageService,
    private service: UserOrganizationService,
  ) {}

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

  protected removeOrganization() {
    const modal = this.modal.create<ConfirmComponent, string, string>({
      nzTitle: this.i18n.translate.instant('您真的要删除这个组织吗？'),
      nzContent: ConfirmComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: this.organization().name,
      nzFooter: [
        {
          label: this.i18n.translate.instant('取消'),
          onClick: (component) => component!.cancel(),
        },
        {
          label: this.i18n.translate.instant('确认'),
          danger: true,
          type: 'primary',
          onClick: (component) => component!.ok(),
        },
      ],
    });

    modal.afterClose.subscribe((result) => {
      if (result) {
        this.doRemoveOrganization();
      }
    });
  }

  protected doRemoveOrganization() {
    this.loading.set(true);
    this.service.removeOrganization(this.id()).subscribe({
      next: () => {
        this.msg.success('删除成功');
        this.location.back();
      },
      error: (error) => {
        this.msg.warning(error);
        this.loading.set(false);
      },
    });
  }

  protected addMember() {
    const modal = this.modal.create<MemberAddComponent, undefined, OrganizationMember>({
      nzTitle: this.i18n.translate.instant('添加成员'),
      nzContent: MemberAddComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzFooter: [
        {
          label: this.i18n.translate.instant('取消'),
          onClick: (component) => component!.cancel(),
        },
        {
          label: this.i18n.translate.instant('确认'),
          type: 'primary',
          disabled: (component) => !component!.valid(),
          onClick: (component) => component!.ok(),
        },
      ],
    });

    modal.afterClose.subscribe((result) => {
      if (result) {
        this.loading.set(true);
        this.service.addOrganizationMember(this.id(), result).subscribe({
          next: () => {
            this.msg.success('添加成员成功');
            this.load();
          },
          error: (error) => {
            this.msg.warning(error);
            this.loading.set(false);
          },
        });
      }
    });
  }

  protected removeMember(member: OrganizationMember) {
    this.loading.set(true);
    this.service.removeOrganizationMember(this.id(), member.userId).subscribe({
      next: () => {
        this.msg.success('删除成功');
        this.load();
      },
      error: (error) => {
        this.msg.warning(error);
        this.loading.set(false);
      },
    });
  }

  protected editOrganizationName() {
    const modal = this.modal.create<StringValueEditComponent, StringValue, string>({
      nzTitle: this.i18n.translate.instant('修改组织名称'),
      nzContent: StringValueEditComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: new StringValue(this.organization().name),
      nzFooter: [
        {
          label: this.i18n.translate.instant('取消'),
          onClick: (component) => component!.cancel(),
        },
        {
          label: this.i18n.translate.instant('确认'),
          danger: true,
          type: 'primary',
          disabled: (component) => !component!.changed(),
          onClick: (component) => component!.ok(),
        },
      ],
    });

    modal.afterClose.subscribe((result) => {
      if (result) {
        this.loading.set(true);
        this.service.updateOrganizationName(this.organization().id, result).subscribe({
          next: () => {
            this.msg.success('修改组织名称成功');
            this.load();
          },
          error: (error) => {
            this.msg.warning(error);
            this.loading.set(false);
          },
        });
      }
    });
  }
}
