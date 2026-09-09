import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzCascaderModule, type NzCascaderOption } from 'ng-zorro-antd/cascader';
import { TranslatePipe } from '@ngx-translate/core';
import { DeviceDefinition, DeviceType, NamespaceDefinition } from '@openxiot/xiot-core-spec-ts';
import { ProductService } from '../../../../service/product.service';
import { ModbusDeviceInfo, ModbusDeviceType } from '../../../../typedef/define/modbus/Modbus';

/**
 * 设备信息编辑对话框的数据：ModbusDeviceInfo 外加新建/编辑标记（新建必选设备类型）。
 */
export interface ModbusDeviceInfoEditData extends ModbusDeviceInfo {
  /** true=新建设备点表（设备类型必选）；编辑存量配置可选（后端保留旧值） */
  isAdd?: boolean;
}

@Component({
  selector: 'modbus-device-info-edit',
  standalone: true,
  templateUrl: './modbus.device.info.edit.component.html',
  imports: [
    FormsModule,
    NzFormModule,
    NzInputModule,
    NzInputNumberModule,
    NzRadioModule,
    NzCascaderModule,
    TranslatePipe,
  ],
})
export class ModbusDeviceInfoEditComponent {
  readonly #modal = inject(NzModalRef);
  readonly data: ModbusDeviceInfoEditData = inject(NZ_MODAL_DATA);
  private readonly product = inject(ProductService);

  protected readonly isAdd = this.data.isAdd === true;

  protected readonly manufacturer = signal(this.data.manufacturer ?? '');
  protected readonly model = signal(this.data.model ?? '');
  protected readonly slaveId = signal<number | undefined>(this.data.slaveId);
  protected readonly visibility = signal<string>(this.data.visibility ?? 'private');
  protected readonly description = signal(this.data.description ?? '');

  /** 设备类型 = 级联「名字空间 → 设备类型」：一级为名字空间、二级为品类 URN */
  protected readonly cascaderOptions = signal<NzCascaderOption[]>([]);
  /** Cascader 选中路径 [名字空间, 品类 URN]，空 = 未选/已清除 */
  protected readonly cascaderPath = signal<(string | number)[]>([]);
  /** 当前选中的设备类型品类 URN（级联叶子值，即后端落库的 type.type） */
  protected readonly selectedType = signal<string | undefined>(this.data.type?.type);

  /** 已展开/预载过的「名字空间 → 设备目录」，供快照落库时取产品类型文案。 */
  private readonly catalog = new Map<string, DeviceDefinition[]>();
  /** 名字空间目录（含产品规范多语文案），供快照落库时取产品规范文案。 */
  private namespaces: NamespaceDefinition[] = [];

  /** 厂家/型号/从站地址必填（服务端校验）；新建时设备类型也必选 */
  readonly valid = computed(
    () =>
      this.manufacturer().trim().length > 0 &&
      this.model().trim().length > 0 &&
      this.slaveId() != null &&
      (!this.isAdd || !!this.selectedType()),
  );

  /** 相对原值有变化才允许确认 */
  readonly changed = computed(
    () =>
      this.manufacturer().trim() !== (this.data.manufacturer ?? '').trim() ||
      this.model().trim() !== (this.data.model ?? '').trim() ||
      (this.slaveId() ?? undefined) !== (this.data.slaveId ?? undefined) ||
      this.visibility() !== (this.data.visibility ?? 'private') ||
      (this.selectedType() ?? undefined) !== (this.data.type?.type ?? undefined) ||
      this.description().trim() !== (this.data.description ?? '').trim(),
  );

  constructor() {
    this.loadNamespaces();
  }

  /** Cascader 子级懒加载：展开某个名字空间时拉取其设备类型目录（结果按 ns 缓存）。 */
  protected loadCascaderChildren = (node: NzCascaderOption | null): Promise<void> => {
    if (!node) {
      return Promise.resolve();
    }
    const ns = String(node.value ?? '');
    if (!ns) {
      return Promise.resolve();
    }
    return this.fetchDevices(ns).then((devices) => {
      node.children = devices.map((d) => this.deviceOption(d));
      node.isLeaf = true;
    });
  };

  private loadNamespaces(): void {
    this.product.listSpecNamespaces().subscribe({
      next: (namespaces) => {
        this.namespaces = namespaces ?? [];
        this.cascaderOptions.set(this.namespaces.map((ns) => this.namespaceOption(ns)));
        // 编辑存量配置：已有设备类型时反解出名字空间，并预载其设备目录，让路径文案回显得出
        const urn = this.data.type?.type;
        if (urn) {
          try {
            const ns = DeviceType.parse(urn).ns;
            if (ns) {
              this.preloadBranch(ns, urn);
            }
          } catch {
            // type 无法解析（非法），保持未选
          }
        }
      },
      error: () => {
        // 产品规范目录加载失败：级联留空，仅其它基础字段可编辑
      },
    });
  }

