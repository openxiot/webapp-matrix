import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { TranslatePipe } from '@ngx-translate/core';
import { ModbusPoint } from '../../../../typedef/define/modbus/Modbus';
import { AREA_OPTIONS, DATA_TYPE_OPTIONS, rwForArea, rwLabelKey } from './point.options';

@Component({
  selector: 'modbus-point-edit',
  standalone: true,
  templateUrl: './point.edit.component.html',
  imports: [FormsModule, NzFormModule, NzInputModule, NzInputNumberModule, NzSelectModule, NzGridModule, TranslatePipe],
})
export class PointEditComponent {
  readonly #modal = inject(NzModalRef);
  readonly data: ModbusPoint = inject(NZ_MODAL_DATA);

  protected readonly areaOptions = AREA_OPTIONS;
  protected readonly dataTypeOptions = DATA_TYPE_OPTIONS;

  protected readonly name = signal(this.data.name ?? '');
  protected readonly area = signal(this.data.area ?? '');
  protected readonly address = signal<number | undefined>(this.data.address);
  protected readonly logicalAddress = signal<number | undefined>(this.data.logicalAddress);
  protected readonly dataType = signal(this.data.dataType ?? 'int16');
  protected readonly scale = signal<number | undefined>(this.data.scale);
  protected readonly unit = signal(this.data.unit ?? '');
  protected readonly description = signal(this.data.description ?? '');

  /** 区域选中后固定不变的读写值（r / rw），用于只读展示 */
  protected readonly fixedRw = computed(() => rwForArea(this.area()));

  /** 固定读写值的展示用 i18n key；未选区域时为 undefined */
  protected readonly fixedRwLabelKey = computed(() => {
    const rw = this.fixedRw();
    return rw ? rwLabelKey(rw) : undefined;
  });

  /** 名称/数据类型必填（服务端校验） */
  readonly valid = computed(() => this.name().trim().length > 0 && this.dataType().trim().length > 0);

  /**
   * 任一字段相对原值变化后才允许确认。
   * 注意：rw 由 area 唯一决定、不可编辑，因此不参与变更比对（改 area 即已体现）。
   */
  readonly changed = computed(
    () =>
      this.name().trim() !== (this.data.name ?? '').trim() ||
      this.area() !== (this.data.area ?? '') ||
      (this.address() ?? undefined) !== (this.data.address ?? undefined) ||
      (this.logicalAddress() ?? undefined) !== (this.data.logicalAddress ?? undefined) ||
      this.dataType() !== (this.data.dataType ?? 'int16') ||
      (this.scale() ?? undefined) !== (this.data.scale ?? undefined) ||
      this.unit().trim() !== (this.data.unit ?? '').trim() ||
      this.description().trim() !== (this.data.description ?? '').trim(),
  );

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  ok(): void {
    if (!this.valid() || !this.changed()) {
      return;
    }
    this.#modal.destroy(this.buildPoint());
  }

  protected buildPoint(): ModbusPoint {
    return {
      name: this.name().trim(),
      area: this.emptyToUndefined(this.area()),
      address: this.address(),
      logicalAddress: this.logicalAddress(),
      dataType: this.dataType(),
      rw: this.fixedRw(),
      scale: this.scale(),
      unit: this.emptyToUndefined(this.unit()),
      description: this.emptyToUndefined(this.description()),
    };
  }

  protected onNameInput($event: Event): void {
    this.name.set(($event.target as HTMLInputElement).value);
  }

  protected onAreaChange(value: string | null): void {
    this.area.set(value ?? '');
  }

  protected onAddressChange(value: number | null): void {
    this.address.set(value ?? undefined);
  }

  protected onLogicalAddressChange(value: number | null): void {
    this.logicalAddress.set(value ?? undefined);
  }

  protected onDataTypeChange(value: string): void {
    this.dataType.set(value);
  }

  protected onScaleChange(value: number | null): void {
    this.scale.set(value ?? undefined);
  }

  protected onUnitInput($event: Event): void {
    this.unit.set(($event.target as HTMLInputElement).value);
  }

  protected onDescriptionInput($event: Event): void {
    this.description.set(($event.target as HTMLInputElement).value);
  }

  protected emptyToUndefined(value: string | undefined): string | undefined {
    if (value == null) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}
