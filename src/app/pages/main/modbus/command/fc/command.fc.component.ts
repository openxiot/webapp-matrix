import { Component, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { FC_OPTIONS, fcLabelKey, isWriteFc } from '../point.options';

/** 表单值组件：功能码（8 个功能码下拉，切换后字段随功能码变化由宿主处理）。 */
@Component({
  selector: 'modbus-command-fc',
  standalone: true,
  templateUrl: './command.fc.component.html',
  styleUrl: './command.fc.component.less',
  imports: [FormsModule, NzSelectModule, TranslatePipe],
})
export class CommandFcComponent {
  readonly fc = model<string>('');
  /** 只读（详情查看）：以彩色徽标 + 名称文字展示所选功能码，不渲染控件。 */
  readonly readOnly = input(false);

  protected readonly options = FC_OPTIONS;
  /** 模板用：功能码对应的名称 i18n key（如 "读取保持寄存器"）。 */
  protected readonly fcLabelKey = fcLabelKey;
  /** 模板用：写功能码（05/06/0F/10）徽标标红，读功能码（01–04）保持蓝色。 */
  protected readonly isWriteFc = isWriteFc;

  private readonly translate = inject(TranslateService);

  protected onChange(value: string): void {
    this.fc.set(value);
  }

  /** 下拉选项显示：如 "03 读取保持寄存器"。 */
  protected display(fc: string): string {
    return `${fc} ${this.translate.instant(fcLabelKey(fc))}`;
  }
}
