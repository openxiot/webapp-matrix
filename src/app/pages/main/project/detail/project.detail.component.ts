import { Component, computed, OnInit, signal, ViewContainerRef } from '@angular/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconDirective } from 'ng-zorro-antd/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { DatePipe, Location } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AccountService } from '../../../../service/account.service';
import { ProjectService } from '../../../../service/project.service';
import { MatrixService } from '../../../../service/matrix.service';
import { MainI18nService } from '../../../../service/i18n.service';
import { BreadcrumbTranslateDirective } from '../../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { NzModalService } from 'ng-zorro-antd/modal';
import { ConfirmComponent } from '../../../../common/dialog/confirm/confirm.component';
import { SpaceAddComponent, SpaceAddResult } from '../../../../common/dialog/space/space.add.component';
import { SpaceEntity } from '../../../../typedef/define/space/SpaceEntity';
import { DeviceEntity } from '../../../../typedef/define/device/DeviceEntity';
import { UrnUtils } from '../../../../typedef/utils/UrnUtils';

/** 空间类型 -> 中文名 */
const SPACE_TYPE_LABELS: Record<string, string> = {
  site: '项目',
  building: '楼栋',
  floor: '楼层',
  room: '房间',
  zone: '区域',
};

/** 空间类型 -> 图标 */
function spaceIcon(type: string): string {
  switch (type) {
    case 'site':
      return 'home';
    case 'building':
      return 'bank';
    case 'floor':
      return 'table';
    case 'room':
      return 'appstore';
    case 'zone':
      return 'global';
    default:
      return 'folder';
  }
}

/** 表格中的一行：空间节点或设备节点 */
interface TreeNode {
  key: string;
  kind: 'space' | 'device';
  level: number;
  space: SpaceEntity | null;
  device: DeviceEntity | null;
  hasChildren: boolean;
}

@Component({
  selector: 'project-detail',
  standalone: true,
  templateUrl: './project.detail.component.html',
  styleUrl: './project.detail.component.less',
  imports: [
    NzPageHeaderModule,
    NzBreadCrumbModule,
    NzSpinModule,
    NzButtonModule,
    NzTableModule,
    NzTagModule,
    NzDescriptionsModule,
    NzDividerModule,
    NzIconDirective,
    TranslatePipe,
    BreadcrumbTranslateDirective,
    DatePipe,
  ],
  providers: [NzModalService],
})
export class ProjectDetailComponent implements OnInit {
  /** 根空间（项目）id */
  rootId = signal('');

  /** 已展开的空间 id 集合 */
  expandedIds = signal<Set<string>>(new Set());

  constructor(
    public i18n: MainI18nService,
    private modal: NzModalService,
    private viewContainerRef: ViewContainerRef,
    protected location: Location,
    private router: Router,
    private route: ActivatedRoute,
    private account: AccountService,
    private msg: NzMessageService,
    public project: ProjectService,
    private matrix: MatrixService,
  ) {}

  ngOnInit() {
    this.route.params.subscribe((params) => {
      const id = params['id'] || this.account.space().id || '';
      this.rootId.set(id);
      if (id) {
        this.expandedIds.set(new Set([id]));
        this.project.loadSpaceGraph(id);
      }
    });
  }

  /** 展平后的可见行（展开状态由 expandedIds 决定） */
  readonly rows = computed<TreeNode[]>(() => {
    const root = this.project.rootSpace();
    if (!root) {
      return [];
    }
    const expanded = this.expandedIds();
    const list: TreeNode[] = [];
    const devices = this.project.devices();

    const appendSpace = (space: SpaceEntity, level: number) => {
      const spaceDevices = devices.filter((d) => d.space?.spaceId === space.id);
      const isExpanded = expanded.has(space.id);
      list.push({
        key: `space:${space.id}`,
        kind: 'space',
        level,
        space,
        device: null,
        hasChildren: space.children.length > 0 || spaceDevices.length > 0,
      });
      if (isExpanded) {
        for (const child of space.children) {
          appendSpace(child, level + 1);
        }
        for (const device of spaceDevices) {
          list.push({
            key: `device:${device.did}`,
            kind: 'device',
            level: level + 1,
            space: null,
            device,
            hasChildren: false,
          });
        }
      }
    };

    appendSpace(root, 0);
    return list;
  });

  /** 空间类型显示名 */
  typeLabel(space: SpaceEntity): string {
    return space.typeAlias || SPACE_TYPE_LABELS[space.type] || space.type || '-';
  }

  /** 空间图标 */
  protected iconOf(space: SpaceEntity): string {
    return spaceIcon(space.type);
  }

  /** 设备类型显示名（URN 中的类型段） */
  deviceTypeLabel(device: DeviceEntity): string {
    return UrnUtils.extractTypeName(device.type) || device.type || '-';
  }

  /** 某空间下的设备数量 */
  deviceCount(spaceId: string): number {
    return this.project.devices().filter((d) => d.space?.spaceId === spaceId).length;
  }

  /** 行展开/收起（仅空间行有展开图标） */
  protected onExpandChange(row: TreeNode, _expanded: boolean): void {
    if (row.kind === 'space' && row.space) {
      this.toggleExpand(row.space.id);
    }
  }

  private toggleExpand(spaceId: string): void {
    this.expandedIds.update((set) => {
      const next = new Set(set);
      if (next.has(spaceId)) {
        next.delete(spaceId);
      } else {
        next.add(spaceId);
      }
      return next;
    });
  }

  /** 添加子空间 */
  protected addChildSpace(parent: SpaceEntity) {
    const modal = this.modal.create<SpaceAddComponent, string, SpaceAddResult>({
      nzTitle: this.i18n.translate.instant('添加子空间'),
      nzContent: SpaceAddComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: parent.type,
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
        const space = new SpaceEntity();
        space.name = result.name.trim();
        space.type = result.type;
        space.parentId = parent.id;
        space.rootId = this.rootId();
        space.sortOrder = 0;

        this.matrix.createSpace(space).subscribe({
          next: () => {
            this.msg.success(this.i18n.translate.instant('添加子空间成功'));
            this.project.loadSpaceGraph(this.rootId());
          },
          error: (error) => {
            this.msg.warning(error);
          },
        });
      }
    });
  }

  /** 删除空间 */
  protected removeSpace(space: SpaceEntity) {
    const modal = this.modal.create<ConfirmComponent, string, string>({
      nzTitle: this.i18n.translate.instant('您真的要删除这个空间吗？'),
      nzContent: ConfirmComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: space.name,
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
        this.doRemoveSpace(space);
      }
    });
  }

  private doRemoveSpace(space: SpaceEntity): void {
    // 服务端不允许删除有子空间的空间，提前拦截给出明确提示
    if (space.children.length > 0) {
      this.msg.warning(this.i18n.translate.instant('该空间下存在子空间，无法删除'));
      return;
    }
    this.matrix.deleteSpace(space.id).subscribe({
      next: () => {
        this.msg.success(this.i18n.translate.instant('删除空间成功'));
        if (space.id === this.rootId()) {
          // 删除的是项目本身（根空间），项目已不存在，清除当前项目并返回列表
          this.account.clearCurrentRootSpace();
          this.router.navigate(['/main/project']).then(() => {});
        } else {
          this.project.loadSpaceGraph(this.rootId());
        }
      },
      error: (error) => {
        this.msg.warning(error);
      },
    });
  }
}
