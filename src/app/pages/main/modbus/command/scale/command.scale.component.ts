import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';

/** 表单值组件：缩放系数（03/04 读寄存器；默认 1，范围 0-10）。 */
@Component({
  selector: 'modbus-command-scale',
  standalone: true,
  templateUrl: './command.scale.component.html',
  styleUrl: './command.scale.component.less',
  imports: [FormsModule, NzInputNumberModule],
})
export class CommandScaleComponent {
  readonly scale = model<number | undefined>();
  /** 只读（详情查看）：直接以纯文本展示值，不渲染控件。 */
  readonly readOnly = input(false);

  protected onChange(value: number | null): void {
    this.scale.set(value ?? undefined);
  }
}
