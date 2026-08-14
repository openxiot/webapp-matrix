import { Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AccountService } from './account.service';
import { ProductService } from './product.service';
import { MatrixService } from './matrix.service';
import { SpaceEntity } from '../typedef/define/space/SpaceEntity';
import { DeviceEntity } from '../typedef/define/device/DeviceEntity';
import { DeviceRegistration } from '../typedef/define/device/DeviceRegistration';
import { MoveDeviceRequest } from '../typedef/define/device/MoveDeviceRequest';
import { UrnUtils } from '../typedef/utils/UrnUtils';
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

function displayName(p: ProductBasic): string {
  return p.name?.value?.get('zh-CN') || p.model || p.id || '未知产品';
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
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
    private matrix: MatrixService,
    private product: ProductService,
    private account: AccountService,
    private msg: NzMessageService,
  ) {}

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

  /** 指定空间下的设备 */
  devicesOf(spaceId: string): DeviceEntity[] {
    return this.devices().filter((d) => d.space?.spaceId === spaceId);
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

  private resolveProductNames(devices: DeviceEntity[]) {
    const orgId = this.account.organization().id;

    // 宽泛兜底：拉取组织可见的全部产品建立 model -> 名称/图标 映射
    if (orgId) {
      this.product.getVisibleProducts(orgId).subscribe({
        next: (products) => {
          const names = new Map<string, string>();
          const icons = new Map<string, string>();
          for (const p of products) {
            names.set(p.model, displayName(p));
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
            m.set(model, displayName(p));
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

  /**------------------------------------------------------------------------------------------------
   * 空间/设备操作（操作成功后刷新）
   *------------------------------------------------------------------------------------------------*/
  createSpace(space: SpaceEntity, rootId: string) {
    this.matrix.createSpace(space).subscribe({
      next: () => this.loadSpaceGraph(rootId),
      error: (e) => this.msg.error(e?.message ?? e),
    });
  }

  /** 创建根空间（项目），返回创建后的空间实体（含新 id） */
  createRootSpace(space: SpaceEntity): Observable<SpaceEntity> {
    return this.matrix.createSpace(space);
  }

  updateSpace(space: SpaceEntity, rootId: string) {
    this.matrix.updateSpace(space).subscribe({
      next: () => this.loadSpaceGraph(rootId),
      error: (e) => this.msg.error(e?.message ?? e),
    });
  }

  deleteSpace(spaceId: string, rootId: string) {
    this.matrix.deleteSpace(spaceId).subscribe({
      next: () => this.loadSpaceGraph(rootId),
      error: (e) => this.msg.error(e?.message ?? e),
    });
  }

  addDevice(spaceId: string, registration: DeviceRegistration, rootId: string) {
    this.matrix.addDevices(spaceId, [registration]).subscribe({
      next: () => this.loadSpaceGraph(rootId),
      error: (e) => this.msg.error(e?.message ?? e),
    });
  }

  addDeviceByQr(spaceId: string, qrContent: string, rootId: string) {
    const body: Record<string, string> = {};
    for (const part of qrContent.split(',')) {
      const kv = part.split(':', 2);
      if (kv.length === 2) body[kv[0].trim()] = kv[1].trim();
    }
    this.matrix.addDeviceByQr(spaceId, body).subscribe({
      next: () => this.loadSpaceGraph(rootId),
      error: (e) => this.msg.error(e?.message ?? e),
    });
  }

  moveDevice(device: DeviceEntity, targetSpaceId: string) {
    const req: MoveDeviceRequest = {
      spaceId: targetSpaceId,
      rootSpaceId: device.space?.rootId || '',
      dids: [device.did],
    };
    const rootId = device.space?.rootId || this.rootSpace()?.id || '';
    this.matrix.moveDevices(req).subscribe({
      next: () => this.loadSpaceGraph(rootId),
      error: (e) => this.msg.error(e?.message ?? e),
    });
  }
}
