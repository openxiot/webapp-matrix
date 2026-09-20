import { Component, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { ModbusByteOrder } from '@app/typedef/define/modbus/Modbus';
import { defaultRegRow, type RegRow } from '../command.rows';
import {
  WRITE_REGISTER_DATA_TYPE_OPTIONS,
  byteOrderNoteKey,
  byteOrderOptionsFor,
  parseRegisterHex,
  registerSpan,
  registerValueHex,
} from '../point.options';

/**
 * 10 写多个寄存器的表单值区（独立值组件）：
 * 每行 = 一个寄存器，地址不手填，由起始地址按类型跨度自动连续排布（十进制显示）；
 * 数值按 16 进制原值输入（按类型位模式，如 int16 FFFF=-1 / uint16 1A2B / float32 位模式）。
 * 行列表经 model() 双向绑定暴露，起始地址经 start 单向读入。
 */
@Component({
  selector: 'modbus-command-multi-registers',
  standalone: true,
  templateUrl: './command.multi-registers.block.component.html',
  styleUrl: './command.multi-registers.block.component.less',
  imports: [
    FormsModule,
    NzFormModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzSelectModule,
    NzTableModule,
    TranslatePipe,
  ],
})
export class MultiRegistersBlockComponent {
  /** 寄存器编辑行。 */
  readonly registers = model<RegRow[]>([]);
  /** 命令起始地址（0 基，读入用，换算各寄存器地址）。 */
  readonly start = input<number | undefined>();
  /** 只读（详情查看）：各控件禁用，增删寄存器按钮隐藏。 */
  readonly readOnly = input(false);

  protected readonly registerTypeOptions = WRITE_REGISTER_DATA_TYPE_OPTIONS;
  private readonly translate = inject(TranslateService);

  /** 正在编辑的数值十六进制文本（保留下划线输入态，失焦归一到原值十六进制）。 */
  private hexValueTexts = new Map<number, string>();

  protected addRegister(): void {
    this.registers.update((list) => [...list, defaultRegRow()]);
  }

  protected removeRegister(index: number): void {
    this.registers.update((list) => list.filter((_, i) => i !== index));
    // 行序后移，让被删行之后的地址/输入态按新序重算
    this.hexValueTexts.clear();
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

  protected onRegByteOrderChange(index: number, value: ModbusByteOrder): void {
    this.registers.update((list) => {
      const copy = [...list];
      copy[index] = { ...copy[index], byteOrder: value };
      return copy;
    });
  }

  /** 数值十六进制输入：过滤非法字符、保留大写，按该行数据类型即时解析写回（有符号走补码）。 */
  protected onRegValueInput($event: Event, index: number): void {
    const input = $event.target as HTMLInputElement;
    const clean = input.value.trim().toUpperCase().replace(/^0X/, '').replace(/[^0-9A-F]/g, '');
    input.value = clean;
    this.hexValueTexts.set(index, clean);
    const dataType = this.registers()[index]?.dataType;
    this.registers.update((list) => {
      const copy = [...list];
      copy[index] = {
        ...copy[index],
        value: clean.length === 0 ? undefined : parseRegisterHex(clean, dataType),
      };
      return copy;
    });
  }

  /** 失焦：丢弃输入态，数值按解析出的原值按类型位模式归一展示。 */
  protected onRegValueBlur(index: number): void {
    this.hexValueTexts.delete(index);
  }

  /** 该行数值输入框的当前文本：输入态优先，否则按原值的类型位模式十六进制。 */
  protected regValueText(row: RegRow, index: number): string {
    const buffered = this.hexValueTexts.get(index);
    if (buffered != null) {
      return buffered;
    }
    return registerValueHex(row.value, row.dataType);
  }

  /** 行内字节序可选子集（16 位只有 ABCD/DCBA）。 */
  protected byteOrderOptionsForRow(row: RegRow) {
    return byteOrderOptionsFor(row.dataType);
  }

  /** 字节序选项显示：在 ABCD 后标注含义，如 ABCD（大端）。 */
  protected byteOrderDisplay(value: string): string {
    const noteKey = byteOrderNoteKey(value);
    if (!noteKey) {
      return value;
    }
    return `${value}（${this.translate.instant(noteKey)}）`;
  }
}
