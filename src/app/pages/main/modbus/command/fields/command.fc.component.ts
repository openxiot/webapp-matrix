import { Component, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { FC_OPTIONS, fcLabelKey } from '../point.options';

/** 表单值组件：功能码（8 个功能码下拉，切换后字段随功能码变化由宿主处理）。 */
@Component({
  selector: 'modbus-command-fc',
  standalone: true,
  templateUrl: './command.fc.component.html',
  imports: [FormsModule, NzFormModule, NzSelectModule, TranslatePipe],
})
export class CommandFcComponent {
  readonly fc = model<string>('');
  /** 只读（详情查看）：控件禁用。 */
  readonly readOnly = input(false);

  protected readonly options = FC_OPTIONS;
  private readonly translate = inject(TranslateService);

  protected onChange(value: string): void {
    this.fc.set(value);
  }

  /** 功能码显示：如 "03 读取保持寄存器"。 */
  protected display(fc: string): string {
    return `${fc} ${this.translate.instant(fcLabelKey(fc))}`;
  }
}
