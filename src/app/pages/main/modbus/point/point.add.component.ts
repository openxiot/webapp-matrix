import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzModalRef } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { TranslatePipe } from '@ngx-translate/core';
import { ModbusPoint } from '../../../../typedef/define/modbus/Modbus';
import { AREA_OPTIONS, DATA_TYPE_OPTIONS, RW_OPTIONS } from './point.options';

@Component({
  selector: 'modbus-point-add',
  standalone: true,
  templateUrl: './point.add.component.html',
  imports: [FormsModule, NzFormModule, NzInputModule, NzInputNumberModule, NzSelectModule, NzGridModule, TranslatePipe],
})
export class PointAddComponent {
  readonly #modal = inject(NzModalRef);

  protected readonly areaOptions = AREA_OPTIONS;
  protected readonly rwOptions = RW_OPTIONS;
  protected readonly dataTypeOptions = DATA_TYPE_OPTIONS;

  protected readonly name = signal('');
  protected readonly area = signal('holding');
  protected readonly address = signal<number | undefined>(undefined);
  protected readonly logicalAddress = signal<number | undefined>(undefined);
  protected readonly dataType = signal('int16');
  protected readonly rw = signal('rw');
  protected readonly scale = signal<number | undefined>(undefined);
  protected readonly unit = signal('');
  protected readonly description = signal('');

  /** 名称必填（服务端校验 name 非空）；dataType 有默认值恒非空 */
  readonly valid = computed(() => this.name().trim().length > 0);

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  ok(): void {
    if (!this.valid()) {
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
      rw: this.emptyToUndefined(this.rw()),
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

  protected onRwChange(value: string | null): void {
    this.rw.set(value ?? '');
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
