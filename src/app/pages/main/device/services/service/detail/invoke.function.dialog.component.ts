import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { TranslatePipe } from '@ngx-translate/core';
import {
  ModbusFunction,
  ModbusFunctionRequest,
  ModbusFunctionRequestField,
} from '@app/typedef/define/modbus/ModbusService';
import { fcLabelKey, isWriteFc } from '../../../../modbus/command/point.options';
import {
  FunctionWriteValues,
  previewFunctionRequestFrame,
} from '../../../../modbus/editor/request/request.frame';

/** 调用弹窗数据：要调用的那个写方法 */
export interface ServiceInvokeDialogData {
  func: ModbusFunction;
}

/** 交回页面的值：字段名 → 原始值（位是布尔、寄存器是数值），带缺省值的也一并带上 */
export type ServiceInvokeValues = Record<string, boolean | number>;

/**
 * 一个待填的写入字段：位字段出「开/关」下拉，寄存器字段出数字框。
 * `field.field`（字段名）与 `format` 都是点表数据 / 技术标识，界面上**原样显示、不翻译**。
 */
interface InvokeField {
  field: ModbusFunctionRequestField;
  /** 位字段（05/0F）：只有开、关两个候选 */
  bit: boolean;
  /** 数字框的取值范围：**按 format 给**，与后端 validateWriteValue 同口径；float32 不限 */
  min: number;
  max: number;
}

/**
 * 各寄存器格式的取值范围。float32 不在表里 = 不限（后端对 float32 也不做范围校验，
 * 它收的就是一个浮点数，由 Float.floatToIntBits 编成 32 位）。
 */
const FORMAT_RANGE: Record<string, [number, number]> = {
  int16: [-32768, 32767],
  uint16: [0, 65535],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
};

/** 待填字段：按 index 升序 —— 帧里的书写顺序就是它（后端组帧也按这个序） */
function invokeFieldsOf(request: ModbusFunctionRequest | undefined): InvokeField[] {
  return [...(request?.fields ?? [])]
    .sort((a, b) => a.index - b.index)
    .map((field) => {
      const bit = field.format === 'bit';
      const range = bit ? undefined : FORMAT_RANGE[field.format];
      return {
        field,
        bit,
        // ±Infinity 是「不限」：ng-zorro 自己的缺省也是它。给 null 会被当成 0（`value >= null`）
        min: range?.[0] ?? -Infinity,
        max: range?.[1] ?? Infinity,
      };
    });
}

/** 开箱即用的值：字段定义里带缺省值的先填上，没有缺省值的留空（用户必须自己填） */
function seededValues(rows: InvokeField[]): Map<number, boolean | number> {
  const seeded = new Map<number, boolean | number>();
  for (const row of rows) {
    const value = row.field.value;
    // false / 0 都是正经的值（关、零），只能用 undefined 判「没给」——不能用 `||`
    if (value !== undefined) {
      seeded.set(row.field.index, value);
    }
  }
  return seeded;
}

/**
 * 写方法的**调用**对话框：把该方法请求帧里的写入字段逐行列出来让用户填，填完点「确定」调用。
 *
 * 为什么写方法不能像读方法那样一键调用：v2 的服务定义里，写字段的 `value` 只是**缺省值**
 * （`06`/`10` 的字段甚至可能没有），真正下发的值由 invoke 时的 `values` 决定。读方法没有 values，
 * 所以详情页对读方法是直接调用、对写方法先开这个对话框（见 DeviceServiceDetailComponent.invoke）。
 *
 * 两件事都在这里当场算出来，不另发请求：
 * - **值**：每个字段一个控件，预填字段自带的缺省值，用户可改；`values` 按**字段名**给出去
 *   （与后端 `resolveValue` 认的键一致）；
 * - **请求帧**：底部实时预览，与详情页「请求帧」列、点表「命令」预览共用同一套组帧算式
 *   （见 request.frame 的 previewFunctionRequestFrame）。字段没填全时预览会拒绝出帧，
 *   这时底部给提示、`valid()` 为 false，页面据此把「确定」按钮禁掉 —— **所见即所发**。
 */
