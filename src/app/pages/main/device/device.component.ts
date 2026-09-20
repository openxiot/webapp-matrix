import { Component, OnInit, ViewContainerRef, computed, signal } from '@angular/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalService } from 'ng-zorro-antd/modal';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { BreadcrumbTranslateDirective } from '../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { ConfirmComponent } from '../../../common/dialog/confirm/confirm.component';
import { AccountService } from '@app/service/account.service';
import { ProductService } from '@app/service/product.service';
import { MatrixService } from '@app/service/matrix.service';
import { ModbusService } from '@app/service/modbus.service';
import { DtuService } from '@app/service/dtu.service';
import { MainI18nService } from '@app/service/i18n.service';
import { DeviceEntity } from '../../../typedef/define/device/DeviceEntity';
import { SpaceEntity } from '../../../typedef/define/space/SpaceEntity';
import { GenericService } from '../../../typedef/define/service/GenericService';
import { OrganizationMember } from '../../../typedef/define/user/UserOrganization';
import { DeviceAddComponent } from '../../../common/dialog/device/add/device.add.component';
import { UrnUtils } from '../../../typedef/utils/UrnUtils';
import { ProductBasic } from '@openxiot/xiot-core-spec-ts';

/** 产品显示名：中文名 -> model -> id */
function productDisplayName(p: ProductBasic, unknown: string): string {
  return p.name?.value?.get('zh-CN') || p.model || p.id || unknown;
}

/**
 * 树形缩进列表的一行：设备行（depth 0 = 顶层/父设备，>=1 = 子设备），
 * 或挂在设备下、由首列展开方框展开出来的 Modbus 服务行（depth = 设备行 depth + 1）。
 * 两个引用字段各自只在一类行上有值（同 project.component 的 TreeNode 口径，便于模板里按 kind 取用）。
 */
export interface DeviceRow {
  kind: 'device' | 'service';
  /** 设备行：设备本身；服务行为 null */
  device: DeviceEntity | null;
  /** 服务行：空间图精简视图的服务；设备行为 null */
  service: GenericService | null;
  depth: number;
  /** 是否有子设备（服务行恒 false）。删除设备时用它拦「先删子设备」 */
  hasChildren: boolean;
  /** 该设备行展开后是否有内容（子设备或 Modbus 服务）——首列那一处方框据此决定要不要出现 */
  hasNested: boolean;
  /** 该设备行当前是否展开；服务行恒 false */
  expanded: boolean;
}

/**
 * 把扁平设备列表按 parentId 还原成设备森林，DFS 拍平为缩进行。
 * 根 = 无父设备（或父设备不在当前集合 / 指向自身，断链当根展示，避免丢设备）；
 * 子设备按来源顺序紧跟父设备。
 *
 * <p>展开只有一个维度（一行一处方框，同项目页）：设备行展开后先列出它下面的 Modbus 服务
 * （servicesByDid，来自空间图），再排子设备。默认展开与否由「有没有子设备」决定
 * （与改动前的设备树默认一致：有子设备就展开、没有就收起），用户点过的行记在
 * expandedOverrides 里，覆盖默认。</p>
 */
function flattenDeviceRows(
  devices: DeviceEntity[],
  expandedOverrides: ReadonlyMap<string, boolean>,
  servicesByDid: ReadonlyMap<string, GenericService[]>,
): DeviceRow[] {
  const rows: DeviceRow[] = [];
  const byId = new Map<string, DeviceEntity>();
  const byParent = new Map<string, DeviceEntity[]>();
  for (const d of devices) {
    byId.set(d.did, d);
    if (d.parentId && d.parentId !== d.did) {
      const list = byParent.get(d.parentId) || [];
      list.push(d);
      byParent.set(d.parentId, list);
    }
  }

  const isRoot = (d: DeviceEntity) =>
    !d.parentId || d.parentId === d.did || !byId.has(d.parentId);

  const push = (did: string, depth: number) => {
    const d = byId.get(did);
    if (!d) return;
    const kids = byParent.get(did) || [];
    const services = servicesByDid.get(did) || [];
    const expanded = expandedOverrides.get(did) ?? kids.length > 0;
    rows.push({
      kind: 'device',
      device: d,
      service: null,
      depth,
      hasChildren: kids.length > 0,
      hasNested: kids.length > 0 || services.length > 0,
      expanded,
    });
    if (!expanded) return;
    for (const s of services) {
      rows.push({
        kind: 'service',
        device: null,
        service: s,
        depth: depth + 1,
        hasChildren: false,
        hasNested: false,
        expanded: false,
      });
    }
    for (const c of kids) push(c.did, depth + 1);
  };

  for (const d of devices) {
    if (isRoot(d)) push(d.did, 0);
  }
  return rows;
}

