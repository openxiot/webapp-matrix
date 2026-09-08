import { Component, computed, inject, signal } from '@angular/core';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { TranslatePipe } from '@ngx-translate/core';
import {
  ModbusByteOrder,
  ModbusCoilItem,
  ModbusCommand,
  ModbusRegisterItem,
} from '../../../../typedef/define/modbus/Modbus';
import {
  type CoilRow,
  type RegRow,
  defaultCoilRow,
  defaultRegRow,
  toCoilRows,
  toRegRows,
} from './command.rows';
import {
  DEFAULT_FC,
  READ_BIT_FCS,
  READ_REG_FCS,
  byteOrderOptionsFor,
  quantityForDataType,
  registerSpan,
} from './point.options';
import { MultiCoilsBlockComponent } from './multi-coils/command.multi-coils.block.component';
import { MultiRegistersBlockComponent } from './multi-registers/command.multi-registers.block.component';
import { CommandNameComponent } from './name/command.name.component';
import { CommandFcComponent } from './fc/command.fc.component';
import { CommandStartComponent } from './start/command.start.component';
import { CommandLogicalAddressComponent } from './logical-address/command.logical-address.component';
import { CommandQuantityComponent } from './quantity/command.quantity.component';
import { CommandDataTypeComponent } from './data-type/command.data-type.component';
import { CommandByteOrderComponent } from './byte-order/command.byte-order.component';
import { CommandScaleComponent } from './scale/command.scale.component';
import { CommandUnitComponent } from './unit/command.unit.component';
import { CommandCoilStateComponent } from './coil-state/command.coil-state.component';
import { CommandRegisterValueComponent } from './register-value/command.register-value.component';

/** 功能码对话框经 NZ_MODAL_DATA 传入的数据：待编辑/待查看的命令 + 是否只读。 */
export interface ModbusCommandDialogData {
  command?: ModbusCommand;
  readOnly?: boolean;
}

/**
 * 功能码添加/编辑对话框。
 * 每个「表单值」都是独立小组件（command/ 下一个表单值对应一个子目录，共 11 个：
 * 名称/功能码/起始地址/逻辑地址/数量/数据格式/字节序/缩放系数/单位/线圈状态/寄存器值），
 * 本组件只做两件事：
 * 1) 持有全部值信号并统一做校验(valid)、变更判定(changed)、提交(buildCommand)；
 * 2) 按功能码组合展示哪些字段（0F/10 复用多线圈/多寄存器表格块组件）。
 * 跨字段联动（数据格式→数量/字节序、功能码切换→重置字段）也集中在这里。
 *
 * - 无 nzData = 新增；有 nzData + 非只读 = 编辑（changed 生效）；有 nzData + 只读 = 详情查看。
 * - 逻辑地址只读展示，由 fc+start 换算；FC10 各寄存器地址自动按类型跨度连续排布。
 */
@Component({
  selector: 'modbus-command-edit',
  standalone: true,
  templateUrl: './command.edit.component.html',
  styleUrl: './command.edit.component.less',
  imports: [
    NzFormModule,
    TranslatePipe,
    MultiCoilsBlockComponent,
    MultiRegistersBlockComponent,
    CommandNameComponent,
    CommandFcComponent,
    CommandStartComponent,
    CommandLogicalAddressComponent,
    CommandQuantityComponent,
    CommandDataTypeComponent,
    CommandByteOrderComponent,
    CommandScaleComponent,
    CommandUnitComponent,
    CommandCoilStateComponent,
    CommandRegisterValueComponent,
  ],
  host: {
    '[class.cmd-edit--readonly]': 'readOnly',
  },
})
export class CommandEditComponent {
  readonly #modal = inject(NzModalRef);
  readonly modalData: ModbusCommandDialogData | undefined = inject(NZ_MODAL_DATA);

  /** 原始命令（无 = 新增模式）。 */
  readonly data: ModbusCommand | undefined = this.modalData?.command;

  /** 只读查看（详情模式）：控件禁用、仅可关闭，不产生提交。 */
  protected readonly readOnly = this.modalData?.readOnly ?? false;

  /** 新增模式（无原始数据） */
  protected readonly isAdd = !this.data;

  protected readonly readBitFcs = READ_BIT_FCS;
  protected readonly readRegFcs = READ_REG_FCS;

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

  /** 03/04 读寄存器：非 string 数据格式时数量锁定为类型跨度。 */
  protected readonly quantityLocked = computed(
    () => !!this.dataType() && this.dataType() !== 'string',
  );

  /** 03/04 读寄存器：当前数据格式下可用的字节序子集（16 位只有 大端/小端）。 */
  protected readonly byteOrderOptions = computed<ModbusByteOrder[]>(() =>
    byteOrderOptionsFor(this.dataType()).map((o) => o.value as ModbusByteOrder),
  );

  /** 通用表单项（名称/功能码/起始地址）与按功能码的值区是否合法。 */
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
  protected onFcChange(fc: string): void {
    const f = fc || DEFAULT_FC;
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

  /** 数据格式变化（03/04）：自动给数量（非 string = 类型跨度），必要时回落字节序。 */
  protected onDataTypeChange(value: string | undefined): void {
    this.dataType.set(value);
    if (!value) {
      return;
    }
    const q = quantityForDataType(value);
    if (q != null) {
      this.quantity.set(q);
    }
    const bo = this.byteOrder();
    if (!byteOrderOptionsFor(value).some((o) => o.value === bo)) {
      this.byteOrder.set('ABCD');
    }
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
