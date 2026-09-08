import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { defaultCoilRow, type CoilRow } from '../command.rows';
import { COIL_STATE_OPTIONS } from '../point.options';

/**
 * 0F 写多个线圈的表单值区（独立值组件）：
 * 按需增删行，每行选 线圈状态（ON/OFF）；偏移由行序自动给出（0 基、不可改）。
 * 行列表经 model() 双向绑定暴露。
 */
@Component({
  selector: 'modbus-command-multi-coils',
  standalone: true,
  templateUrl: './command.multi-coils.block.component.html',
  styleUrl: './command.multi-coils.block.component.less',
  imports: [
    FormsModule,
    NzFormModule,
    NzButtonModule,
    NzIconModule,
    NzSelectModule,
    NzTableModule,
    TranslatePipe,
  ],
})
export class MultiCoilsBlockComponent {
  /** 线圈编辑行（偏移由行序给定）。 */
  readonly coils = model<CoilRow[]>([]);
  /** 只读（详情查看）：状态下拉禁用，增删行按钮隐藏。 */
  readonly readOnly = input(false);

  protected readonly coilStateOptions = COIL_STATE_OPTIONS;

  protected addCoil(): void {
    this.coils.update((list) => [...list, defaultCoilRow()]);
  }

  protected removeCoil(index: number): void {
    this.coils.update((list) => list.filter((_, i) => i !== index));
  }

  protected onCoilRowStateChange(index: number, value: 'on' | 'off'): void {
    this.coils.update((list) => {
      const copy = [...list];
      copy[index] = { ...copy[index], state: value };
      return copy;
    });
  }
}
