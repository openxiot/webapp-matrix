import { Component, computed, OnInit, signal, ViewContainerRef } from '@angular/core';
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
import { BreadcrumbTranslateDirective } from '../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { OrganizationMember } from '../../../typedef/define/user/Organization';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzTableModule } from 'ng-zorro-antd/table';
import { MainI18nService } from '../../../service/i18n.service';
import { NzModalService } from 'ng-zorro-antd/modal';
import { MatrixService } from '../../../service/matrix.service';
import { SpaceGraph } from '../../../typedef/define/device/SpaceGraph';

@Component({
  selector: 'project-detail',
  standalone: true,
  templateUrl: './project.detail.component.html',
  styleUrl: './project.detail.component.less',
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
    NzTableModule,
  ],
  providers: [NzModalService],
})
export class ProjectDetailComponent implements OnInit {
  loading = signal(false);
  id = signal('');
  graph = signal(new SpaceGraph());

  /** 当前账号在该组织中的角色是否为管理员 */
  readonly isAdmin = computed(() => {
    const me = this.account.user();
    const member = this.account.organization().members.find((m) => m.userId === me.id);
    return member !== undefined && member.role === 'admin';
  });

  /** 该成员是否为当前账号 */
  protected isMe(member: OrganizationMember): boolean {
    return member.userId === this.account.user().id;
  }

  constructor(
    public i18n: MainI18nService,
    private modal: NzModalService,
    private viewContainerRef: ViewContainerRef,
    protected location: Location,
    private router: Router,
    private route: ActivatedRoute,
    private account: AccountService,
    private msg: NzMessageService,
    private service: MatrixService,
  ) {}

  ngOnInit() {
    this.route.params.subscribe((params) => {
      this.id.set(params['code'] || '');
      this.load();
    });
  }

  private load(): void {
    this.loading.set(true);
    this.service.getSpaceGraph(this.id()).subscribe({
      next: (data) => {
        this.graph.set(data);
        this.loading.set(false);
      },
      error: (error) => {
        this.msg.warning(error);
        this.loading.set(false);
      },
    });
  }

  protected removeSpace() {

  }
}