@Component({
  selector: 'device-service-invoke-dialog',
  templateUrl: './invoke.function.dialog.component.html',
  styleUrl: './invoke.function.dialog.component.less',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormsModule,
    NzAlertModule,
    NzInputNumberModule,
    NzSelectModule,
    NzTableModule,
    TranslatePipe,
  ],
})
export class DeviceServiceInvokeDialogComponent {
  private readonly modal = inject(NzModalRef);
  protected readonly data: ServiceInvokeDialogData = inject(NZ_MODAL_DATA);

  protected readonly fcLabelKey = fcLabelKey;
  protected readonly isWriteFc = isWriteFc;

  /** 待填字段（按 index 升序） */
  protected readonly rows = invokeFieldsOf(this.data.func.request);

  /** 各字段此刻的值，key = 字段 index：**没填的字段整个键都不在表里**（清空即删键） */
  private readonly values = signal(seededValues(this.rows));

  /** 本地预览：值一变就重算（缺省值填补上的那些也一并算进去） */
  private readonly preview = computed(() =>
    previewFunctionRequestFrame(this.data.func.request, this.wireValues()),
  );

  /** 预览出的帧（十六进制）；空串 = 组不出来（字段没填全） */
  protected readonly frameHex = computed<string>(() => {
    const result = this.preview();
    return result.ok ? result.frame.hex : '';
  });

  /** 预览帧的字节数 */
  protected readonly frameCount = computed<number>(() => {
    const result = this.preview();
    return result.ok ? result.frame.count : 0;
  });

  /** 组不出帧时的提示（既有键「命令数据不完整，无法生成请求帧」） */
  protected readonly incompleteKey = computed<string>(() => {
    const result = this.preview();
    return result.ok ? '' : result.messageKey;
  });

  /** 该字段此刻的值；null = 没填（控件显示占位符） */
  protected valueOf(row: InvokeField): boolean | number | null {
    const value = this.values().get(row.field.index);
    return value === undefined ? null : value;
  }

  /** 数据格式 + 字节序（技术标识，不翻译）：位字段只有 `bit`，没有字节序 */
  protected formatText(row: InvokeField): string {
    const order = row.field.byteOrder;
    return order ? `${row.field.format} ${order}` : row.field.format;
  }

  /** 改一个字段的值（清空 = 把这个键删掉，不拿 null / 0 冒充「没填」） */
  protected onValue(row: InvokeField, value: boolean | number | null): void {
    this.values.update((map) => {
      const next = new Map(map);
      if (value == null) {
        next.delete(row.field.index);
      } else {
        next.set(row.field.index, value);
      }
      return next;
    });
  }

  /**
   * 「确定」可用：帧组得出来 = 每个字段都有值（自带缺省值的算有）。页面据此禁按钮（见 openInvokeDialog）。
   */
  valid(): boolean {
    return this.preview().ok;
  }

  /** 「确定」：把值交回页面 —— 每个字段都给值（缺省值也在内），所见即所发 */
  ok(): void {
    if (!this.valid()) {
      return;
    }
    this.modal.destroy(this.wireValues());
  }

  /** 「取消」/ 关窗 / 点遮罩：交回 undefined，页面什么都不发 */
  cancel(): void {
    this.modal.destroy(undefined);
  }

  /**
   * 交给后端 invoke 的 `values`：字段名 → 原始值，**没填的字段不出键** ——
   * 于是后端就按字段定义里的缺省值兜（与上面那份预览同一口径：预览也是这么折的）。
   */
  private wireValues(): FunctionWriteValues {
    const values: FunctionWriteValues = {};
    for (const row of this.rows) {
      const value = this.values().get(row.field.index);
      if (value !== undefined) {
        values[row.field.field] = value;
      }
    }
    return values;
  }
}
