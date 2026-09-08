import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ModbusCoilItem,
  ModbusCommand,
  ModbusRegisterItem,
} from '../../../../typedef/define/modbus/Modbus';
import { MultiCoilsBlockComponent } from './multi-coils/command.multi-coils.block.component';
import { MultiRegistersBlockComponent } from './multi-registers/command.multi-registers.block.component';
import { ReadRegistersBlockComponent } from './read-registers/command.read-registers.block.component';
import {
  type CoilRow,
  type RegRow,
  defaultCoilRow,
  defaultRegRow,
  toCoilRows,
  toRegRows,
} from './command.rows';
import {
  COIL_STATE_OPTIONS,
  DEFAULT_FC,
  FC_OPTIONS,
  READ_BIT_FCS,
  READ_REG_FCS,
  fcLabelKey,
  logicalAddressOf,
  registerSpan,
} from './point.options';

/**
 * 功能码添加/编辑对话框（以功能码为中心，字段随功能码切换）。
 * - 无 nzData = 新增；有 nzData = 编辑（changed 生效）。
 * - 逻辑地址只读展示，由 fc+start 换算；FC10 各寄存器地址自动按类型跨度连续排布。
 *
 * 表单值区按功能码分组封装为独立值组件（model() 双向绑定）：03/04 → ReadRegistersBlock、
 * 0F → MultiCoilsBlock、10 → MultiRegistersBlock；本组件仅保留命令骨架字段
 * （名称/功能码/起始地址/逻辑地址）与单字段功能码（01/02 数量、05 线圈状态、06 寄存器值），
 * 并持有全部值信号统一做校验(valid)、变更判定(changed)与提交(buildCommand)。
 */
@Component({
  selector: 'modbus-command-edit',
  standalone: true,
  templateUrl: './command.edit.component.html',
  styleUrl: './command.edit.component.less',
  imports: [
    FormsModule,
    NzFormModule,
    NzInputModule,
    NzInputNumberModule,
    NzSelectModule,
    NzGridModule,
    NzButtonModule,
    TranslatePipe,
    ReadRegistersBlockComponent,
    MultiCoilsBlockComponent,
    MultiRegistersBlockComponent,
  ],
})
export class CommandEditComponent {
  readonly #modal = inject(NzModalRef);
  readonly data: ModbusCommand | undefined = inject(NZ_MODAL_DATA);

  /** 新增模式（无原始数据） */
  protected readonly isAdd = !this.data;

  protected readonly fcOptions = FC_OPTIONS;
  protected readonly readBitFcs = READ_BIT_FCS;
  protected readonly readRegFcs = READ_REG_FCS;
  protected readonly coilStateOptions = COIL_STATE_OPTIONS;

  private readonly translate = inject(TranslateService);

  protected readonly fc = signal<string>(this.data?.fc ?? DEFAULT_FC);
  protected readonly name = signal(this.data?.name ?? '');
  protected readonly start = signal<number | undefined>(this.data?.start);
  protected readonly quantity = signal<number | undefined>(this.data?.quantity ?? 1);
  protected readonly dataType = signal(this.data?.dataType);
  protected readonly byteOrder = signal(this.data?.byteOrder ?? 'ABCD');
  protected readonly scale = signal<number | undefined>(this.data?.scale ?? 1);
  protected readonly unit = signal(this.data?.unit ?? '');
  protected readonly coilState = signal<'on' | 'off'>(this.data?.coilState ?? 'on');
  protected readonly registerValue = signal<number | undefined>(this.data?.registerValue);
  protected readonly coils = signal<CoilRow[]>(toCoilRows(this.data?.coils));
  protected readonly registers = signal<RegRow[]>(toRegRows(this.data?.registers));

  /** 逻辑地址（只读）：fc+start 换算。 */
  protected readonly logicalAddress = computed(() => logicalAddressOf(this.fc(), this.start()));

  /** 通用表单项（名称/功能码/起始地址/描述）是否合法。 */
  readonly valid = computed(() => {
    if (this.name().trim().length === 0) {
      return false;
    }
    const start = this.start();
    if (start == null || start < 0) {
      return false;
    }
    const f = this.fc();
    if (READ_BIT_FCS.has(f)) {
      return !!this.quantity() && this.quantity()! > 0;
    }
    if (READ_REG_FCS.has(f)) {
      const q = this.quantity();
      return !!this.dataType() && !!this.byteOrder() && !!q && q > 0;
    }
    if (f === '05') {
      return true; // coilState 恒有默认值 on/off
    }
    if (f === '06') {
      return this.registerValue() != null;
    }
    if (f === '0F') {
      return this.coils().length > 0;
    }
    if (f === '10') {
      const regs = this.registers();
      return (
        regs.length > 0 &&
        regs.every(
          (r) => !!r.dataType && !!r.byteOrder && r.value != null,
        )
      );
    }
    return false;
  });

