import { Component, inject, signal } from '@angular/core';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { TranslatePipe } from '@ngx-translate/core';
import { ModbusCommand } from '../../../../typedef/define/modbus/Modbus';
import { fcLabelKey } from './point.options';
import {
  RequestFrame,
  RequestFramePart,
  describeRequestFrame,
} from './request.frame';

/** 「命令」预览对话框数据：所在行 + 已生成的请求帧（由编辑器负责生成与校验）。 */
export interface RequestFrameDialogData {
  command: ModbusCommand;
  frame: RequestFrame;
}

/**
 * 请求帧（十六进制）预览对话框。
 * 展示功能码动作对应的完整 Modbus RTU 请求帧（含从站地址与 CRC16），可一键复制。
 * 帧由 request.frame.buildRequestFrame 在编辑器侧先生成（数据不完整时提示不弹窗）。
 */
@Component({
  selector: 'modbus-request-frame-dialog',
  standalone: true,
  templateUrl: './request.frame.dialog.component.html',
  styleUrl: './request.frame.dialog.component.less',
  imports: [NzButtonModule, TranslatePipe],
})
export class RequestFrameDialogComponent {
  readonly #modal = inject(NzModalRef);
  protected readonly data: RequestFrameDialogData = inject(NZ_MODAL_DATA);

  /** 请求帧的字段级解析（从站/功能码/地址/数量/数据区/CRC16）。 */
  protected readonly parts: RequestFramePart[] = describeRequestFrame(
    this.data.command,
    this.data.frame,
  );

  protected readonly fcLabelKey = fcLabelKey;
  protected readonly copied = signal(false);
  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  /** 复制十六进制文本到剪贴板（不可用或失败时静默，仅按钮文字反馈）。 */
  protected copy(): void {
    const text = this.data.frame.hex;
    if (!text) {
      return;
    }
    const done = () => {
      this.copied.set(true);
      if (this.copyTimer) {
        clearTimeout(this.copyTimer);
      }
      this.copyTimer = setTimeout(() => this.copied.set(false), 1500);
    };
    const clipboard = navigator.clipboard;
    if (clipboard?.writeText) {
      clipboard.writeText(text).then(done).catch(done);
    } else {
      done();
    }
  }
}
