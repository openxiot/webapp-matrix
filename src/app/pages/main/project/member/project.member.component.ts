import { Component, computed, OnInit, signal, ViewContainerRef } from '@angular/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { ActivatedRoute } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Location } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { AccountService } from '../../../../service/account.service';
import { MatrixService } from '../../../../service/matrix.service';
import { MainI18nService } from '../../../../service/i18n.service';
import { BreadcrumbTranslateDirective } from '../../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { NzModalService } from 'ng-zorro-antd/modal';
import { ConfirmComponent } from '../../../../common/dialog/confirm/confirm.component';
import { ProjectMemberAddComponent } from './member.add.component';
import { OrganizationMember } from '../../../../typedef/define/user/UserOrganization';
import { SpaceEntity } from '../../../../typedef/define/space/SpaceEntity';

/**
 * 项目成员管理：展示项目（根空间）的成员列表（虚拟组织），
 * 当前组织管理员可添加 / 移除成员。
 */
@Component({
  selector: 'project-member',
  standalone: true,
  templateUrl: './project.member.component.html',
  styleUrl: './project.member.component.less',
  imports: [
    NzPageHeaderModule,
    NzBreadCrumbModule,
    NzSpinModule,
    NzButtonModule,
    NzTableModule,
    NzTagModule,
    NzDescriptionsModule,
    TranslatePipe,
    BreadcrumbTranslateDirective,
  ],
  providers: [NzModalService],
})
export class ProjectMemberComponent implements OnInit {
  /** 根空间（项目）id */
  rootId = signal('');

  /** 当前项目（根空间） */
  space = signal<SpaceEntity | null>(null);

  /** 项目成员列表 */
  members = signal<OrganizationMember[]>([]);

  loading = signal(false);

  /** 当前账号是否为当前组织的管理员（决定能否添加/移除成员） */
  readonly isAdmin = computed(() => {
    const me = this.account.user();
    const org = this.account.organization();
    const member = org.members.find((m) => m.userId === me.id);
    return member !== undefined && member.role === 'admin';
  });

  constructor(
    public i18n: MainI18nService,
    private modal: NzModalService,
    private viewContainerRef: ViewContainerRef,
    protected location: Location,
    private route: ActivatedRoute,
    private account: AccountService,
    private msg: NzMessageService,
    private matrix: MatrixService,
  ) {}

  ngOnInit() {
    this.route.params.subscribe((params) => {
      const id = params['id'] || this.account.space().id || '';
      this.rootId.set(id);
      if (id) {
        this.load(id);
      }
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    forkJoin({
      space: this.matrix.getSpace(id),
      members: this.matrix.listMembers(id),
    }).subscribe({
      next: ({ space, members }) => {
        this.space.set(space);
        this.members.set(members);
        this.loading.set(false);
      },
      error: (error) => {
        this.msg.warning(error?.message ?? error);
        this.loading.set(false);
      },
    });
  }

  /** 添加项目成员（当前账号为创建者） */
  protected addMember() {
    const modal = this.modal.create<ProjectMemberAddComponent, undefined, string>({
      nzTitle: this.i18n.translate.instant('添加成员'),
      nzContent: ProjectMemberAddComponent,
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
        this.matrix.addMember(this.rootId(), result).subscribe({
          next: () => {
            this.msg.success(this.i18n.translate.instant('添加成员成功'));
            this.load(this.rootId());
          },
          error: (error) => {
            this.msg.warning(error?.message ?? error);
            this.loading.set(false);
          },
        });
      }
    });
  }

  /** 移除项目成员（含创建者） */
  protected removeMember(member: OrganizationMember) {
    const modal = this.modal.create<ConfirmComponent, string, string>({
      nzTitle: this.i18n.translate.instant('您真的要移除这个成员吗？'),
      nzContent: ConfirmComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: member.name,
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
        this.doRemoveMember(member);
      }
    });
  }

  private doRemoveMember(member: OrganizationMember): void {
    this.loading.set(true);
    this.matrix.removeMember(this.rootId(), member.userId).subscribe({
      next: () => {
        this.msg.success(this.i18n.translate.instant('移除成员成功'));
        this.load(this.rootId());
      },
      error: (error) => {
        this.msg.warning(error?.message ?? error);
        this.loading.set(false);
      },
    });
  }
}
