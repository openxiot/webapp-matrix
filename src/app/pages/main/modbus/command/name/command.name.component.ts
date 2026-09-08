import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { NzInputModule } from 'ng-zorro-antd/input';

/** 表单值组件：名称（命令名称，必填文本框）。 */
@Component({
  selector: 'modbus-command-name',
  standalone: true,
  templateUrl: './command.name.component.html',
  styleUrl: './command.name.component.less',
  imports: [FormsModule, NzInputModule, TranslatePipe],
})
export class CommandNameComponent {
  readonly name = model<string>('');
  /** 只读（详情查看）：直接以纯文本展示值，不渲染控件。 */
  readonly readOnly = input(false);

  protected onInput($event: Event): void {
    this.name.set(($event.target as HTMLInputElement).value);
  }
}
