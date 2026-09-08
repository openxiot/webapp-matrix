import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';

/**
 * 表单值组件：数量。
 * - 01/02 读位：数量即位/线圈个数；
 * - 03/04 读寄存器：宿主把非 string 类型锁为类型跨度（locked=true），string 由用户给长度。
 */
@Component({
  selector: 'modbus-command-quantity',
  standalone: true,
  templateUrl: './command.quantity.component.html',
  styleUrl: './command.quantity.component.less',
  imports: [FormsModule, NzInputNumberModule, TranslatePipe],
})
export class CommandQuantityComponent {
  readonly quantity = model<number | undefined>();
  /** 只读（详情查看）：直接以纯文本展示值，不渲染控件。 */
  readonly readOnly = input(false);
  /** 额外锁定（03/04 非 string 数据格式时数量自动等于类型跨度，不可手改）。 */
  readonly locked = input(false);
  /** 可选的行内提示（i18n key）；不传则不显示。 */
  readonly hintKey = input('');

  protected onChange(value: number | null): void {
    this.quantity.set(value ?? undefined);
  }
}
