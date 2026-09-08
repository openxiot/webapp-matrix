import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';

/** 表单值组件：寄存器值（06 写单个寄存器；16 位带符号范围，必填）。 */
@Component({
  selector: 'modbus-command-register-value',
  standalone: true,
  templateUrl: './command.register-value.component.html',
  imports: [FormsModule, NzFormModule, NzInputNumberModule, TranslatePipe],
})
export class CommandRegisterValueComponent {
  readonly registerValue = model<number | undefined>();
  /** 只读（详情查看）：控件禁用。 */
  readonly readOnly = input(false);

  protected onChange(value: number | null): void {
    this.registerValue.set(value ?? undefined);
  }
}