@Component({
  selector: 'main-device',
  standalone: true,
  templateUrl: './device.component.html',
  styleUrl: './device.component.less',
  imports: [
    NzPageHeaderModule,
    NzBreadCrumbModule,
    BreadcrumbTranslateDirective,
    NzSpinModule,
    NzAvatarModule,
    NzTagModule,
    NzTableModule,
    NzDividerModule,
    NzEmptyModule,
    NzButtonModule,
    NzIconModule,
    RouterLink,
    TranslatePipe,
  ],
  providers: [NzModalService],
})
export class DeviceComponent implements OnInit {
  /** 当前项目全部设备（扁平，按 parentId 可还原设备树） */
  devices = signal<DeviceEntity[]>([]);
  /** 当前项目的全部 Modbus 服务（空间图精简视图：id/name/type/did/spaceId） */
  services = signal<GenericService[]>([]);
  /** 用户点过的展开/收起（did -> 是否展开）；没点过的行按「有没有子设备」取默认（见 flattenDeviceRows） */
  expandedOverrides = signal<Map<string, boolean>>(new Map());
  /** 设备 did -> 该设备下的 Modbus 服务 */
  readonly servicesByDid = computed(() => {
    const map = new Map<string, GenericService[]>();
    for (const s of this.services()) {
      if (!s.did) continue;
      const list = map.get(s.did) || [];
      list.push(s);
      map.set(s.did, list);
    }
    return map;
  });
  /** 设备树 + 服务子行的缩进行（派生自 devices + 展开覆盖 + 服务） */
  readonly rows = computed(() =>
    flattenDeviceRows(this.devices(), this.expandedOverrides(), this.servicesByDid()),
  );
  /** 空间图返回的扁平空间列表（含名称），用于给每台设备标注所在空间 */
  spaces = signal<SpaceEntity[]>([]);
  /** 空间 ID -> 空间 */
  readonly spaceById = computed(() => {
    const map = new Map<string, SpaceEntity>();
    for (const s of this.spaces()) map.set(s.id, s);
    return map;
  });
  /** model -> 产品显示名 */
  productNames = signal<Map<string, string>>(new Map());
  /** model -> 产品图标 URL */
  productIcons = signal<Map<string, string>>(new Map());
  /** 设备实例描述：设备类型 URN -> 当前语言描述文案（产品名缺失时的兜底，见 deviceName） */
  deviceDescriptions = signal<Map<string, string>>(new Map());
  loading = signal(false);
  error = signal<string | null>(null);

  /** 当前项目根空间与成员（user 访问条目），用于计算项目管理员（isAdmin）。 */
  rootSpace = signal<SpaceEntity | null>(null);
  members = signal<OrganizationMember[]>([]);

  /**
   * 当前账号是否为项目管理员（决定「添加/删除」是否可见）：
   * 1. 自己在项目成员（user 访问条目）中 role=admin；
   * 2. 组织兜底：当前组织命中项目根空间的 organization 访问条目，且自己为该组织管理员。
   * 口径与 projects.member.component 的 isAdmin 一致。
   */
  readonly isAdmin = computed(() => {
    const me = this.account.user();
    if (!me?.id) return false;

    const selfEntry = this.members().find((m) => m.userId === me.id);
    if (selfEntry?.role === 'admin') return true;

    const org = this.account.organization();
    const orgEntry = this.rootSpace()?.accesses?.find((a) => a.type === 'organization' && a.id === org.id);
    if (orgEntry) {
      const meInOrg = org.members.find((m) => m.userId === me.id);
      return meInOrg !== undefined && meInOrg.role === 'admin';
    }
    return false;
  });

