import { Component, ElementRef, OnDestroy, OnInit, inject, input, signal, viewChild } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { SafePipe } from '@app/common/pipe/safe/SafePipe';

/**
 * 第三方设备控制页（自行开发、自行部署，宿主只负责嵌进来）。
 *
 * 用法：宿主（设备详情页）按 deviceType 从产品服务取控制页列表，挑**最新版本**带 web.url 的那个，
 * 完成 url 装饰（追加 server / spaceId / did / token 等宿主注入参数）后，通过 `@Input() url`
 * 传给本组件，本组件只负责把它塞进 iframe 展示。
 *
 * 与第三方页面约定两条 postMessage：
 * - `iframe-height`：上报内容高度。跨域下宿主读不到 iframe 内文档、量不了高度，
 *   只能靠它主动上报；宿主据此撑高 iframe，让内部滚动条消失、由宿主页面统管。
 * - `toast`：它要弹提示。iframe 是"内容全高"的，固定定位会落到用户视口外，
 *   所以交给宿主用 message 弹。
 *
 * 消息必须来自**这一个 iframe**：只比对 origin 的话，同源其它窗口也能改我们的布局。
 * 监听器用 window.addEventListener 挂、ngOnDestroy 摘（AGENTS：不用 @HostListener 装饰器）。
 */
@Component({
  selector: 'device-custom',
  standalone: true,
  templateUrl: './device.custom.component.html',
  styleUrl: './device.custom.component.less',
  imports: [SafePipe],
})
export class DeviceCustomComponent implements OnInit, OnDestroy {
  /** 第三方设备控制页 url（已由宿主装饰好 server/spaceId/did/token 参数）。 */
  readonly url = input.required<string>();

  /** iframe 高度：由第三方页面 postMessage 上报（跨域下宿主读不到它的文档，量不了） */
  readonly frameHeight = signal(600);

  /** 模板里的 iframe 引用，用来确认消息确实是它发来的 */
  private readonly frameRef = viewChild<ElementRef<HTMLIFrameElement>>('deviceFrame');

  private readonly msg = inject(NzMessageService);

  /** 确定的处理函数引用，好拿去 addEventListener / removeEventListener 同一份。 */
  private readonly onMessage = (e: MessageEvent) => this.handle(e);

  ngOnInit(): void {
    window.addEventListener('message', this.onMessage);
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.onMessage);
  }

  private handle(e: MessageEvent): void {
    const frame = this.frameRef()?.nativeElement;
    const origin = this.url() ? new URL(this.url()).origin : '';
    if (!frame || e.source !== frame.contentWindow || !origin || e.origin !== origin) {
      return;
    }
    if (e.data?.type === 'iframe-height') {
      const height = Number(e.data.height);
      if (Number.isFinite(height) && height > 0) {
        this.frameHeight.set(height);
      }
    } else if (e.data?.type === 'toast' && typeof e.data.message === 'string') {
      this.msg.info(e.data.message);
    }
  }
}