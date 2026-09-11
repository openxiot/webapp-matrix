import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslatePipe } from '@ngx-translate/core';
import { BreadcrumbTranslateDirective } from '../../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { AccountService } from '../../../../service/account.service';
import { MatrixService } from '../../../../service/matrix.service';
import { MainI18nService } from '../../../../service/i18n.service';
import { DeviceEntity } from '../../../../typedef/define/device/DeviceEntity';
import { SpaceEntity } from '../../../../typedef/define/space/SpaceEntity';
import { OrganizationMember } from '../../../../typedef/define/user/UserOrganization';

/**
 * 子设备页（/main/device/children/:id，路由参数 id = **父设备** did）。
 *
 * 列出同一项目内 parentId = 该设备 did 的设备（如挂在一台 DTU 下的子设备）——
 * 这张表原来长在设备详情页的主内容区，因为那里让位给「设备界面子组件」（按设备类型自动挂载），
 * 所以独立成一页。
 *
 * 数据来源：当前项目的空间图 GET /matrix/v1/space/graph/{rootId} 按 parentId 过滤 ——
 * 没有子设备专用接口，所以这里不查父设备本体，页头直接显示父设备 did。
 * 可见性口径同详情页：对全部空间成员开放，「调试」入口仅空间管理员。
 */
@Component({
  selector: 'device-children',
  standalone: true,
  templateUrl: './device.children.component.html',
  styleUrl: './device.children.component.less',
  imports: [
    NzPageHeaderModule,
    NzBreadCrumbModule,
    NzSpinModule,
    NzTableModule,
    NzTagModule,
    NzButtonModule,
    NzDividerModule,
    NzEmptyModule,
    RouterLink,
    TranslatePipe,
    BreadcrumbTranslateDirective,
    DatePipe,
  ],
})
export class DeviceChildrenComponent implements OnInit {
  /** 路由参数 id = 父设备 did */
  did = signal('');

  readonly loading = signal(true);

  /** 子设备：同一项目内 parentId = 父设备 did 的设备 */
  readonly children = signal<DeviceEntity[]>([]);

  /** 是否已选择项目：项目根空间 ID 即当前项目，未选时整页无数据 */
  readonly hasSpace = computed(() => !!this.account.space().id);

  /** 当前项目根空间与成员（user 访问条目），用于计算项目管理员（isAdmin）。 */
  rootSpace = signal<SpaceEntity | null>(null);
  members = signal<OrganizationMember[]>([]);

  /**
   * 当前账号是否为项目管理员（决定「调试」是否可见）：
   * 1. 自己在项目成员（user 访问条目）中 role=admin；
   * 2. 组织兜底：当前组织命中根空间的 organization 访问条目，且自己为该组织管理员。
   * 口径与设备列表页 / 详情页的 isAdmin 一致。
   */
  readonly isAdmin = computed(() => {
    const me = this.account.user();
    if (!me?.id) return false;

    const selfEntry = this.members().find((m) => m.userId === me.id);
    if (selfEntry?.role === 'admin') return true;

    const org = this.account.organization();
    const orgEntry = this.rootSpace()?.accesses?.find(
      (a) => a.type === 'organization' && a.id === org.id,
    );
    if (orgEntry) {
      const meInOrg = org.members.find((m) => m.userId === me.id);
      return meInOrg !== undefined && meInOrg.role === 'admin';
    }
    return false;
  });

  constructor(
    protected location: Location,
    private route: ActivatedRoute,
    private account: AccountService,
    private matrix: MatrixService,
    private i18n: MainI18nService,
    private msg: NzMessageService,
  ) {}

  ngOnInit() {
    this.route.params.subscribe((params) => {
      this.did.set(params['id'] || '');
      this.load();
    });
  }

  private load(): void {
    const spaceId = this.account.space().id;
    const did = this.did();
    if (!spaceId) {
      this.loading.set(false);
      this.msg.warning(this.i18n.translate.instant('请先在项目列表中选择一个项目'));
      return;
    }
    if (!did) {
      return;
    }

    this.loading.set(true);
    this.children.set([]);

    // 子设备没有专用接口：拉整个项目的空间图再按 parentId 过滤（与详情页原做法一致）
    this.matrix.getSpaceGraph(spaceId).subscribe({
      next: (graph) => {
        if (this.did() !== did) return;
        // 排除自己：设备的 parentId 指向自身时（根设备）不能把自己当子设备列出来
        this.children.set(graph.devices.filter((x) => x.parentId === did && x.did !== did));
        this.loading.set(false);
      },
      error: (e) => {
        if (this.did() !== did) return;
        this.loading.set(false);
        this.msg.error(e?.message ?? e);
      },
    });

    this.loadAdminContext(spaceId);
  }

  /** 加载项目根空间 + 成员，供 isAdmin 判定；非管理员无需展示入口，失败静默即可。 */
  private loadAdminContext(rootId: string): void {
    forkJoin({
      space: this.matrix.getSpace(rootId),
      members: this.matrix.listAccesses(rootId),
    }).subscribe({
      next: ({ space, members }) => {
        this.rootSpace.set(space);
        this.members.set(members);
      },
      error: () => {},
    });
  }
}
