import { Component, computed, inject, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { ModbusByteOrder } from '../../../../../typedef/define/modbus/Modbus';
import {
  DATA_TYPE_OPTIONS,
  byteOrderNoteKey,
  byteOrderOptionsFor,
  quantityForDataType,
} from '../point.options';

/**
 * 03/04 读寄存器的表单值区（独立值组件，随功能码出现于添加/编辑功能码对话框）：
 * 数量 / 数据格式 / 字节序 / 缩放系数 / 单位。值以 model() 双向绑定暴露，
 * 任何持有这些值的宿主（信号或普通属性）均可复用。
 * - 非 string 类型占用的寄存器数固定 → 数量锁为类型跨度；
 * - 数据格式变化时自动回填数量，并把不再可用的字节序回落为 ABCD。
 */
@Component({
  selector: 'modbus-command-read-registers',
  standalone: true,
  templateUrl: './command.read-registers.block.component.html',
  imports: [
    FormsModule,
    NzFormModule,
    NzInputModule,
    NzInputNumberModule,
    NzSelectModule,
    TranslatePipe,
  ],
})
export class ReadRegistersBlockComponent {
  /** 占用的寄存器个数（03/04；非 string 类型自动等于类型跨度并锁定）。 */
  readonly quantity = model<number | undefined>();
  /** 数据格式（DATA_TYPE_OPTIONS）。 */
  readonly dataType = model<string | undefined>();
  /** 字节序（ABCD（大端）…；16 位只有 ABCD/DCBA）。 */
  readonly byteOrder = model<ModbusByteOrder>();
  /** 缩放系数（默认 1，范围 0-10）。 */
  readonly scale = model<number | undefined>();
  /** 单位，如 ℃ / kPa。 */
  readonly unit = model<string>();

  protected readonly dataTypeOptions = DATA_TYPE_OPTIONS;
  protected readonly byteOrderOptionsFor = byteOrderOptionsFor;
  private readonly translate = inject(TranslateService);

  /** 数量是否锁定：string 长度由用户决定放开编辑，其余固定为类型跨度。 */
  protected readonly quantityLocked = computed(
    () => !!this.dataType() && this.dataType() !== 'string',
  );

  protected onQuantityChange(value: number | null): void {
    this.quantity.set(value ?? undefined);
  }

  /** 数据格式变化：自动给数量（非 string = 类型跨度），必要时把字节序回落为 ABCD。 */
  protected onDataTypeChange(value: string): void {
    this.dataType.set(value);
    const q = quantityForDataType(value);
    if (q != null) {
      this.quantity.set(q);
    }
    const bo = this.byteOrder();
    if (!byteOrderOptionsFor(value).some((o) => o.value === bo)) {
      this.byteOrder.set('ABCD');
    }
  }

  protected onByteOrderChange(value: ModbusByteOrder): void {
    this.byteOrder.set(value);
  }

  protected onScaleChange(value: number | null): void {
    this.scale.set(value ?? undefined);
  }

  protected onUnitInput($event: Event): void {
    this.unit.set(($event.target as HTMLInputElement).value);
  }

  /** 字节序选项显示：在 ABCD 后标注含义，如 ABCD（大端）。 */
  protected byteOrderDisplay(value: string): string {
    const noteKey = byteOrderNoteKey(value);
    if (!noteKey) {
      return value;
    }
    return `${value}（${this.translate.instant(noteKey)}）`;
  }
}