  constructor(
    public account: AccountService,
    private product: ProductService,
    private matrix: MatrixService,
    private modbus: ModbusService,
    private dtu: DtuService,
    private msg: NzMessageService,
    private translate: TranslateService,
    private i18n: MainI18nService,
    private modal: NzModalService,
    private viewContainerRef: ViewContainerRef,
  ) {}

  ngOnInit() {
    const rootId = this.account.space().id;
    if (!rootId) {
      this.msg.warning(this.translate.instant('请先在项目列表中选择一个项目'));
      return;
    }
    this.loadSpaceGraph(rootId);
    this.loadAdminContext(rootId);
  }

  /**
   * 添加设备（输入 IMEI）：弹 IMEI 对话框，确认后先经 DTU 网关按 IMEI 解析 DID，
   * 再以 { did, key: imei } 登记到当前项目根空间（复用 DeviceResource.addOne）。
   */
  protected addDevice(): void {
    const modal = this.modal.create<DeviceAddComponent, void, string>({
      nzTitle: this.translate.instant('添加设备'),
      nzContent: DeviceAddComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzFooter: [
        { label: this.translate.instant('取消'), onClick: (component) => component!.cancel() },
        {
          label: this.translate.instant('确认'),
          type: 'primary',
          disabled: (component) => !component!.valid(),
          onClick: (component) => component!.ok(),
        },
      ],
    });

    modal.afterClose.subscribe((imei) => {
      if (imei) {
        this.doAddByImei(imei);
      }
    });
  }

  private doAddByImei(imei: string): void {
    const rootId = this.account.space().id;
    if (!rootId) {
      return;
    }
    this.dtu
      .getDidByImei(imei)
      .pipe(concatMap((did) => this.matrix.addDeviceByQr(rootId, { did, key: imei })))
      .subscribe({
        next: () => {
          this.msg.success(this.translate.instant('添加设备成功'));
          this.loadSpaceGraph(rootId);
        },
        error: (e) => this.msg.warning(e?.message ?? e),
      });
  }

  /**
   * 删除设备（项目管理员可见）：
   * - 有子设备（如挂了子设备的 DTU）前端守卫，提示先删子设备，不调后端；
   * - 确认后走 DeviceResource.removeOne（删 manipulation 注册 + 矩阵实体 + 该设备下的 Modbus 服务）。
   */
  protected removeDevice(row: DeviceRow): void {
    const device = row.device;
    if (!device) {
      return;
    }
    if (row.hasChildren) {
      this.msg.warning(this.translate.instant('请先删除其子设备'));
      return;
    }

    const modal = this.modal.create<ConfirmComponent, string, string>({
      nzTitle: this.translate.instant('您真的要删除这个设备吗？'),
      nzContent: ConfirmComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: device.did,
      nzFooter: [
        { label: this.translate.instant('取消'), onClick: (component) => component!.cancel() },
        {
          label: this.translate.instant('确认'),
          danger: true,
          type: 'primary',
          onClick: (component) => component!.ok(),
        },
      ],
    });

    modal.afterClose.subscribe((result) => {
      if (result) {
        this.doRemoveDevice(device.did);
      }
    });
  }

  private doRemoveDevice(did: string): void {
    const rootId = this.account.space().id;
    if (!rootId) {
      return;
    }
    this.matrix.removeDevice(rootId, did).subscribe({
      next: () => {
        this.msg.success(this.translate.instant('删除成功'));
        this.loadSpaceGraph(rootId);
      },
      error: (e) => this.msg.warning(e?.message ?? e),
    });
  }

