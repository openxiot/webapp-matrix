import { Component, computed, OnInit, signal, ViewContainerRef } from '@angular/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDividerModule } from 'ng-zorro-antd/divider';
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
import { ProjectMemberAddComponent, ProjectMemberAddResult } from './add/project.member.add.component';
import { ProjectMemberRoleComponent } from './role/project.member.role.component';
import { OrganizationMember } from '../../../../typedef/define/user/UserOrganization';
import { SpaceEntity } from '../../../../typedef/define/space/SpaceEntity';

/**
 * 项目成员管理：展示项目（根空间）的成员列表（访问条目 type = user）。
 * 项目管理员（自己的 user 条目 role = admin，或当前组织命中 organization 条目且本人为组织管理员）
 * 可添加 / 移除其他成员、调整角色；所有成员可退出项目（最后一个管理员不可退出）。
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
    NzDividerModule,
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

  /**
   * 当前账号是否为项目管理员（决定能否添加/移除/调整成员）：
   * 1. 项目角色：自己在成员列表中的 user 条目 role = admin；
   * 2. 组织兜底：当前组织（X-Org-Id）命中该空间的 organization 条目，且自己在该组织中为管理员。
   */
  readonly isAdmin = computed(() => {
    const me = this.account.user();
    if (!me?.id) return false;

    const selfEntry = this.members().find((m) => m.userId === me.id);
    if (selfEntry?.role === 'admin') return true;

    const org = this.account.organization();
    const orgEntry = this.space()?.accesses?.find((a) => a.type === 'organization' && a.id === org.id);
    if (orgEntry) {
      const meInOrg = org.members.find((m) => m.userId === me.id);
      return meInOrg !== undefined && meInOrg.role === 'admin';
    }
    return false;
  });

  /** 自己在项目成员列表中的条目（用于操作列区分"本人"） */
  readonly self = computed(() => {
    const me = this.account.user();
    return this.members().find((m) => m.userId === me?.id) || null;
  });

  /**
   * 自己是否为最后一个管理员（决定能否退出项目）：
   * 自己是 user admin 且成员列表中没有其他 user admin 即为最后一个，不做组织兜底。
   */
  readonly isLastAdmin = computed(() => {
    const me = this.account.user();
    const selfEntry = this.self();
    if (!me?.id || !selfEntry || selfEntry.role !== 'admin') return false;

    return !this.members().some((m) => m.userId !== selfEntry.userId && m.role === 'admin');
  });

  /** 该成员是否为当前账号（本人只能退出项目，不能移除/调整自己） */
  protected isMe(member: OrganizationMember): boolean {
    return member.userId === this.account.user().id;
  }

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
      members: this.matrix.listAccesses(id),
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

  /** 添加项目成员（管理员可指定角色） */
  protected addMember() {
    const modal = this.modal.create<ProjectMemberAddComponent, undefined, ProjectMemberAddResult>({
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
        this.matrix.addAccess(this.rootId(), result.memberId, result.role).subscribe({
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
    this.matrix.removeAccess(this.rootId(), member.userId).subscribe({
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

  /** 调整成员角色（admin / member），仅管理员可见 */
  protected updateRole(member: OrganizationMember) {
    const modal = this.modal.create<ProjectMemberRoleComponent, OrganizationMember, string>({
      nzTitle: this.i18n.translate.instant('调整角色'),
      nzContent: ProjectMemberRoleComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: member,
      nzFooter: [
        {
          label: this.i18n.translate.instant('取消'),
          onClick: (component) => component!.cancel(),
        },
        {
          label: this.i18n.translate.instant('确认'),
          type: 'primary',
          disabled: (component) => component!.role() === component!.data.role,
          onClick: (component) => component!.ok(),
        },
      ],
    });

    modal.afterClose.subscribe((role) => {
      if (role && role !== member.role) {
        this.doUpdateRole(member, role);
      }
    });
  }

  private doUpdateRole(member: OrganizationMember, role: string): void {
    this.loading.set(true);
    this.matrix.updateAccessRole(this.rootId(), member.userId, role).subscribe({
      next: () => {
        this.msg.success(this.i18n.translate.instant('调整角色成功'));
        this.load(this.rootId());
      },
      error: (error) => {
        this.msg.warning(error?.message ?? error);
        this.loading.set(false);
      },
    });
  }

  /** 退出项目（本人删除自己的访问条目），所有成员可见 */
  protected exitProject() {
    const me = this.account.user();
    if (!me?.id) return;
    const modal = this.modal.create<ConfirmComponent, string, string>({
      nzTitle: this.i18n.translate.instant('您真的要退出这个项目吗？'),
      nzContent: ConfirmComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: this.space()?.name || this.rootId(),
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
        this.loading.set(true);
        this.matrix.removeAccess(this.rootId(), me.id).subscribe({
          next: () => {
            this.msg.success(this.i18n.translate.instant('退出项目成功'));
            this.location.back();
          },
          error: (error) => {
            this.msg.warning(error?.message ?? error);
            this.loading.set(false);
          },
        });
      }
    });
  }
}
