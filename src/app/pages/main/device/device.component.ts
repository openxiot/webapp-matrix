import { Component, OnInit, computed, signal } from '@angular/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { BreadcrumbTranslateDirective } from '../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { AccountService } from '../../../service/account.service';
import { ProductService } from '../../../service/product.service';
import { MatrixService } from '../../../service/matrix.service';
import { DeviceEntity } from '../../../typedef/define/device/DeviceEntity';
import { SpaceEntity } from '../../../typedef/define/space/SpaceEntity';
import { UrnUtils } from '../../../typedef/utils/UrnUtils';
import { ProductBasic } from '@openxiot/xiot-core-spec-ts';

/** 产品显示名：中文名 -> model -> id */
function productDisplayName(p: ProductBasic, unknown: string): string {
  return p.name?.value?.get('zh-CN') || p.model || p.id || unknown;
}

/** 树形缩进列表的一行：设备 + 在设备树里的层级（0 = 顶层/父设备，>=1 = 子设备）。 */
export interface DeviceRow {
  device: DeviceEntity;
  depth: number;
  hasChildren: boolean;
}

/**
 * 把扁平设备列表按 parentId 还原成设备森林，DFS 拍平为缩进行。
 * 根 = 无父设备（或父设备不在当前集合 / 指向自身，断链当根展示，避免丢设备）；
 * 子设备按来源顺序紧跟父设备。collapsed 集合里 did 的父设备不展开其子级。
 */
function flattenDeviceRows(devices: DeviceEntity[], collapsed: ReadonlySet<string>): DeviceRow[] {
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
    rows.push({ device: d, depth, hasChildren: kids.length > 0 });
    if (kids.length > 0 && !collapsed.has(did)) {
      for (const c of kids) push(c.did, depth + 1);
    }
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
    RouterLink,
    TranslatePipe,
  ],
})
export class DeviceComponent implements OnInit {
  /** 当前项目全部设备（扁平，按 parentId 可还原设备树） */
  devices = signal<DeviceEntity[]>([]);
  /** 已折叠（收起子级）的父设备 did 集合 */
  collapsed = signal<Set<string>>(new Set());
  /** 设备树缩进行（派生自 devices + 折叠集合） */
  readonly rows = computed(() => flattenDeviceRows(this.devices(), this.collapsed()));
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
  loading = signal(false);
  error = signal<string | null>(null);

  constructor(
    public account: AccountService,
    private product: ProductService,
    private matrix: MatrixService,
    private msg: NzMessageService,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    const rootId = this.account.space().id;
    if (!rootId) {
      this.msg.warning(this.translate.instant('请先在项目列表中选择一个项目'));
      return;
    }
    this.loadSpaceGraph(rootId);
  }

  /** 加载空间图（嵌套树 + 设备），成功后解析产品名 */
  loadSpaceGraph(rootId: string) {
    this.loading.set(true);
    this.error.set(null);

    this.matrix.getSpaceGraph(rootId).subscribe({
      next: (graph) => {
        this.spaces.set(graph.spaces);
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

  /** 设备是否 DTU（按其类型 URN 的 name 段判断）。DTU 才能做 Modbus 映射。 */
  isDtuDevice(device: DeviceEntity): boolean {
    return UrnUtils.extractTypeName(device.type).toLowerCase() === 'dtu';
  }

  /** nz-table 展开箭头回调：expand=true 展开子设备，false 收起（维护 collapsed 集合，供 flatten 剪枝） */
  toggleExpand(did: string, expand: boolean) {
    const next = new Set(this.collapsed());
    if (expand) next.delete(did);
    else next.add(did);
    this.collapsed.set(next);
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
