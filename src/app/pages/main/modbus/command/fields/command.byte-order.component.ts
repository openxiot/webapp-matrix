import { Component, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { ModbusByteOrder } from '../../../../../typedef/define/modbus/Modbus';
import { byteOrderNoteKey } from '../point.options';

/** 表单值组件：字节序（03/04 读寄存器；可选子集随数据格式由宿主传入，如 16 位只有 大端/小端）。 */
@Component({
  selector: 'modbus-command-byte-order',
  standalone: true,
  templateUrl: './command.byte-order.component.html',
  imports: [FormsModule, NzFormModule, NzSelectModule, TranslatePipe],
})
export class CommandByteOrderComponent {
  readonly byteOrder = model<ModbusByteOrder>();
  /** 当前数据格式下可用的字节序子集。 */
  readonly options = input<ModbusByteOrder[]>([]);
  /** 只读（详情查看）：控件禁用。 */
  readonly readOnly = input(false);

  private readonly translate = inject(TranslateService);

  protected onChange(value: ModbusByteOrder): void {
    this.byteOrder.set(value);
  }

  /** 字节序选项显示：在 ABCD 后标注含义，如 ABCD（大端）。 */
  protected display(value: ModbusByteOrder): string {
    const noteKey = byteOrderNoteKey(value);
    if (!noteKey) {
      return value;
    }
    return `${value}（${this.translate.instant(noteKey)}）`;
  }
}
