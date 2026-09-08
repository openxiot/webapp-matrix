import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';

/** 表单值组件：单位（03/04 读寄存器；如 ℃ / kPa）。 */
@Component({
  selector: 'modbus-command-unit',
  standalone: true,
  templateUrl: './command.unit.component.html',
  imports: [FormsModule, NzFormModule, NzInputModule, TranslatePipe],
})
export class CommandUnitComponent {
  readonly unit = model<string>('');
  /** 只读（详情查看）：控件禁用。 */
  readonly readOnly = input(false);

  protected onInput($event: Event): void {
    this.unit.set(($event.target as HTMLInputElement).value);
  }
}
