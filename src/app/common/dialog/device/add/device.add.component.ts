import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzModalRef } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzFormModule } from 'ng-zorro-antd/form';
import { TranslatePipe } from '@ngx-translate/core';

/** 15 位纯数字 IMEI（同 android-matrix ProjectViewModel.IMEI_REGEX） */
const IMEI_REGEX = /^\d{15}$/;

/**
 * 添加设备（输入 IMEI）对话框：输入 15 位 IMEI，确认后返回 IMEI 字符串，
 * 由调用方（设备列表页 / 项目详情页）先经 DTU 网关解析 DID 再登记到目标空间。
 */
@Component({
  selector: 'device-add',
  templateUrl: './device.add.component.html',
  imports: [FormsModule, NzInputModule, NzFormModule, TranslatePipe],
})
export class DeviceAddComponent {
  readonly #modal = inject(NzModalRef);

  readonly imei = signal('');

  /** 合法 15 位数字 IMEI 才能确认 */
  readonly valid = computed(() => IMEI_REGEX.test(this.imei().trim()));

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  ok(): void {
    if (!this.valid()) {
      return;
    }
    this.#modal.destroy(this.imei().trim());
  }

  protected onImeiInput($event: Event): void {
    this.imei.set(($event.target as HTMLInputElement).value);
  }
}
