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
import { ProductService } from '../../../../service/product.service';
import { MatrixService } from '../../../../service/matrix.service';
import { MainI18nService } from '../../../../service/i18n.service';
import { BreadcrumbTranslateDirective } from '../../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { NzModalService } from 'ng-zorro-antd/modal';
import { ConfirmComponent } from '../../../../common/dialog/confirm/confirm.component';
import { SpaceAddComponent, SpaceAddResult } from '../../../../common/dialog/space/space.add.component';
import { SpaceEntity } from '../../../../typedef/define/space/SpaceEntity';
import { DeviceEntity } from '../../../../typedef/define/device/DeviceEntity';
import { UrnUtils } from '../../../../typedef/utils/UrnUtils';
import { ProductBasic } from '@openxiot/xiot-core-spec-ts';

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

/** 从扁平空间列表构建嵌套树（parentId 关系，首元素为根） */
function buildTree(spaces: SpaceEntity[]): SpaceEntity | null {
  if (!spaces || spaces.length === 0) return null;

  const byParentId = new Map<string, SpaceEntity[]>();
  for (const s of spaces) {
    const list = byParentId.get(s.parentId) || [];
    list.push(s);
    byParentId.set(s.parentId, list);
  }

  const buildChildren = (parentId: string): SpaceEntity[] => {
    const children = byParentId.get(parentId) || [];
    return children.map((c) => {
      const copy = Object.assign(new SpaceEntity(), c);
      copy.children = buildChildren(c.id);
      return copy;
    });
  };

  const root = Object.assign(new SpaceEntity(), spaces[0]);
  root.children = buildChildren(root.id);
  return root;
}

/** 产品显示名：中文名 -> model -> id */
function productDisplayName(p: ProductBasic, unknown: string): string {
  return p.name?.value?.get('zh-CN') || p.model || p.id || unknown;
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
  selector: 'projects-detail',
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

  /** 嵌套的根空间树 */
  rootSpace = signal<SpaceEntity | null>(null);
  /** 当前项目全部设备（扁平） */
  devices = signal<DeviceEntity[]>([]);
  /** model -> 产品显示名 */
  productNames = signal<Map<string, string>>(new Map());
  loading = signal(false);
  error = signal<string | null>(null);

  constructor(
    public i18n: MainI18nService,
    private modal: NzModalService,
    private viewContainerRef: ViewContainerRef,
    protected location: Location,
    private router: Router,
    private route: ActivatedRoute,
    private account: AccountService,
    private product: ProductService,
    private msg: NzMessageService,
    private matrix: MatrixService,
  ) {}

  ngOnInit() {
    this.route.params.subscribe((params) => {
      const id = params['id'] || this.account.space().id || '';
      this.rootId.set(id);
      if (id) {
        this.expandedIds.set(new Set([id]));
        this.loadSpaceGraph(id);
      }
    });
  }

  /** 加载空间图（嵌套树 + 设备），成功后解析产品名 */
  loadSpaceGraph(rootId: string) {
    this.loading.set(true);
    this.error.set(null);

    this.matrix.getSpaceGraph(rootId).subscribe({
      next: (graph) => {
        this.rootSpace.set(buildTree(graph.spaces));
        this.devices.set(graph.devices);
        this.loading.set(false);
        this.resolveProductNames(graph.devices);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(e?.message ?? String(e));
        this.msg.error(e?.message ?? e);
      },
    });
  }

  /** 设备显示名：产品名 -> URN 类型名 -> did */
  deviceName(device: DeviceEntity): string {
    const model = this.deviceModel(device);
    const name = this.productNames().get(model);
    if (name) return name;
    const typeName = UrnUtils.extractTypeName(device.type);
    return typeName || device.did;
  }

  deviceModel(device: DeviceEntity): string {
    return UrnUtils.extractOrgModel(device.type).model;
  }

  private resolveProductNames(devices: DeviceEntity[]) {
    const orgId = this.account.organization().id;

    // 宽泛兜底：拉取组织可见的全部产品建立 model -> 名称 映射
    if (orgId) {
      this.product.getVisibleProducts(orgId).subscribe({
        next: (products) => {
          const names = new Map<string, string>();
          for (const p of products) {
            names.set(p.model, productDisplayName(p, this.i18n.translate.instant('未知产品')));
          }
          this.productNames.set(names);
        },
        error: () => {},
      });
    }

    // 逐型号精确解析
    const orgModels = new Set<string>();
    for (const d of devices) {
      const { org, model } = UrnUtils.extractOrgModel(d.type);
      if (model) orgModels.add(`${org}:${model}`);
    }
    for (const key of orgModels) {
      const sep = key.indexOf(':');
      const org = key.slice(0, sep);
      const model = key.slice(sep + 1);
      this.product.getProductByOrgModel(org, model).subscribe({
        next: (p) => {
          this.productNames.update((m) => {
            m.set(model, productDisplayName(p, this.i18n.translate.instant('未知产品')));
            return new Map(m);
          });
        },
        error: () => {},
      });
    }
  }

  /** 展平后的可见行（展开状态由 expandedIds 决定） */
  readonly rows = computed<TreeNode[]>(() => {
    const root = this.rootSpace();
    if (!root) {
      return [];
    }
    const expanded = this.expandedIds();
    const list: TreeNode[] = [];
    const devices = this.devices();

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
    return this.devices().filter((d) => d.space?.spaceId === spaceId).length;
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
            this.loadSpaceGraph(this.rootId());
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
          this.router.navigate(['/main/projects']).then(() => {});
        } else {
          this.loadSpaceGraph(this.rootId());
        }
      },
      error: (error) => {
        this.msg.warning(error);
      },
    });
  }
}
