import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';

/** 表单值组件：名称（命令名称，必填文本框）。 */
@Component({
  selector: 'modbus-command-name',
  standalone: true,
  templateUrl: './command.name.component.html',
  imports: [FormsModule, NzFormModule, NzInputModule, TranslatePipe],
})
export class CommandNameComponent {
  readonly name = model<string>('');
  /** 只读（详情查看）：控件禁用。 */
  readonly readOnly = input(false);

  protected onInput($event: Event): void {
    this.name.set(($event.target as HTMLInputElement).value);
  }
}
