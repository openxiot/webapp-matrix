import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';

/** 表单值组件：缩放系数（03/04 读寄存器；默认 1，范围 0-10）。 */
@Component({
  selector: 'modbus-command-scale',
  standalone: true,
  templateUrl: './command.scale.component.html',
  imports: [FormsModule, NzFormModule, NzInputNumberModule, TranslatePipe],
})
export class CommandScaleComponent {
  readonly scale = model<number | undefined>();
  /** 只读（详情查看）：控件禁用。 */
  readonly readOnly = input(false);

  protected onChange(value: number | null): void {
    this.scale.set(value ?? undefined);
  }
}
