import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { DATA_TYPE_OPTIONS } from '../point.options';

/** 表单值组件：数据格式（03/04 读寄存器；切换后数量/字节序联动由宿主处理）。 */
@Component({
  selector: 'modbus-command-data-type',
  standalone: true,
  templateUrl: './command.data-type.component.html',
  styleUrl: './command.data-type.component.less',
  imports: [FormsModule, NzSelectModule],
})
export class CommandDataTypeComponent {
  readonly dataType = model<string | undefined>();
  /** 只读（详情查看）：直接以纯文本展示值，不渲染控件。 */
  readonly readOnly = input(false);

  protected readonly dataTypeOptions = DATA_TYPE_OPTIONS;

  protected onChange(value: string): void {
    this.dataType.set(value);
  }
}
