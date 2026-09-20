import {Component, Input, inject, ChangeDetectionStrategy} from '@angular/core';
import {NzMenuModule} from 'ng-zorro-antd/menu';
import {NzLayoutModule} from 'ng-zorro-antd/layout';
import {NzListModule} from 'ng-zorro-antd/list';
import {NzTagComponent} from 'ng-zorro-antd/tag';
import {TabsServiceComponent} from './tabs/tabs.service.component';
import {WaterfallServiceComponent} from './waterfall/waterfall.service.component';
import {DeviceInstance, Service, ServiceController} from '@openxiot/xiot-core-spec-ts';
import {MainI18nService} from '@app/service/i18n.service';
import {TranslatePipe} from '@ngx-translate/core';

@Component({
    selector: 'debugger-slider',
    templateUrl: './debugger.slider.component.html',
    styleUrls: ['./debugger.slider.component.less'],
    imports: [
        TranslatePipe,
        NzMenuModule,
        NzLayoutModule,
        NzListModule,
        NzTagComponent,
        TabsServiceComponent,
        WaterfallServiceComponent,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class DebuggerSliderComponent {

  @Input() did: string = '';

  @Input() device: DeviceInstance | undefined = undefined;

  @Input() style: number = 0;

  service!: Service;

  protected readonly i18n = inject(MainI18nService);

  onClickService(s: Service) {
    this.service = s;
  }
}
