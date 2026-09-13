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
import { NzSpaceModule } from 'ng-zorro-antd/space';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { DatePipe, Location } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { AccountService } from '../../../service/account.service';
import { ProductService } from '../../../service/product.service';
import { MatrixService } from '../../../service/matrix.service';
import { ModbusService } from '../../../service/modbus.service';
import { DtuService } from '../../../service/dtu.service';
import { MainI18nService } from '../../../service/i18n.service';
import { BreadcrumbTranslateDirective } from '../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { NzModalService } from 'ng-zorro-antd/modal';
import { ConfirmComponent } from '../../../common/dialog/confirm/confirm.component';
import { SpaceAddComponent, SpaceAddResult } from '../../../common/dialog/space/space.add.component';
import { DeviceAddComponent } from '../../../common/dialog/device/add/device.add.component';
import { SpaceEntity } from '../../../typedef/define/space/SpaceEntity';
import { DeviceEntity } from '../../../typedef/define/device/DeviceEntity';
import { GenericService } from '../../../typedef/define/service/GenericService';
import { OrganizationMember } from '../../../typedef/define/user/UserOrganization';
import { UrnUtils } from '../../../typedef/utils/UrnUtils';
import { ProductBasic } from '@openxiot/xiot-core-spec-ts';
import { NzAvatarComponent } from 'ng-zorro-antd/avatar';

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

/** 表格中的一行：空间节点、设备节点或服务节点 */
interface TreeNode {
  key: string;
  kind: 'space' | 'device' | 'service';
  level: number;
  space: SpaceEntity | null;
  device: DeviceEntity | null;
  /** 服务行（挂在它依赖的设备行下，见 rows） */
  service: GenericService | null;
  hasChildren: boolean;
}

/** 展开状态用的行键：空间按 id、设备按 did，加前缀以免两类 id 混在一个集合里 */
function spaceKey(spaceId: string): string {
  return `space:${spaceId}`;
}

function deviceKey(did: string): string {
  return `device:${did}`;
}

@Component({
  selector: 'projects-detail',
  standalone: true,
  templateUrl: './project.component.html',
  styleUrl: './project.component.less',
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
    NzSpaceModule,
    TranslatePipe,
    BreadcrumbTranslateDirective,
    DatePipe,
    NzAvatarComponent,
    RouterLink,
  ],
  providers: [NzModalService],
})
export class ProjectComponent implements OnInit {
  /** 根空间（项目）id */
  rootId = signal('');

  /** 已展开的空间 id 集合 */
  expandedIds = signal<Set<string>>(new Set());

  /** 嵌套的根空间树 */
  rootSpace = signal<SpaceEntity | null>(null);
  /** 当前项目全部设备（扁平） */
  devices = signal<DeviceEntity[]>([]);
  /** 当前项目全部服务（精简视图，见 GenericService）：挂在各自依赖的设备行下 */
  services = signal<GenericService[]>([]);
  /** model -> 产品显示名 */
  productNames = signal<Map<string, string>>(new Map());
  /** model -> 产品图标 URL */
  productIcons = signal<Map<string, string>>(new Map());
  /** 设备实例描述：设备类型 URN -> 当前语言描述文案（产品名缺失时的兜底，见 deviceName） */
  deviceDescriptions = signal<Map<string, string>>(new Map());
  loading = signal(false);
  error = signal<string | null>(null);

  /** 项目根空间（扁平，含 accesses）与成员（user 访问条目），用于计算项目管理员（isAdmin） */
  adminSpace = signal<SpaceEntity | null>(null);
  members = signal<OrganizationMember[]>([]);

