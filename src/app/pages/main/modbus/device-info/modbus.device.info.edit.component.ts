import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { TranslatePipe } from '@ngx-translate/core';
import { ModbusDeviceInfo } from '../../../../typedef/define/modbus/Modbus';

@Component({
  selector: 'modbus-device-info-edit',
  standalone: true,
  templateUrl: './modbus.device.info.edit.component.html',
  imports: [FormsModule, NzFormModule, NzInputModule, NzInputNumberModule, NzRadioModule, NzGridModule, TranslatePipe],
})
export class ModbusDeviceInfoEditComponent {
  readonly #modal = inject(NzModalRef);
  readonly data: ModbusDeviceInfo = inject(NZ_MODAL_DATA);

  protected readonly manufacturer = signal(this.data.manufacturer ?? '');
  protected readonly model = signal(this.data.model ?? '');
  protected readonly slaveId = signal<number | undefined>(this.data.slaveId);
  protected readonly visibility = signal<string>(this.data.visibility ?? 'private');
  protected readonly description = signal(this.data.description ?? '');

  /** 厂家/型号/从站地址必填（服务端校验） */
  readonly valid = computed(
    () =>
      this.manufacturer().trim().length > 0 &&
      this.model().trim().length > 0 &&
      this.slaveId() != null,
  );

  /** 相对原值有变化才允许确认 */
  readonly changed = computed(
    () =>
      this.manufacturer().trim() !== (this.data.manufacturer ?? '').trim() ||
      this.model().trim() !== (this.data.model ?? '').trim() ||
      (this.slaveId() ?? undefined) !== (this.data.slaveId ?? undefined) ||
      this.visibility() !== (this.data.visibility ?? 'private') ||
      this.description().trim() !== (this.data.description ?? '').trim(),
  );

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  ok(): void {
    if (!this.valid() || !this.changed()) {
      return;
    }
    const info: ModbusDeviceInfo = {
      manufacturer: this.manufacturer().trim(),
      model: this.model().trim(),
      slaveId: this.slaveId(),
      visibility: this.visibility() === 'public' ? 'public' : 'private',
      description: this.emptyToUndefined(this.description()),
    };
    this.#modal.destroy(info);
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
