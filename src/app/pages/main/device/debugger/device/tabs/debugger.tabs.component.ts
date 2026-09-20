import {Component, Input, inject, ChangeDetectionStrategy} from '@angular/core';
import {DeviceInstance, ServiceController} from "@openxiot/xiot-core-spec-ts";
import {MainI18nService} from '@app/service/i18n.service';
import {NzMenuModule} from 'ng-zorro-antd/menu';
import {NzLayoutModule} from 'ng-zorro-antd/layout';
import {NzListModule} from 'ng-zorro-antd/list';
import {NzTagComponent} from 'ng-zorro-antd/tag';
import {ActionsControllerComponent} from '../common/tables/actions/actions.component';
import {EventsControllerComponent} from '../common/tables/events/events.component';
import {PropertiesControllerComponent} from '../common/tables/properties/properties.component';
import {NzCardModule} from 'ng-zorro-antd/card';
import {NzTabsModule} from 'ng-zorro-antd/tabs';

@Component({
    selector: 'debugger-tabs',
    templateUrl: './debugger.tabs.component.html',
    styleUrls: ['./debugger.tabs.component.less'],
    imports: [
        NzMenuModule,
        NzLayoutModule,
        NzListModule,
        NzTagComponent,
        NzCardModule,
        NzTabsModule,
        ActionsControllerComponent,
        EventsControllerComponent,
        PropertiesControllerComponent,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class DebuggerTabsComponent {

  @Input() did: string = '';

  @Input() device: DeviceInstance | undefined = undefined;

  @Input() style: number = 0;

  service!: ServiceController;

  protected readonly i18n = inject(MainI18nService);
}