  /**
   * 当前账号是否为项目管理员（决定「添加设备 / 删除设备」是否可见）：
   * 1. 自己在项目成员（user 访问条目）中 role=admin；
   * 2. 组织兜底：当前组织命中项目根空间的 organization 访问条目，且自己为该组织管理员。
   * 口径与 projects.member.component / device.component 的 isAdmin 一致。
   */
  readonly isAdmin = computed(() => {
    const me = this.account.user();
    if (!me?.id) return false;

    const selfEntry = this.members().find((m) => m.userId === me.id);
    if (selfEntry?.role === 'admin') return true;

    const org = this.account.organization();
    const orgEntry = this.adminSpace()?.accesses?.find(
      (a) => a.type === 'organization' && a.id === org.id,
    );
    if (orgEntry) {
      const meInOrg = org.members.find((m) => m.userId === me.id);
      return meInOrg !== undefined && meInOrg.role === 'admin';
    }
    return false;
  });

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
    private modbus: ModbusService,
    private dtu: DtuService,
  ) {}

  ngOnInit() {
    this.route.params.subscribe((params) => {
      const id = params['id'] || this.account.space().id || '';
      this.rootId.set(id);
      if (id) {
        // 根空间不再占一行（见 rows），它的展开状态也就无从设置：内容始终铺在第 0 层
        this.loadSpaceGraph(id);
        this.loadAdminContext(id);
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
        this.services.set(graph.services);
        this.loading.set(false);
        this.resolveProductNames(graph.devices);
        this.resolveDeviceDescriptions(graph.devices);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(e?.message ?? String(e));
        this.msg.error(e?.message ?? e);
      },
    });
  }

  /**
   * 设备显示名，优先级同设备列表页：产品名称 -> 设备实例描述 -> 设备 DeviceType（URN）的
   * type 段 -> did。实例描述见 resolveDeviceDescriptions。
   */
  deviceName(device: DeviceEntity): string {
    const name = this.productNames().get(this.deviceModel(device));
    if (name) return name;
    const description = this.deviceDescriptions().get(device.type);
    if (description) return description;
    const typeName = UrnUtils.extractTypeName(device.type);
    return typeName || device.did;
  }

  deviceModel(device: DeviceEntity): string {
    return UrnUtils.extractOrgModel(device.type).model;
  }

  /**
   * 解析设备实例描述（产品名缺失时的兜底显示名）：实例定义按 DeviceType 保存，故按类型逐个取回，
   * 同类型只取一次，实例定义沿用 product 服务的口径——同设备列表页。
   * 当前语言无文案时回退中文；取不到就交给 类型名 兜底，失败静默（不影响列表展示）。
   */
  private resolveDeviceDescriptions(devices: DeviceEntity[]): void {
    const lang = this.i18n.getCurrentLang();
    const requested = new Set<string>();
    for (const device of devices) {
      const type = device.type;
      if (!type || requested.has(type)) continue;
      requested.add(type);

      this.product.getProductInstance(type).subscribe({
        next: (instance) => {
          const description =
            instance.description?.get(lang) || instance.description?.get('zh-CN') || '';
          if (!description) return;
          this.deviceDescriptions.update((m) => {
            m.set(type, description);
            return new Map(m);
          });
        },
        error: () => {},
      });
    }
  }

  private resolveProductNames(devices: DeviceEntity[]) {
    const orgId = this.account.organization().id;

    // 宽泛兜底：拉取组织可见的全部产品建立 model -> 名称/图标 映射
    if (orgId) {
      this.product.getVisibleProducts(orgId).subscribe({
        next: (products) => {
          const names = new Map<string, string>();
          const icons = new Map<string, string>();
          for (const p of products) {
            names.set(p.model, productDisplayName(p, this.i18n.translate.instant('未知产品')));
            icons.set(p.model, p.icon ?? '');
          }
          this.productNames.set(names);
          this.productIcons.set(icons);
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
          this.productIcons.update((m) => {
            m.set(model, p.icon ?? '');
            return new Map(m);
          });
        },
        error: () => {},
      });
    }
  }

  /**
   * 展平后的可见行（展开状态由 expandedIds 决定）。
   *
   * 层级：空间 →（子空间 | 本空间设备）→ 该设备依赖的服务。服务由后端空间图按空间带出，
   * 每项带 did（挂在谁下面）与 spaceId（兜底：设备被移走时挂到空间下，不至于整条丢失）。
   *
   * 根空间本身不出行：它就是当前项目，信息已在页头 nz-descriptions 里展示，
   * 列表直接从根空间的下一层（子空间 / 设备）开始。
   */
  readonly rows = computed<TreeNode[]>(() => {
    const root = this.rootSpace();
    if (!root) {
      return [];
    }
    const expanded = this.expandedIds();
    const list: TreeNode[] = [];
    const devices = this.devices();
    const services = this.services();

    const pushService = (service: GenericService, level: number) => {
      list.push({
        key: `service:${service.id}`,
        kind: 'service',
        level,
        space: null,
        device: null,
        service,
        hasChildren: false,
      });
    };

    /**
     * 铺开一个空间的内容（不出空间行本身）：子空间行、本空间设备行（展开后再带出它的服务）、
     * 以及依赖设备已不在本空间的服务兜底行。contentLevel 是这些行所处的层级。
     */
    const appendContents = (space: SpaceEntity, contentLevel: number) => {
      for (const child of space.children) {
        appendSpace(child, contentLevel);
      }
      const spaceDevices = devices.filter((d) => d.space?.spaceId === space.id);
      const spaceServices = services.filter((s) => s.spaceId === space.id);
      const attached = new Set<string>();
      for (const device of spaceDevices) {
        const own = spaceServices.filter((s) => s.did === device.did);
        own.forEach((s) => attached.add(s.id));
        list.push({
          key: deviceKey(device.did),
          kind: 'device',
          level: contentLevel,
          space: null,
          device,
          service: null,
          hasChildren: own.length > 0,
        });
        if (expanded.has(deviceKey(device.did))) {
          for (const service of own) {
            pushService(service, contentLevel + 1);
          }
        }
      }
      // 依赖设备不在本空间（设备已移走 / 已删除）的服务兜底挂在空间下
      for (const service of spaceServices.filter((s) => !attached.has(s.id))) {
        pushService(service, contentLevel);
      }
    };

    /** 空间行；展开后再铺它的内容（层级 +1） */
    const appendSpace = (space: SpaceEntity, level: number) => {
      const spaceDevices = devices.filter((d) => d.space?.spaceId === space.id);
      const spaceServices = services.filter((s) => s.spaceId === space.id);
      list.push({
        key: spaceKey(space.id),
        kind: 'space',
        level,
        space,
        device: null,
        service: null,
        hasChildren:
          space.children.length > 0 || spaceDevices.length > 0 || spaceServices.length > 0,
      });
      if (expanded.has(spaceKey(space.id))) {
        appendContents(space, level + 1);
      }
    };

    // 根空间不出现在列表里（它的代码 / 名称 / 类型 / 设备数 / 服务数已在页头 nz-descriptions
    // 展示过），直接把它的内容铺在第 0 层，不再多一层缩进
    appendContents(root, 0);
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

  /** 某空间下的服务数量（含挂在空间内设备下的） */
  serviceCount(spaceId: string): number {
    return this.services().filter((s) => s.spaceId === spaceId).length;
  }

  /** 服务详情页路径：挂在设备映射下（did 从服务自身取，与列表入口一致） */
  protected serviceDetailLink(service: GenericService): string[] {
    return ['/main/device/services', service.did, 'service', 'detail', service.id];
  }

  /** 设备图标：按型号（URN 第 7 段）命中产品图标；未命中返回空串，由模板回退默认图标 */
  deviceIcon(device: DeviceEntity): string {
    return this.productIcons().get(this.deviceModel(device)) || '';
  }

  /** 是否 DTU：只有 DTU 能做设备点表映射（口径同设备列表） */
  isDtuDevice(device: DeviceEntity): boolean {
    return UrnUtils.extractTypeName(device.type).toLowerCase() === 'dtu';
  }

  /**
   * 是否展示「映射」入口：DTU 且自己为项目空间管理员。
   * Modbus 服务（映射）已按**空间**鉴权，与账号有没有组织无关，故不再要求「已启用组织」。
   */
  showMapping(device: DeviceEntity): boolean {
    return this.isDtuDevice(device) && this.isAdmin();
  }

  /** 设备是否有子设备（同项目内 parentId = 本设备 did，如挂在 DTU 下的子设备） */
  deviceHasChildren(device: DeviceEntity): boolean {
    return this.devices().some((d) => d.parentId === device.did && d.did !== device.did);
  }

  /** 行展开/收起（空间行与设备行有展开图标） */
  protected onExpandChange(row: TreeNode, _expanded: boolean): void {
    const key = this.rowKey(row);
    if (key) {
      this.toggleExpand(key);
    }
  }

  /** 行的展开键：空间行与设备行可展开，服务行是叶子 */
  private rowKey(row: TreeNode): string | null {
    if (row.kind === 'space' && row.space) {
      return spaceKey(row.space.id);
    }
    if (row.kind === 'device' && row.device) {
      return deviceKey(row.device.did);
    }
    return null;
  }

  /** 行是否展开（模板用） */
  protected isExpanded(row: TreeNode): boolean {
    const key = this.rowKey(row);
    return key != null && this.expandedIds().has(key);
  }

  private toggleExpand(key: string): void {
    this.expandedIds.update((set) => {
      const next = new Set(set);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
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

  /**
   * 添加设备（输入 IMEI）：弹 IMEI 对话框，确认后先经 DTU 网关按 IMEI 解析 DID，
   * 再以 { did, key: imei } 登记到点击行所在的空间（复用 DeviceResource.addOne，同设备列表页）。
   * 目标空间取行上的空间即为其自身：子空间的 accesses 继承自根空间，授权口径与 isAdmin 一致。
   */
  protected addDevice(space: SpaceEntity) {
    const modal = this.modal.create<DeviceAddComponent, void, string>({
      nzTitle: this.i18n.translate.instant('添加设备'),
      nzContent: DeviceAddComponent,
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

    modal.afterClose.subscribe((imei) => {
      if (imei) {
        this.doAddByImei(space.id, imei);
      }
    });
  }

  private doAddByImei(spaceId: string, imei: string): void {
    this.dtu
      .getDidByImei(imei)
      .pipe(concatMap((did) => this.matrix.addDeviceByQr(spaceId, { did, key: imei })))
      .subscribe({
        next: () => {
          this.msg.success(this.i18n.translate.instant('添加设备成功'));
          this.loadSpaceGraph(this.rootId());
        },
        error: (e) => this.msg.warning(e?.message ?? e),
      });
  }

  /**
   * 删除设备（项目管理员可见，同设备列表页）：
   * - 有子设备（如挂了子设备的 DTU）前端守卫，提示先删子设备，不调后端；
   * - 确认后走 DeviceResource.removeOne（删 manipulation 注册 + 矩阵实体）。
   * spaceId 用项目根空间 id：授权口径与 isAdmin 门一致；删除按 did，落点空间无关。
   */
  protected removeDevice(device: DeviceEntity): void {
    if (this.deviceHasChildren(device)) {
      this.msg.warning(this.i18n.translate.instant('请先删除其子设备'));
      return;
    }

    const modal = this.modal.create<ConfirmComponent, string, string>({
      nzTitle: this.i18n.translate.instant('您真的要删除这个设备吗？'),
      nzContent: ConfirmComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: device.did,
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
        this.doRemoveDevice(device);
      }
    });
  }

  private doRemoveDevice(device: DeviceEntity): void {
    const rootId = this.rootId();
    if (!rootId) {
      return;
    }
    const did = device.did;
    this.matrix.removeDevice(rootId, did).subscribe({
      next: () => {
        this.msg.success(this.i18n.translate.instant('删除成功'));
        this.loadSpaceGraph(rootId);
      },
      error: (e) => this.msg.warning(e?.message ?? e),
    });
  }

  /**
   * 删除服务（项目管理员可见，同设备页展开后的服务行）：
   * 确认后走 ModbusServiceResource.deleteOne（后端按空间判：当前项目空间的管理员即可）。
   */
  protected removeService(service: GenericService): void {
    const modal = this.modal.create<ConfirmComponent, string, string>({
      nzTitle: this.i18n.translate.instant('您真的要删除这个服务吗？'),
      nzContent: ConfirmComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: service.name,
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
        this.doRemoveService(service);
      }
    });
  }

  private doRemoveService(service: GenericService): void {
    const rootId = this.rootId();
    if (!rootId) {
      return;
    }
    this.modbus.removeService(rootId, service.id).subscribe({
      next: () => {
        this.msg.success(this.i18n.translate.instant('删除成功'));
        this.loadSpaceGraph(rootId);
      },
      error: (e) => this.msg.warning(e?.message ?? e),
    });
  }

  /** 加载项目根空间 + 成员，供 isAdmin 判定；非管理员无需展示按钮，失败静默即可。 */
  private loadAdminContext(rootId: string): void {
    forkJoin({
      space: this.matrix.getSpace(rootId),
      members: this.matrix.listAccesses(rootId),
    }).subscribe({
      next: ({ space, members }) => {
        this.adminSpace.set(space);
        this.members.set(members);
      },
      error: () => {},
    });
  }
}