  /** 相对初始值是否有变化（新增模式恒可确认）。 */
  readonly changed = computed(() => {
    if (this.isAdd || !this.data) {
      return true;
    }
    return (
      this.name().trim() !== (this.data.name ?? '').trim() ||
      this.fc() !== (this.data.fc ?? '') ||
      (this.start() ?? undefined) !== (this.data.start ?? undefined) ||
      (this.quantity() ?? 1) !== (this.data.quantity ?? 1) ||
      (this.dataType() ?? undefined) !== (this.data.dataType ?? undefined) ||
      (this.byteOrder() ?? undefined) !== (this.data.byteOrder ?? undefined) ||
      (this.scale() ?? 1) !== (this.data.scale ?? 1) ||
      this.unit().trim() !== (this.data.unit ?? '').trim() ||
      (this.coilState() ?? undefined) !== (this.data.coilState ?? undefined) ||
      (this.registerValue() ?? undefined) !== (this.data.registerValue ?? undefined) ||
      JSON.stringify(this.coils()) !== JSON.stringify(toCoilRows(this.data.coils)) ||
      JSON.stringify(this.registers()) !== JSON.stringify(toRegRows(this.data.registers))
    );
  });

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  ok(): void {
    if (!this.valid()) {
      return;
    }
    if (!this.changed()) {
      return;
    }
    this.#modal.destroy(this.buildCommand());
  }

  /** 功能码切换：清空与该功能码无关的读写字段，落到该功能码的默认值。 */
  protected onFcChange(fc: string | null): void {
    const f = fc ?? DEFAULT_FC;
    this.fc.set(f);
    this.quantity.set(1);
    this.dataType.set(undefined);
    this.byteOrder.set('ABCD');
    this.scale.set(1);
    this.unit.set('');
    this.coilState.set('on');
    this.registerValue.set(undefined);
    this.coils.set([defaultCoilRow()]);
    this.registers.set([defaultRegRow()]);
  }

  protected onNameInput($event: Event): void {
    this.name.set(($event.target as HTMLInputElement).value);
  }

  /** 起始地址变化（十进制，0 基数据地址；0-65535）。 */
  protected onStartChange(value: number | null): void {
    this.start.set(value ?? undefined);
  }

  /** 01/02 读位：数量变化（03/04 的数量在 ReadRegistersBlockComponent 内自理）。 */
  protected onQuantityChange(value: number | null): void {
    this.quantity.set(value ?? undefined);
  }

  /** 05 写单线圈：线圈状态变化。 */
  protected onCoilStateChange(value: 'on' | 'off'): void {
    this.coilState.set(value);
  }

  /** 06 写单寄存器：寄存器值变化。 */
  protected onRegisterValueChange(value: number | null): void {
    this.registerValue.set(value ?? undefined);
  }

  /** 功能码显示：如 "03 读取保持寄存器"。 */
  protected fcDisplay(fc: string): string {
    return `${fc} ${this.translate.instant(fcLabelKey(fc))}`;
  }

  /** 提交：按当前功能码组出干净的 ModbusCommand（空串转 undefined）。 */
  private buildCommand(): ModbusCommand {
    const f = this.fc();
    const cmd: ModbusCommand = {
      name: this.name().trim(),
      fc: f as ModbusCommand['fc'],
      start: this.start(),
    };
    const start = this.start() ?? 0;
    if (READ_BIT_FCS.has(f)) {
      cmd.quantity = this.quantity();
    } else if (READ_REG_FCS.has(f)) {
      cmd.quantity = this.quantity();
      cmd.dataType = this.dataType();
      cmd.byteOrder = this.byteOrder();
      cmd.scale = this.scale();
      cmd.unit = this.emptyToUndefined(this.unit());
    } else if (f === '05') {
      cmd.coilState = this.coilState();
    } else if (f === '06') {
      cmd.registerValue = this.registerValue();
    } else if (f === '0F') {
      cmd.coils = this.coils().map((row, i): ModbusCoilItem => ({
        offset: i,
        on: row.state === 'on',
      }));
    } else if (f === '10') {
      cmd.registers = this.registers().map((row, i): ModbusRegisterItem => {
        let addr = start;
        const rows = this.registers();
        for (let k = 0; k < i && k < rows.length; k++) {
          addr += registerSpan(rows[k].dataType) ?? 1;
        }
        return {
          address: addr,
          dataType: row.dataType,
          byteOrder: row.byteOrder as ModbusRegisterItem['byteOrder'],
          value: row.value,
        };
      });
    }
    return cmd;
  }

  private emptyToUndefined(value: string | undefined): string | undefined {
    if (value == null) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}
