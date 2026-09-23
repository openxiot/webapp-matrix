import { Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { TranslatePipe } from '@ngx-translate/core';
import { ModbusFunction } from '@app/typedef/define/modbus/ModbusService';
import { fcLabelKey, isWriteFc } from '../../../../modbus/command/point.options';
import {
  FramePart,
  RequestFrame,
  describeFunctionRequestFrame,
  previewFunctionRequestFrame,
} from '../../../../modbus/editor/request/request.frame';

/** 「请求帧」预览对话框数据：要预览的那个方法（详情页 / 编辑页的方法列表行）。 */
export interface ServiceFrameDialogData {
  func: ModbusFunction;
}

/**
 * 服务方法的**请求帧预览**对话框（十六进制 + 帧结构解析 + 复制）。
 *
 * v2 的服务定义里**不存帧**：`function.request` 是结构化的 `{slaveId, fc, start, quantity?/fields[]}`，
 * 真正的帧由后端在 invoke 时现组。这里展示的是**前端本地按同一套算式算出来的预览** ——
 * 组帧原语与点表「命令」预览共用（见 request.frame 的 buildRequestFrame / crc16，不另抄一份算式），
 * 逐字节对齐由单测钉住；实际下发的永远以后端为准，故对话框里写明这一行。
 *
 * 组不出帧（写方法的字段没有缺省值、定义不成立）时不给空帧，直接提示「命令数据不完整」。
 */
@Component({
  selector: 'service-frame-dialog',
  templateUrl: './service.frame.dialog.component.html',
  styleUrl: './service.frame.dialog.component.less',
  imports: [NzAlertModule, NzButtonModule, TranslatePipe, NgTemplateOutlet],
})
export class ServiceFrameDialogComponent {
  readonly #modal = inject(NzModalRef);
  protected readonly data: ServiceFrameDialogData = inject(NZ_MODAL_DATA);

  protected readonly fcLabelKey = fcLabelKey;
  protected readonly isWriteFc = isWriteFc;

  /** 本地预览结果：缺省值不全 / 定义不成立时 ok=false */
  private readonly preview = previewFunctionRequestFrame(this.data.func.request);

  /** 预览出来的请求帧；null = 组不出来（模板改提示文案） */
  protected readonly frame: RequestFrame | null = this.preview.ok ? this.preview.frame : null;

  /** 组不出帧时的提示文案 key（既有键「命令数据不完整，无法生成请求帧」） */
  protected readonly incompleteKey: string | null = this.preview.ok ? null : this.preview.messageKey;

  /** 帧结构解析（从站地址 / 功能码 / 地址 / 数量或数据区 / CRC16）：与点表预览是同一套字段 */
  protected readonly parts: FramePart[] = this.frame
    ? describeFunctionRequestFrame(this.data.func.request, this.frame)
    : [];

  /** 已复制；false 表示未复制（按钮文字 1.5 秒后复位） */
  protected readonly copied = signal(false);
  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  /** 复制帧的十六进制文本到剪贴板（不可用或失败时静默，仅按钮文字反馈） */
  protected copy(hex: string): void {
    if (!hex) {
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
      clipboard.writeText(hex).then(done).catch(done);
    } else {
      done();
    }
  }
}
