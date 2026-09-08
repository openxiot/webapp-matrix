import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';

/** 表单值组件：起始地址（十进制，0 基数据地址；0-65535，必填）。 */
@Component({
  selector: 'modbus-command-start',
  standalone: true,
  templateUrl: './command.start.component.html',
  styleUrl: './command.start.component.less',
  imports: [FormsModule, NzInputNumberModule],
})
export class CommandStartComponent {
  readonly start = model<number | undefined>();
  /** 只读（详情查看）：直接以纯文本展示值，不渲染控件。 */
  readonly readOnly = input(false);

  protected onChange(value: number | null): void {
    this.start.set(value ?? undefined);
  }
}
