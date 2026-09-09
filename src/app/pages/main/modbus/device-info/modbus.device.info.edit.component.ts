import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzGridModule } from 'ng-zorro-antd/grid';
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
    NzSelectModule,
    NzGridModule,
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

  /** 设备类型两级选择：名字空间 → 设备类型（value 均存完整 URN） */
  protected readonly namespaces = signal<NamespaceDefinition[]>([]);
  protected readonly namespaceLoading = signal(false);
  protected readonly selectedNamespace = signal('');
  protected readonly devices = signal<DeviceDefinition[]>([]);
  protected readonly deviceLoading = signal(false);
  protected readonly selectedType = signal<string | undefined>(this.data.type?.type);

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

  private loadNamespaces(): void {
    this.namespaceLoading.set(true);
    this.product.listSpecNamespaces().subscribe({
      next: (namespaces) => {
        this.namespaceLoading.set(false);
        this.namespaces.set(namespaces ?? []);
        // 已有设备类型时反解出名字空间，并预载设备目录
        if (this.data.type?.type) {
          try {
            const type = DeviceType.parse(this.data.type.type);
            if (type.ns) {
              this.selectedNamespace.set(type.ns);
              this.loadDevices(type.ns, this.data.type.type);
            }
          } catch {
            // type 无法解析（非法），保持未选状态
          }
        }
      },
      error: () => this.namespaceLoading.set(false),
    });
  }

  /** 名字空间切换：重载设备类型目录并清空已选类型。 */
  protected onNamespaceChange(namespace: string): void {
    if (!namespace) {
      this.selectedNamespace.set('');
      this.devices.set([]);
      this.selectedType.set(undefined);
      return;
    }
    this.selectedNamespace.set(namespace);
    this.selectedType.set(undefined);
    this.loadDevices(namespace);
  }

  private loadDevices(namespace: string, keepType?: string): void {
    this.deviceLoading.set(true);
    this.product.listSpecDevices(namespace).subscribe({
      next: (devices) => {
        if (namespace !== this.selectedNamespace()) {
          return; // 期间已切换名字空间，丢弃过期结果
        }
        this.devices.set(devices ?? []);
        const keep = keepType ?? this.selectedType();
        const stillThere = !!keep && (devices ?? []).some((d) => d.type.toString() === keep);
        this.selectedType.set(stillThere ? keep : undefined);
        this.deviceLoading.set(false);
      },
      error: () => {
        if (namespace === this.selectedNamespace()) {
          this.devices.set([]);
          this.deviceLoading.set(false);
        }
      },
    });
  }

  protected onDeviceTypeChange(type: string): void {
    this.selectedType.set(type || undefined);
  }

  /** 设备类型下拉文案：优先中文描述，其次 type.name。 */
  protected deviceLabel(device: DeviceDefinition): string {
    const zh = device.description?.get('zh-CN');
    if (zh) {
      return zh;
    }
    return device.type?.name ?? device.type.toString();
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
   * 由「名字空间 + 设备类型」两级选择结果快照出一个 ModbusDeviceType：
   * 存品类 DeviceType URN，并把产品规范（名字空间）/产品类型的多语文案一并带上，
   * 供后端落库后前端直接展示（无需回产品目录查询）。
   */
  private snapshotType(urn: string): ModbusDeviceType {
    const device = this.devices().find((d) => d.type.toString() === urn);
    let ns = '';
    try {
      ns = DeviceType.parse(urn).ns ?? '';
    } catch {
      // urn 非法：仅保留原值
    }
    const namespace = this.namespaces().find((n) => n.namespace === ns);
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
