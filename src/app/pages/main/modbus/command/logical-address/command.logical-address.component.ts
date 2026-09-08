import { Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { logicalAddressOf } from '../point.options';

/** 表单值组件：逻辑地址（只读展示，由 功能码+起始地址 换算，非可编辑值）。 */
@Component({
  selector: 'modbus-command-logical-address',
  standalone: true,
  templateUrl: './command.logical-address.component.html',
  styleUrl: './command.logical-address.component.less',
  imports: [TranslatePipe],
})
export class CommandLogicalAddressComponent {
  readonly fc = input<string>('');
  readonly start = input<number | undefined>();

  protected readonly logicalAddress = computed(() => logicalAddressOf(this.fc(), this.start()));
}
