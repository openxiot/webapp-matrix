import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzInputModule } from 'ng-zorro-antd/input';

/** 表单值组件：单位（03/04 读寄存器；如 ℃ / kPa）。 */
@Component({
  selector: 'modbus-command-unit',
  standalone: true,
  templateUrl: './command.unit.component.html',
  styleUrl: './command.unit.component.less',
  imports: [FormsModule, NzInputModule],
})
export class CommandUnitComponent {
  readonly unit = model<string>('');
  /** 只读（详情查看）：直接以纯文本展示值，不渲染控件。 */
  readonly readOnly = input(false);

  protected onInput($event: Event): void {
    this.unit.set(($event.target as HTMLInputElement).value);
  }
}
