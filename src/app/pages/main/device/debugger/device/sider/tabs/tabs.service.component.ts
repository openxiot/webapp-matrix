import {Component, Input, ChangeDetectionStrategy} from '@angular/core';
import {Service} from '@openxiot/xiot-core-spec-ts';
import {NzMessageService} from 'ng-zorro-antd/message';
import {PropertiesControllerComponent} from '../../common/tables/properties/properties.component';
import {ActionsControllerComponent} from '../../common/tables/actions/actions.component';
import {EventsControllerComponent} from '../../common/tables/events/events.component';
import {NzTabsModule} from 'ng-zorro-antd/tabs';

@Component({
    selector: 'debugger-tabs-service',
    templateUrl: './tabs.service.component.html',
    styleUrls: ['./tabs.service.component.less'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        NzTabsModule,
        PropertiesControllerComponent,
        ActionsControllerComponent,
        EventsControllerComponent
    ]
})
export class TabsServiceComponent {

  @Input() did!: string;

  @Input() service!: Service;

  constructor(public msg: NzMessageService) {
  }
}
