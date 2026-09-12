import { Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ModbusCommand } from '../../../../../typedef/define/modbus/Modbus';
import { fcLabelKey, isWriteFc } from '../../command/point.options';
import {
  FramePart,
  RequestFrame,
  ResponseFrame,
  describeRequestFrame,
  describeResponseFrame,
} from './request.frame';

/** 「命令」预览对话框数据：所在行 + 已生成的请求帧与两条应答帧（由编辑器负责生成与校验）。 */
export interface RequestFrameDialogData {
  command: ModbusCommand;
  frame: RequestFrame;
  /** 正常应答帧（读=数据区示例值 / 写=回显或确认） */
  response: ResponseFrame;
  /** 异常应答帧（异常码与 CRC 待设备返回，帧内以 ?? 占位） */
  exception: ResponseFrame;
}

/** 对话框里三张帧的标识：请求帧 / 正常应答帧 / 异常应答帧 */
type FrameSection = 'request' | 'response' | 'exception';

/**
 * 请求帧 + 应答帧（十六进制）预览对话框。
 * 展示功能码动作对应的完整 Modbus RTU 请求帧与应答帧（含从站地址与 CRC16），各段可一键复制，
 * 并按字段给出帧结构解析；读应答的数据区为示例值（真实数据由设备返回），异常应答的异常码与 CRC
 * 待设备返回、以 ?? 占位。
 * 帧由 request.frame 的 buildRequestFrame / buildResponseFrame 在编辑器侧先生成
 * （数据不完整时提示不弹窗）。
 */
@Component({
  selector: 'modbus-request-frame-dialog',
  standalone: true,
  templateUrl: './request.frame.dialog.component.html',
  styleUrl: './request.frame.dialog.component.less',
  imports: [NzButtonModule, TranslatePipe, NgTemplateOutlet],
})
export class RequestFrameDialogComponent {
  readonly #modal = inject(NzModalRef);
  private readonly translate = inject(TranslateService);
  protected readonly data: RequestFrameDialogData = inject(NZ_MODAL_DATA);

  protected readonly fcLabelKey = fcLabelKey;
  protected readonly isWriteFc = isWriteFc;

  /** 请求帧的字段级解析（从站/功能码/地址/数量/数据区/CRC16）。 */
  protected readonly parts: FramePart[] = describeRequestFrame(this.data.command, this.data.frame);

  /** 正常应答帧的字段级解析（读=数据区、写=回显/确认）。 */
  protected readonly responseParts: FramePart[] = describeResponseFrame(
    this.data.command,
    this.data.response,
    (key) => this.translateKey(key),
  );

  /** 异常应答帧的字段级解析（功能码最高位置 1 + 异常码）。 */
  protected readonly exceptionParts: FramePart[] = describeResponseFrame(
    this.data.command,
    this.data.exception,
    (key) => this.translateKey(key),
  );

  /** 已复制的分段；null 表示未复制（按钮文字 1.5 秒后复位）。 */
  protected readonly copied = signal<FrameSection | null>(null);
  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  /** 复制某一段的十六进制文本到剪贴板（不可用或失败时静默，仅按钮文字反馈）。 */
  protected copy(hex: string, section: FrameSection): void {
    if (!hex) {
      return;
    }
    const done = () => {
      this.copied.set(section);
      if (this.copyTimer) {
        clearTimeout(this.copyTimer);
      }
      this.copyTimer = setTimeout(() => this.copied.set(null), 1500);
    };
    const clipboard = navigator.clipboard;
    if (clipboard?.writeText) {
      clipboard.writeText(hex).then(done).catch(done);
    } else {
      done();
    }
  }

  /** 解析结果里的组合文案（功能码 + 异常）要按当前语言拼装，交给 describeResponseFrame 当翻译函数用。 */
  private translateKey(key: string): string {
    return this.translate.instant(key);
  }
}
