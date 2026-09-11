import { AfterViewInit, Component, ElementRef, inject, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Html5Qrcode } from 'html5-qrcode';

@Component({
  selector: 'app-qr-scanner',
  imports: [],
  template: '<div id="qr-scanner-region"></div>',
  styles: ['#qr-scanner-region { width: 100%; }'],
})
export class QrScanner implements AfterViewInit {
  scan = output<string>();
  error = output<string>();

  private codeReader: Html5Qrcode | null = null;

  private readonly translate = inject(TranslateService);

  constructor(private el: ElementRef) {}

  ngAfterViewInit() {
    this.start();
  }

  private async start() {
    const id = 'qr-scanner-region';
    this.codeReader = new Html5Qrcode(id);
    try {
      await this.codeReader.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (text) => {
          this.scan.emit(text);
          this.stop();
        },
        () => {},
      );
    } catch {
      this.error.emit(this.translate.instant('无法访问摄像头，请使用手动添加'));
    }
  }

  stop() {
    if (!this.codeReader) return;
    const reader = this.codeReader;
    this.codeReader = null;
    reader
      .stop()
      .catch(() => {})
      .finally(() => reader.clear());
  }

  ngOnDestroy() {
    this.stop();
  }
}
