import {Component, Input, ChangeDetectionStrategy} from '@angular/core';
import {NzMenuModule} from 'ng-zorro-antd/menu';
import {NzLayoutModule} from 'ng-zorro-antd/layout';
import {ServiceControllerComponent} from './service/service.component';
import {NzListModule} from 'ng-zorro-antd/list';
import {DeviceInstance} from "@openxiot/xiot-core-spec-ts";

@Component({
    selector: 'debugger-waterfall',
    templateUrl: './debugger.waterfall.component.html',
    styleUrls: ['./debugger.waterfall.component.less'],
    imports: [
        NzMenuModule,
        NzLayoutModule,
        NzListModule,
        ServiceControllerComponent,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class DebuggerWaterfallComponent {

  @Input() did: string = '';

  @Input() device: DeviceInstance | undefined = undefined;

  @Input() style: number = 0;
}