  private namespaceOption(ns: NamespaceDefinition): NzCascaderOption {
    return { value: ns.namespace, label: this.namespaceLabel(ns), isLeaf: false };
  }

  private deviceOption(device: DeviceDefinition): NzCascaderOption {
    return { value: device.type.toString(), label: this.deviceLabel(device), isLeaf: true };
  }

  /** 编辑回显：预载已有 type 所在名字空间的设备目录，命中则把路径填回级联。 */
  private preloadBranch(namespace: string, keepUrn: string): void {
    this.fetchDevices(namespace).then((devices) => {
      const root = this.cascaderOptions().find((o) => o.value === namespace);
      if (root) {
        root.children = devices.map((d) => this.deviceOption(d));
        root.isLeaf = true;
      }
      if (devices.some((d) => d.type.toString() === keepUrn)) {
        this.selectedType.set(keepUrn);
        this.cascaderPath.set([namespace, keepUrn]);
      } else {
        this.selectedType.set(undefined); // 旧 type 已不在目录
      }
    });
  }

  private fetchDevices(namespace: string): Promise<DeviceDefinition[]> {
    const cached = this.catalog.get(namespace);
    if (cached) {
      return Promise.resolve(cached);
    }
    return new Promise((resolve) => {
      this.product.listSpecDevices(namespace).subscribe({
        next: (devices) => {
          const list = devices ?? [];
          this.catalog.set(namespace, list);
          resolve(list);
        },
        error: () => {
          this.catalog.set(namespace, []);
          resolve([]);
        },
      });
    });
  }

  protected onCascaderPathChange(values: (string | number)[] | null): void {
    this.cascaderPath.set(values ?? []);
    this.selectedType.set(
      values && values.length >= 2 ? String(values[values.length - 1]) : undefined,
    );
  }

  /** 设备类型下拉文案：优先中文描述，其次 type.name。 */
  protected deviceLabel(device: DeviceDefinition): string {
    const zh = device.description?.get('zh-CN');
    if (zh) {
      return zh;
    }
    return device.type?.name ?? device.type.toString();
  }

  /** 名字空间一级文案：优先多语文案（同编辑器 specLabel 取文顺序），缺省回退标识符。 */
  protected namespaceLabel(ns: NamespaceDefinition): string {
    return pickLocalizedMap(ns.description) ?? ns.namespace;
  }

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  ok(): void {
    if (!this.valid() || !this.changed()) {
      return;
    }
    const type = this.selectedType() ? this.snapshotType(this.selectedType()!) : undefined;
    const info: ModbusDeviceInfo = {
      manufacturer: this.manufacturer().trim(),
      model: this.model().trim(),
      type,
      slaveId: this.slaveId(),
      visibility: this.visibility() === 'public' ? 'public' : 'private',
      description: this.emptyToUndefined(this.description()),
    };
    this.#modal.destroy(info);
  }

  /**
   * 由「名字空间 + 设备类型」级联选择结果快照出一个 ModbusDeviceType：
   * 存品类 DeviceType URN，并把产品规范（名字空间）/产品类型的多语文案一并带上，
   * 供后端落库后前端直接展示（无需回产品目录查询）。
   */
  private snapshotType(urn: string): ModbusDeviceType {
    let ns = '';
    try {
      ns = DeviceType.parse(urn).ns ?? '';
    } catch {
      // urn 非法：仅保留原值
    }
    const device = (this.catalog.get(ns) ?? []).find((d) => d.type.toString() === urn);
    const namespace = this.namespaces.find((n) => n.namespace === ns);
    return {
      type: urn,
      specDescription: mapToRecord(namespace?.description),
      typeDescription: mapToRecord(device?.description),
    };
  }

  protected onManufacturerInput($event: Event): void {
    this.manufacturer.set(($event.target as HTMLInputElement).value);
  }

  protected onModelInput($event: Event): void {
    this.model.set(($event.target as HTMLInputElement).value);
  }

  protected onSlaveIdChange(value: number | null): void {
    this.slaveId.set(value ?? undefined);
  }

  protected onVisibilityChange(value: string): void {
    this.visibility.set(value);
  }

  protected onDescriptionInput($event: Event): void {
    this.description.set(($event.target as HTMLInputElement).value);
  }

  protected emptyToUndefined(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}

/** 目录对象的多语文案 Map → 普通对象（空/缺失返回 undefined，不落库空文案）。 */
function mapToRecord(map: Map<string, string> | undefined): Record<string, string> | undefined {
  if (!map || map.size === 0) {
    return undefined;
  }
  return Object.fromEntries(map.entries());
}

/** 多语文案 Map 里挑当前优先展示的语言：zh-CN → en-US → 任意首条。 */
function pickLocalizedMap(map: Map<string, string> | undefined): string | undefined {
  if (!map || map.size === 0) {
    return undefined;
  }
  const zh = map.get('zh-CN');
  if (zh) {
    return zh;
  }
  const en = map.get('en-US');
  if (en) {
    return en;
  }
  return map.values().next().value;
}
