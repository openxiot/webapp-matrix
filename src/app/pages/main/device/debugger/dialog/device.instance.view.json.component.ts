import {Component, inject} from '@angular/core';
import {NZ_MODAL_DATA, NzModalRef} from 'ng-zorro-antd/modal';
import {JsonPipe} from "@angular/common";

/**
 * 设备实例定义 JSON 查看对话框：展示传入的（已由 DeviceInstanceCodec.encode 编码的）
 * 设备实例定义对象。底部「下载 / 关闭」按钮由调用方在 modal.create 的 nzFooter 提供，
 * 本组件仅负责把当前数据原样交回（ok）或关闭（cancel）。
 *
 * 参考 webapp-product 的 ProductInstanceViewJsonComponent 实现与用法。
 */
@Component({
  selector: 'device-instance-view-json',
  templateUrl: './device.instance.view.json.component.html',
  styleUrl: './device.instance.view.json.component.less',
  imports: [
    JsonPipe,
  ],
  standalone: true
})
export class DeviceInstanceViewJsonComponent {

  readonly #modal = inject(NzModalRef);
  readonly message: any = inject(NZ_MODAL_DATA);

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  ok(): void {
    this.#modal.destroy(this.message);
  }
}
