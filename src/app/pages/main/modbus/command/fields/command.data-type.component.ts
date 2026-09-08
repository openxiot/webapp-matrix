import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { DATA_TYPE_OPTIONS } from '../point.options';

/** 表单值组件：数据格式（03/04 读寄存器；切换后数量/字节序联动由宿主处理）。 */
@Component({
  selector: 'modbus-command-data-type',
  standalone: true,
  templateUrl: './command.data-type.component.html',
  imports: [FormsModule, NzFormModule, NzSelectModule, TranslatePipe],
})
export class CommandDataTypeComponent {
  readonly dataType = model<string | undefined>();
  /** 只读（详情查看）：控件禁用。 */
  readonly readOnly = input(false);

  protected readonly dataTypeOptions = DATA_TYPE_OPTIONS;

  protected onChange(value: string): void {
    this.dataType.set(value);
  }
}
