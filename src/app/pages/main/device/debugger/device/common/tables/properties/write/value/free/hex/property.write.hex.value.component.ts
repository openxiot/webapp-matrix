import {Component, EventEmitter, Input, Output, ChangeDetectionStrategy} from '@angular/core';
import {NzInputDirective} from 'ng-zorro-antd/input';
import {Property} from '@openxiot/xiot-core-spec-ts';
import {countHexChars, formatHexValue, hexCaretAfter, sanitizeHex} from '../../../../../hex-value';

@Component({
    selector: 'property-write-hex-value',
    templateUrl: './property.write.hex.value.component.html',
    styleUrls: ['./property.write.hex.value.component.less'],
    imports: [
        NzInputDirective
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class PropertyWriteHexValueComponent {

  /** 语义值:连续大写 hex(无空格),与 Vhex 的原始形态一致 */
  value: string = '';

  @Input() property: Property | undefined;

  @Output() valueChange = new EventEmitter<any>();

  /** 展示值:按字节(2 位)空格分组 */
  get text(): string {
    return formatHexValue(this.value);
  }

  onInput($event: Event) {
    const input = $event.target as HTMLInputElement;
    const caret = input.selectionStart ?? input.value.length;
    // 光标前有效 hex 数(显示空格视为透明)
    const hexBeforeCaret = countHexChars(input.value.slice(0, caret));
    const raw = sanitizeHex(input.value);
    if (raw !== this.value) {
      this.value = raw;
      this.valueChange.emit(this.value);
    }
    // 统一回写为分组展示串:非 hex 输入被剔除,字节间自动补空格
    const formatted = formatHexValue(raw);
    if (input.value !== formatted) {
      input.value = formatted;
      const pos = hexCaretAfter(formatted, hexBeforeCaret);
      try {
        input.setSelectionRange(pos, pos);
      } catch {
        // 非聚焦/不可选区时忽略
      }
    }
  }
}
