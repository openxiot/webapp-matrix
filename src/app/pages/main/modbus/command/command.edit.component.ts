import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ModbusByteOrder,
  ModbusCoilItem,
  ModbusCommand,
  ModbusRegisterItem,
} from '../../../../typedef/define/modbus/Modbus';
import {
  DATA_TYPE_OPTIONS,
  DEFAULT_FC,
  FC_OPTIONS,
  READ_BIT_FCS,
  READ_REG_FCS,
  WRITE_REGISTER_DATA_TYPE_OPTIONS,
  byteOrderNoteKey,
  byteOrderOptionsFor,
  fcLabelKey,
  hexText,
  logicalAddressOf,
  quantityForDataType,
  registerSpan,
} from './point.options';

/** 10 写多寄存器的表格行（地址不手填，由起始地址按类型跨度自动排布）。 */
interface RegRow {
  dataType?: string;
  byteOrder?: string;
  value?: number;
}

/** 0F 写多线圈的行状态。 */
interface CoilRow {
  state: 'on' | 'off';
}

/**
 * 功能码添加/编辑对话框（以功能码为中心，字段随功能码切换）。
 * - 无 nzData = 新增；有 nzData = 编辑（changed 生效）。
 * - 逻辑地址只读展示，由 fc+start 换算；FC10 各寄存器地址自动按类型跨度连续排布。
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
    NzTableModule,
    NzButtonModule,
    NzIconModule,
    TranslatePipe,
  ],
})
export class CommandEditComponent {
  readonly #modal = inject(NzModalRef);
  readonly data: ModbusCommand | undefined = inject(NZ_MODAL_DATA);

  /** 新增模式（无原始数据） */
  protected readonly isAdd = !this.data;

  protected readonly fcOptions = FC_OPTIONS;
  protected readonly dataTypeOptions = DATA_TYPE_OPTIONS;
  protected readonly registerTypeOptions = WRITE_REGISTER_DATA_TYPE_OPTIONS;
  protected readonly byteOrderOptionsFor = byteOrderOptionsFor;
  protected readonly hexText = hexText;
  protected readonly readBitFcs = READ_BIT_FCS;
  protected readonly readRegFcs = READ_REG_FCS;
  protected readonly coilStateOptions = [
    { value: 'on', label: 'ON' },
    { value: 'off', label: 'OFF' },
  ];

  private readonly translate = inject(TranslateService);

  protected readonly fc = signal<string>(this.data?.fc ?? DEFAULT_FC);
  protected readonly name = signal(this.data?.name ?? '');
  protected readonly start = signal<number | undefined>(this.data?.start);
  /** 起始地址输入框的十六进制文本（大写、仅 0-9/A-F），非法字符在输入时被剔除。 */
  protected readonly startText = signal<string>(
    this.data?.start == null ? '' : this.data.start.toString(16).toUpperCase(),
  );
  protected readonly quantity = signal<number | undefined>(this.data?.quantity ?? 1);
  protected readonly dataType = signal(this.data?.dataType);
  protected readonly byteOrder = signal(this.data?.byteOrder ?? 'ABCD');
  protected readonly scale = signal<number | undefined>(this.data?.scale ?? 1);
  protected readonly unit = signal(this.data?.unit ?? '');
  protected readonly coilState = signal<'on' | 'off'>(this.data?.coilState ?? 'on');
  protected readonly registerValue = signal<number | undefined>(this.data?.registerValue);
  protected readonly coils = signal<CoilRow[]>(this.toCoilRows(this.data?.coils));
  protected readonly registers = signal<RegRow[]>(this.toRegRows(this.data?.registers));

  /** 逻辑地址（只读）：fc+start 换算。 */
  protected readonly logicalAddress = computed(() => logicalAddressOf(this.fc(), this.start()));

  /**
   * 03/04 读寄存器的数量是否锁定：
   * 非 string 类型占用的寄存器数是固定的（int16→1、int32/float32→2），锁住数量避免与数据格式不符；
   * string 类型长度由用户决定，数量放开可编辑。
   */
  protected readonly quantityLocked = computed(
    () => READ_REG_FCS.has(this.fc()) && !!this.dataType() && this.dataType() !== 'string',
  );

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
      JSON.stringify(this.coils()) !== JSON.stringify(this.toCoilRows(this.data.coils)) ||
      JSON.stringify(this.registers()) !== JSON.stringify(this.toRegRows(this.data.registers))
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
    this.coils.set([{ state: 'on' }]);
    this.registers.set([{ dataType: 'int16', byteOrder: 'ABCD', value: 0 }]);
  }

  protected onNameInput($event: Event): void {
    this.name.set(($event.target as HTMLInputElement).value);
  }

  /** 起始地址输入：仅接受 16 进制字符（自动大写、过滤 0x 前缀），空格视为空。 */
  protected onStartInput($event: Event): void {
    const input = $event.target as HTMLInputElement;
    let clean = input.value.trim().toUpperCase().replace(/^0X/, '').replace(/[^0-9A-F]/g, '');
    if (clean.length === 0) {
      input.value = '';
      this.startText.set('');
      this.start.set(undefined);
      return;
    }
    input.value = clean;
    this.startText.set(clean);
    this.start.set(parseInt(clean, 16));
  }

  /** 字节序选项显示：在 ABCD 后标注含义，如 ABCD（大端）。 */
  protected byteOrderDisplay(value: string): string {
    const noteKey = byteOrderNoteKey(value);
    if (!noteKey) {
      return value;
    }
    return `${value}（${this.translate.instant(noteKey)}）`;
  }

  /** 03/04 选数据类型：自动给数量（非 string），字节序回落到 ABCD。 */
  protected onDataTypeChange(value: string): void {
    this.dataType.set(value);
    const q = quantityForDataType(value);
    if (q != null) {
      this.quantity.set(q);
    }
    const bo = this.byteOrder();
    const available = byteOrderOptionsFor(value);
    if (!available.some((o) => o.value === bo)) {
      this.byteOrder.set('ABCD');
    }
  }

  protected onQuantityChange(value: number | null): void {
    this.quantity.set(value ?? undefined);
  }

  protected onByteOrderChange(value: ModbusByteOrder): void {
    this.byteOrder.set(value);
  }

  protected onScaleChange(value: number | null): void {
    this.scale.set(value ?? undefined);
  }

  protected onUnitInput($event: Event): void {
    this.unit.set(($event.target as HTMLInputElement).value);
  }

  protected onCoilStateChange(value: 'on' | 'off'): void {
    this.coilState.set(value);
  }

  protected onRegisterValueChange(value: number | null): void {
    this.registerValue.set(value ?? undefined);
  }

  // ---------- 0F 多线圈子表 ----------

  protected addCoil(): void {
    this.coils.update((list) => [...list, { state: 'on' }]);
  }

  protected removeCoil(index: number): void {
    this.coils.update((list) => list.filter((_, i) => i !== index));
  }

  protected onCoilRowStateChange(index: number, value: 'on' | 'off'): void {
    this.coils.update((list) => {
      const copy = [...list];
      copy[index] = { ...copy[index], state: value };
      return copy;
    });
  }

  // ---------- 10 多寄存器子表 ----------

  protected addRegister(): void {
    this.registers.update((list) => [...list, { dataType: 'int16', byteOrder: 'ABCD', value: 0 }]);
  }

  protected removeRegister(index: number): void {
    this.registers.update((list) => list.filter((_, i) => i !== index));
  }

  /** 第 index 个寄存器从起始地址起按前面各行的类型跨度连续累计出的数据地址。 */
  protected registerAddress(index: number): number {
    const start = this.start() ?? 0;
    let addr = start;
    const rows = this.registers();
    for (let i = 0; i < index && i < rows.length; i++) {
      addr += registerSpan(rows[i].dataType) ?? 1;
    }
    return addr;
  }

  protected onRegTypeChange(index: number, value: string): void {
    this.registers.update((list) => {
      const copy = [...list];
      const row = { ...copy[index] };
      row.dataType = value;
      const available = byteOrderOptionsFor(value);
      if (!row.byteOrder || !available.some((o) => o.value === row.byteOrder)) {
        row.byteOrder = 'ABCD';
      }
      copy[index] = row;
      return copy;
    });
  }

  protected onRegByteOrderChange(index: number, value: string): void {
    this.registers.update((list) => {
      const copy = [...list];
      copy[index] = { ...copy[index], byteOrder: value };
      return copy;
    });
  }

  protected onRegValueChange(index: number, value: number | null): void {
    this.registers.update((list) => {
      const copy = [...list];
      copy[index] = { ...copy[index], value: value ?? undefined };
      return copy;
    });
  }

  /** 行内字节序可选子集（16 位只有 ABCD/DCBA）。 */
  protected byteOrderOptionsForRow(row: RegRow) {
    return byteOrderOptionsFor(row.dataType);
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

  private toCoilRows(items?: ModbusCoilItem[]): CoilRow[] {
    if (!items || items.length === 0) {
      return [{ state: 'on' }];
    }
    return items.map((it) => ({ state: it.on ? 'on' : 'off' }));
  }

  private toRegRows(items?: ModbusRegisterItem[]): RegRow[] {
    if (!items || items.length === 0) {
      return [{ dataType: 'int16', byteOrder: 'ABCD', value: 0 }];
    }
    return items.map((it) => ({
      dataType: it.dataType,
      byteOrder: it.byteOrder ?? 'ABCD',
      value: it.value,
    }));
  }

  private emptyToUndefined(value: string | undefined): string | undefined {
    if (value == null) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}
