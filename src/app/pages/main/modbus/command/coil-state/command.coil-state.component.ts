import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { COIL_STATE_OPTIONS, coilStateText } from '../point.options';

/** 表单值组件：线圈状态（05 写单个线圈；ON/OFF）。 */
@Component({
  selector: 'modbus-command-coil-state',
  standalone: true,
  templateUrl: './command.coil-state.component.html',
  styleUrl: './command.coil-state.component.less',
  imports: [FormsModule, NzSelectModule],
})
export class CommandCoilStateComponent {
  readonly coilState = model<'on' | 'off'>('on');
  /** 只读（详情查看）：直接以纯文本展示值，不渲染控件。 */
  readonly readOnly = input(false);

  protected readonly coilStateText = coilStateText;
  protected readonly coilStateOptions = COIL_STATE_OPTIONS;

  protected onChange(value: 'on' | 'off'): void {
    this.coilState.set(value);
  }
}
