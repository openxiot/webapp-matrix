import { Component, computed, inject, signal } from '@angular/core';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ModbusBitName,
  ModbusByteOrder,
  ModbusCoilItem,
  ModbusCommand,
  ModbusRegisterItem,
} from '@app/typedef/define/modbus/Modbus';
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
  composeName,
  duplicatedNames,
  expectedBitCount,
  expectedFieldCount,
  fcPrefixKey,
  fieldBaseName,
  fitBitNames,
  fitFieldNames,
  frameQuantityOf,
  nameBodyOf,
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

/** 读寄存器单次可读的寄存器数上限（与后端 ModbusConfigService.MAX_READ_REGISTERS 同口径）。 */
const MAX_READ_REGISTERS = 125;

/** 读位单次可读的位/线圈个数上限（与后端 ModbusConfigService.MAX_READ_BITS 同口径，Modbus 规范 0x07D0）。 */
const MAX_READ_BITS = 2000;

/**
 * 功能码添加/编辑对话框。
 * 每个「表单值」都是独立小组件（command/ 下一个表单值对应一个子目录，共 11 个：
 * 名称/功能码/起始地址/逻辑地址/数量/数据格式/字节序/缩放系数/单位/线圈状态/寄存器值），
 * 本组件只做两件事：
 * 1) 持有全部值信号并统一做校验(valid)、变更判定(changed)、提交(buildCommand)；
 * 2) 按功能码组合展示哪些字段（0F/10 复用多线圈/多寄存器表格块组件）。
 * 跨字段联动（数据格式→字节序、功能码切换→重置字段）也集中在这里。
 *
 * 名称带「读」/「写」前缀：由功能码决定、页面自动加上，对话框里存的是**主体**，
 * 提交时才拼成完整名称（存量数据「读蒸发器进水温度」同形）。
 * 读操作的「数量」按功能码有两种口径：01/02 是位/线圈个数，03/04 是**值的个数**
 * （每个值占数据格式的寄存器跨度）。应答命名也跟着这两种口径走（见 quantity 组件）：
 * 03/04 每个值一个字段名（fieldNames，与数量一一对应）；01/02 位区整段只是一个字段，
 * 命名的是**位**（bitNames：第 N 位 → 位名，生成服务时进该字段的 bit-list）。
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
  private readonly translate = inject(TranslateService);

  /** 原始命令（无 = 新增模式）。 */
  readonly data: ModbusCommand | undefined = this.modalData?.command;

  /** 只读查看（详情模式）：控件禁用、仅可关闭，不产生提交。 */
  protected readonly readOnly = this.modalData?.readOnly ?? false;

  /** 新增模式（无原始数据） */
  protected readonly isAdd = !this.data;

  protected readonly readBitFcs = READ_BIT_FCS;
  protected readonly readRegFcs = READ_REG_FCS;

  protected readonly fc = signal<string>(this.data?.fc ?? DEFAULT_FC);
  /** 名称主体（「读」/「写」前缀由功能码决定，见 {@link prefix}） */
  protected readonly nameBody = signal(
    nameBodyOf(this.data?.name, this.prefixOf(this.data?.fc ?? DEFAULT_FC)),
  );
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
  /** 应答字段名称（03/04 读寄存器；留空的行按默认名提交） */
  protected readonly fieldNames = signal<string[]>(this.data?.fieldNames ?? []);
  /** 位名称（01/02 读位；只收命名了的位，其余位不单独出值） */
  protected readonly bitNames = signal<ModbusBitName[]>(this.data?.bitNames ?? []);

  /** 名称前缀（「读」/「写」）：由功能码决定，页面自动加上。 */
  protected readonly prefix = computed(() => this.prefixOf(this.fc()));

  /** 完整名称（前缀 + 主体）：行内展示、字段名兜底与提交都用它。 */
  protected readonly name = computed(() => composeName(this.prefix(), this.nameBody()));

  /** 应答字段名称个数（03/04 string 为 1、其余为数量；01/02 与写操作为 0）。 */
  protected readonly fieldCount = computed(() =>
    expectedFieldCount(this.fc(), this.quantity(), this.dataType()),
  );

  /** 位名称行数（01/02 = 位/线圈个数；其余功能码为 0）。 */
  protected readonly bitCount = computed(() => expectedBitCount(this.fc(), this.quantity()));

  /** 提交口径的字段名称（个数与功能码对齐、空位补默认名：命令名称的主体）。 */
  protected readonly fields = computed(() =>
    fitFieldNames(this.fieldNames(), this.fieldCount(), this.nameBody()),
  );

  /** 提交口径的位名称（01/02：只留命名了的位，偏移落在数量内、按偏移升序）。 */
  protected readonly bits = computed(() => fitBitNames(this.bitNames(), this.bitCount()));

  /** 01/02 整段位掩码那个应答字段的名字（位区整段只有一个字段，逐位名不能与它撞）。 */
  protected readonly maskField = computed(() => fieldBaseName(this.name()));

  /** 03/04 应答字段名里的重名（后端会拒，这里先标出来并拦住确认）。 */
  protected readonly fieldConflicts = computed(() => duplicatedNames(this.fields()));

  /** 01/02 位名里的重名（含与整段位掩码字段名撞名）。 */
  protected readonly bitConflicts = computed(() =>
    duplicatedNames([this.maskField(), ...this.bits().map((bit) => bit.name)]),
  );

  /** 03/04 读寄存器：帧里实际要读的寄存器数（数量 × 类型跨度；string 即数量本身）。 */
  protected readonly registerCount = computed(() =>
    frameQuantityOf(this.fc(), this.quantity(), this.dataType()),
  );

  /** 数量控件的行内提示参数（帧里要读的寄存器数）。 */
  protected readonly registerHintParams = computed(() => ({ count: this.registerCount() }));

  /** 数量上限：读寄存器受单次 125 个寄存器限制（一个值占 1–2 个寄存器），读位按规范 2000 个位/线圈。 */
  protected readonly quantityMax = computed(() => {
    if (READ_REG_FCS.has(this.fc())) {
      return Math.max(1, Math.floor(MAX_READ_REGISTERS / (registerSpan(this.dataType()) ?? 1)));
    }
    return READ_BIT_FCS.has(this.fc()) ? MAX_READ_BITS : 255;
  });

  /** 03/04 读寄存器：当前数据格式下可用的字节序子集（16 位只有 大端/小端）。 */
  protected readonly byteOrderOptions = computed<ModbusByteOrder[]>(() =>
    byteOrderOptionsFor(this.dataType()).map((o) => o.value as ModbusByteOrder),
  );

  /** 通用表单项（名称/功能码/起始地址）与按功能码的值区是否合法。 */
  readonly valid = computed(() => {
    if (this.nameBody().trim().length === 0) {
      return false;
    }
    const start = this.start();
    if (start == null || start < 0) {
      return false;
    }
    const f = this.fc();
    if (READ_BIT_FCS.has(f)) {
      const q = this.quantity();
      // 位名与整段位掩码字段名共用一个命名空间，重名后端会拒，故这里也拦住确认
      return !!q && q > 0 && q <= MAX_READ_BITS && this.bitConflicts().size === 0;
    }
    if (READ_REG_FCS.has(f)) {
      const q = this.quantity();
      return (
        !!this.dataType() &&
        !!this.byteOrder() &&
        !!q &&
        q > 0 &&
        this.registerCount() <= MAX_READ_REGISTERS &&
        this.fieldConflicts().size === 0
      );
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
      JSON.stringify(this.registers()) !== JSON.stringify(toRegRows(this.data.registers)) ||
      JSON.stringify(this.fields()) !== JSON.stringify(this.dataFields()) ||
      JSON.stringify(this.bits()) !== JSON.stringify(this.dataBits())
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

  /** 功能码切换：清空与该功能码无关的读写字段，落到该功能码的默认值（名称主体保留，只换前缀）。 */
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
    this.fieldNames.set([]);
    this.bitNames.set([]);
  }

  /** 数据格式变化（03/04）：必要时回落字节序；数量是「值的个数」，只在超出寄存器上限时收一收。 */
  protected onDataTypeChange(value: string | undefined): void {
    this.dataType.set(value);
    if (!value) {
      return;
    }
    const bo = this.byteOrder();
    if (!byteOrderOptionsFor(value).some((o) => o.value === bo)) {
      this.byteOrder.set('ABCD');
    }
    // 32 位类型一个值占 2 个寄存器，数量上限随类型减半，避免切类型后落到「读不出」的非法值
    const quantity = this.quantity();
    if (quantity != null && quantity > this.quantityMax()) {
      this.quantity.set(this.quantityMax());
    }
  }

  /** 原始命令的字段名称（按当前功能码口径补齐），用于变更判定。 */
  private dataFields(): string[] {
    return fitFieldNames(this.data?.fieldNames, this.fieldCount(), this.nameBody());
  }

  /** 原始命令的位名称（按当前功能码口径收口成 {offset,name}），用于变更判定。 */
  private dataBits(): ModbusBitName[] {
    return fitBitNames(this.data?.bitNames, this.bitCount());
  }

  /** 名称前缀（「读」/「写」）文案：按当前语言取。 */
  private prefixOf(fc: string): string {
    return this.translate.instant(fcPrefixKey(fc));
  }

  /** 提交：按当前功能码组出干净的 ModbusCommand（空串转 undefined）。 */
  private buildCommand(): ModbusCommand {
    const f = this.fc();
    const cmd: ModbusCommand = {
      name: this.name().trim(),
      fc: f as ModbusCommand['fc'],
      // 行序 index 由编辑器统一重排（新增置 0 占位、编辑沿用原值，返回后 editor 再按位置覆写）
      index: this.data?.index ?? 0,
      start: this.start(),
    };
    const start = this.start() ?? 0;
    if (READ_BIT_FCS.has(f)) {
      cmd.quantity = this.quantity();
      // 位区整段只有一个应答字段（位掩码），逐位名称在这里
      cmd.bitNames = this.bits();
    } else if (READ_REG_FCS.has(f)) {
      cmd.quantity = this.quantity();
      // 应答字段名：非 string 与数量一一对应，string 整段只有一个
      cmd.fieldNames = this.fields();
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