  /**
   * 删除服务（项目管理员可见，同项目页）：确认后走 ModbusServiceResource.deleteOne
   * （后端按空间判：当前项目空间的管理员即可）。
   */
  protected removeService(service: GenericService): void {
    const modal = this.modal.create<ConfirmComponent, string, string>({
      nzTitle: this.translate.instant('您真的要删除这个服务吗？'),
      nzContent: ConfirmComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: service.name,
      nzFooter: [
        { label: this.translate.instant('取消'), onClick: (component) => component!.cancel() },
        {
          label: this.translate.instant('确认'),
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
    const rootId = this.account.space().id;
    if (!rootId) {
      return;
    }
    this.modbus.removeService(rootId, service.id).subscribe({
      next: () => {
        this.msg.success(this.translate.instant('删除成功'));
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
        this.rootSpace.set(space);
        this.members.set(members);
      },
      error: () => {},
    });
  }

  /** 加载空间图（嵌套树 + 设备），成功后解析产品名 */
  loadSpaceGraph(rootId: string) {
    this.loading.set(true);
    this.error.set(null);

    this.matrix.getSpaceGraph(rootId).subscribe({
      next: (graph) => {
        this.spaces.set(graph.spaces);
        this.devices.set(graph.devices);
        // 服务（精简视图）用于首列的服务展开：按 did 分组后挂在对应设备行下
        this.services.set(graph.services ?? []);
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
   * 设备显示名，优先级：产品名称 -> 设备实例描述 -> 设备 DeviceType（URN）的 type 段 -> did。
   * 实例描述即该 DeviceType 实例定义里的 description（多语言，见 resolveDeviceDescriptions）；
   * 产品名缺失时用它兜底。
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

  deviceIcon(device: DeviceEntity): string {
    return this.productIcons().get(this.deviceModel(device)) || '';
  }

  /** 设备所在空间的可读名称；无归属（spaceId 为空/不在图里）返回空串 */
  spaceName(device: DeviceEntity): string {
    const spaceId = device.space?.spaceId;
    if (!spaceId) return '';
    const s = this.spaceById().get(spaceId);
    return s ? s.name : '';
  }

  /** 设备是否 DTU（按其类型 URN 的 name 段判断）。DTU 才能做 设备点表映射。 */
  isDtuDevice(device: DeviceEntity): boolean {
    return UrnUtils.extractTypeName(device.type).toLowerCase() === 'dtu';
  }

  /** 服务行/设备行的 track 键：did 与服务 id 可能撞车，加前缀区分 */
  rowKey(row: DeviceRow): string {
    return row.kind === 'device' ? `d:${row.device!.did}` : `s:${row.service!.id}`;
  }

  /**
   * nz-table 展开方框回调：一行只有一个方框，展开即同时显示该设备下的
   * Modbus 服务行与子设备（服务在前），收起则两者一起隐藏。
   */
  onExpandChange(row: DeviceRow, expand: boolean) {
    if (row.kind !== 'device') return;
    const did = row.device!.did;
    this.expandedOverrides.update((overrides) => new Map(overrides).set(did, expand));
  }

  /** 服务详情页链接（路由见 device.routes.ts） */
  serviceDetailLink(service: GenericService): string[] {
    return ['/main/device/services', service.did, 'service', 'detail', service.id];
  }

  /** 服务历史数据页链接（路由见 device.routes.ts） */
  serviceHistoryLink(service: GenericService): string[] {
    return ['/main/device/services', service.did, 'service', 'history', service.id];
  }

  /** 服务所在空间的可读名称；service.spaceId 缺失/不在图里返回 '-' */
  serviceSpaceName(service: GenericService): string {
    const s = service.spaceId ? this.spaceById().get(service.spaceId) : undefined;
    return s ? s.name : '-';
  }

  /**
   * 解析设备实例描述（产品名缺失时的兜底显示名）：实例定义按 DeviceType 保存，故按类型逐个取回，
   * 同类型只取一次，实例定义沿用 product 服务的口径——同调试页。
   * 当前语言无文案时回退中文；取不到就交给 产品名称/类型名 兜底，失败静默（不影响列表展示）。
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
            names.set(p.model, productDisplayName(p, this.translate.instant('未知产品')));
            icons.set(p.model, p.icon);
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
            m.set(model, productDisplayName(p, this.translate.instant('未知产品')));
            return new Map(m);
          });
          this.productIcons.update((m) => {
            m.set(model, p.icon);
            return new Map(m);
          });
        },
        error: () => {},
      });
    }
  }
}
