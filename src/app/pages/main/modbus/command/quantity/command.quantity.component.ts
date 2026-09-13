import { Component, computed, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { ModbusBitName } from '../../../../../typedef/define/modbus/Modbus';
import { bitNameAt, defaultFieldName, logicalAddressOf } from '../point.options';

/**
 * 表单值组件：数量 + 应答字段名称 / 位名称（读操作）。
 * - 01/02 读位：数量即位/线圈个数；03/04 读寄存器：数量为**值的个数**（每个值占数据格式的寄存器跨度）；
 * - 数量的上限由宿主给出（读寄存器受单次可读寄存器数限制，32 位类型一个值占 2 个寄存器）。
 * - 03/04 的字段名称个数由宿主按功能码算出（{@link fieldCount}：string 为 1、其余为数量），
 *   逐个对应生成服务时的应答字段名；留空即用默认名（名称主体，多字段时在其后加序号），
 *   默认名同时作为输入框的 placeholder 展示。
 * - 01/02 的位区整段只有一个应答字段（位掩码），逐位取值靠 {@link bitNames}：每行一位（第 N 位 +
 *   逻辑地址），命名了的位在生成服务时进该字段的 bit-list、取值 0/1；留空即该位不单独出值。
 */
@Component({
  selector: 'modbus-command-quantity',
  standalone: true,
  templateUrl: './command.quantity.component.html',
  styleUrl: './command.quantity.component.less',
  imports: [FormsModule, NzInputModule, NzInputNumberModule, TranslatePipe],
})
export class CommandQuantityComponent {
  private readonly translate = inject(TranslateService);

  readonly quantity = model<number | undefined>();
  /** 应答字段名称（03/04 读寄存器，逐项可改；留空 = 用默认名） */
  readonly fieldNames = model<string[]>([]);
  /** 位名称（01/02 读位，逐位可改；只收命名了的位） */
  readonly bitNames = model<ModbusBitName[]>([]);
  /** 要展示的字段名称个数（0 = 不展示，宿主按功能码给出） */
  readonly fieldCount = input(0);
  /** 要展示的位名称个数（01/02 = 位/线圈个数；0 = 不展示，宿主按功能码给出） */
  readonly bitCount = input(0);
  /** 当前功能码 + 起始地址：算每行的逻辑地址用。 */
  readonly fc = input<string | undefined>();
  readonly start = input<number | undefined>();
  /** 数量上限（读寄存器受单次寄存器数限制；不传按 255） */
  readonly max = input<number | undefined>();
  /** 只读（详情查看）：直接以纯文本展示值，不渲染控件。 */
  readonly readOnly = input(false);
  /** 可选的行内提示（i18n key）；不传则不显示。 */
  readonly hintKey = input('');
  /** 行内提示的插值参数（如帧里要读的寄存器数）。 */
  readonly hintParams = input<Record<string, unknown> | undefined>();
  /** 当前命令的名称主体（不含「读」/「写」前缀）：拼默认字段名用 —— 字段名是读回来的值的标签。 */
  readonly name = input('');
  /**
   * 重名的取值名（宿主按提交口径算好，见 point.options 的 duplicatedNames）：
   * 命中的行标红、并在末尾提示，确认按钮同时由宿主拦住。
   */
  readonly conflicts = input<Set<string>>(new Set<string>());

  /** 字段名称的行号（0 基）。 */
  protected readonly rows = computed(() =>
    Array.from({ length: Math.max(0, this.fieldCount()) }, (_, i) => i),
  );

  /**
   * 位名称的行：编辑时逐位列出（第 1 位 … 第 N 位），只读时只列已命名的位
   * （详情页不必铺 N 行空位）。元素为位偏移（0 基）。
   */
  protected readonly bitRows = computed(() => {
    const count = Math.max(0, this.bitCount());
    if (!this.readOnly()) {
      return Array.from({ length: count }, (_, offset) => offset);
    }
    return this.bitNames()
      .map((bit) => bit.offset ?? 0)
      .filter((offset) => bitNameAt(this.bitNames(), offset).length > 0)
      .sort((a, b) => a - b);
  });

  /** 整段位掩码那个字段的名字：命令名称主体（生成服务时的兜底名，这里只是展示给用户看）。 */
  protected readonly maskField = computed(() => this.name().trim() || '-');

  protected onChange(value: number | null): void {
    this.quantity.set(value ?? undefined);
  }

  /** 该行的当前名称（可能为空 = 用默认名）。 */
  protected fieldValue(index: number): string {
    return this.fieldNames()[index] ?? '';
  }

  /** 该行的默认名称（留空时显示，也是生成服务时的兜底名）。 */
  protected fieldPlaceholder(index: number): string {
    return defaultFieldName(this.name(), index, this.fieldCount());
  }

  protected onFieldInput(index: number, $event: Event): void {
    const value = ($event.target as HTMLInputElement).value;
    this.fieldNames.update((list) => {
      const copy = [...list];
      while (copy.length <= index) {
        copy.push('');
      }
      copy[index] = value;
      return copy;
    });
  }

  /** 该位的名称（未命名返回空串）。 */
  protected bitValue(offset: number): string {
    return bitNameAt(this.bitNames(), offset);
  }

  /** 该行提交出去的名字：改了用改的，留空用默认名（与 fitFieldNames 同口径）。 */
  protected submittedFieldValue(index: number): string {
    return this.fieldValue(index).trim() || this.fieldPlaceholder(index);
  }

  /** 该字段行是否与别的取值名重复。 */
  protected fieldConflict(index: number): boolean {
    return this.conflicts().has(this.submittedFieldValue(index));
  }

  /** 该位是否与别的取值名重复（含与整段位掩码字段名撞名）。 */
  protected bitConflict(offset: number): boolean {
    return this.conflicts().has(this.bitValue(offset).trim());
  }

  /** 整段位掩码字段名是否与某个位名重复。 */
  protected maskConflict(): boolean {
    return this.conflicts().has(this.name().trim());
  }

  /** 重名的取值名（提示文案里逐个列出）。 */
  protected conflictNames(): string {
    return [...this.conflicts()].join('、');
  }

  /** 该位的行标（「第 N 位」，N 为 1 基，与用户数位数的习惯一致）。 */
  protected bitLabel(offset: number): string {
    return this.translate.instant('第 {{n}} 位', { n: offset + 1 });
  }

  /** 该位的逻辑地址（工程号，00001/10001 两种区段）；起始地址未填时给空串。 */
  protected bitAddress(offset: number): string {
    const start = this.start();
    const address = start == null ? undefined : logicalAddressOf(this.fc(), start + offset);
    return address == null ? '' : String(address);
  }

  /** 改写某一位的名称；清空即删除该位（不单独出值）。 */
  protected onBitInput(offset: number, $event: Event): void {
    const value = ($event.target as HTMLInputElement).value;
    this.bitNames.update((list) => {
      const kept = list.filter(
        (bit) => (bit.offset ?? 0) !== offset && (bit.name ?? '').trim().length > 0,
      );
      if (value.trim().length === 0) {
        return kept;
      }
      return [...kept, { offset, name: value }].sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0));
    });
  }
}
