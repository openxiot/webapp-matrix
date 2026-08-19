import { Component, OnInit, signal } from '@angular/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { NzColDirective, NzRowDirective } from 'ng-zorro-antd/grid';
import { BreadcrumbTranslateDirective } from '../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { AccountService } from '../../../service/account.service';
import { ProductService } from '../../../service/product.service';
import { MatrixService } from '../../../service/matrix.service';
import { SpaceEntity } from '../../../typedef/define/space/SpaceEntity';
import { DeviceEntity } from '../../../typedef/define/device/DeviceEntity';
import { UrnUtils } from '../../../typedef/utils/UrnUtils';
import { ProductBasic } from '@openxiot/xiot-core-spec-ts';

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
    NzCardModule,
    NzAvatarModule,
    NzTagModule,
    NzEmptyModule,
    RouterLink,
    TranslatePipe,
    NzColDirective,
    NzRowDirective,
  ],
})
export class DeviceComponent implements OnInit {
  /** 嵌套的根空间树 */
  rootSpace = signal<SpaceEntity | null>(null);
  /** 当前项目全部设备（扁平） */
  devices = signal<DeviceEntity[]>([]);
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

  deviceIcon(device: DeviceEntity): string {
    return this.productIcons().get(this.deviceModel(device)) || '';
  }

  /** 空间 ID -> 可读名称 */
  spaceName(spaceId: string): string {
    const root = this.rootSpace();
    if (!root) return spaceId;
    let found = '';
    const walk = (s: SpaceEntity) => {
      if (found) return;
      if (s.id === spaceId) {
        found = s.name;
        return;
      }
      for (const c of s.children) walk(c);
    };
    walk(root);
    return found || spaceId;
  }

  /** 设备类型显示名（URN 类型段） */
  deviceTypeLabel(device: DeviceEntity): string {
    return UrnUtils.extractTypeName(device.type) || device.type || '-';
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
