import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { COIL_STATE_OPTIONS } from '../point.options';

/** 表单值组件：线圈状态（05 写单个线圈；ON/OFF）。 */
@Component({
  selector: 'modbus-command-coil-state',
  standalone: true,
  templateUrl: './command.coil-state.component.html',
  imports: [FormsModule, NzFormModule, NzSelectModule, TranslatePipe],
})
export class CommandCoilStateComponent {
  readonly coilState = model<'on' | 'off'>('on');
  /** 只读（详情查看）：控件禁用。 */
  readonly readOnly = input(false);

  protected readonly coilStateOptions = COIL_STATE_OPTIONS;

  protected onChange(value: 'on' | 'off'): void {
    this.coilState.set(value);
  }
}
