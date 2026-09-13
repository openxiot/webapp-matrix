import { Component, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { NzInputModule } from 'ng-zorro-antd/input';
import { WRITE_FCS, composeName, fcPrefixKey } from '../point.options';

/**
 * 表单值组件：名称（命令名称主体，必填文本框）。
 *
 * 前缀「读」/「写」由功能码决定、页面自动加上（读功能码 01–04 → 读，写功能码 05/06/0F/10 → 写），
 * 用 nz-input-wrapper 的 nzAddonBefore 展示 —— 用户只填主体，落到命令上的 name 是「前缀 + 主体」
 * （与存量数据的「读蒸发器进水温度」同形），故双向绑定的是主体而非完整名称。
 */
@Component({
  selector: 'modbus-command-name',
  standalone: true,
  templateUrl: './command.name.component.html',
  styleUrl: './command.name.component.less',
  imports: [FormsModule, NzInputModule, TranslatePipe],
})
export class CommandNameComponent {
  /** 名称主体（不含前缀） */
  readonly body = model<string>('');
  /** 当前功能码：决定前缀 */
  readonly fc = input<string>('');
  /** 只读（详情查看）：直接以纯文本展示完整名称，不渲染控件。 */
  readonly readOnly = input(false);

  private readonly translate = inject(TranslateService);

  /** 前缀文案（「读」/「写」；按当前语言即时取，故语言切换后随渲染刷新）。 */
  protected prefixText(): string {
    return this.translate.instant(fcPrefixKey(this.fc()));
  }

  /** 完整名称（前缀 + 主体）：只读（详情）展示用；编辑态的主体由宿主在提交时拼前缀。 */
  protected fullName(): string {
    return composeName(this.prefixText(), this.body());
  }

  /** 输入框占位示例：读/写各举一例（都只填主体，前缀已由页面加上）。 */
  protected placeholderKey(): string {
    return WRITE_FCS.has(this.fc()) ? '如：开机' : '如：进水温度';
  }

  protected onInput($event: Event): void {
    this.body.set(($event.target as HTMLInputElement).value);
  }
}
