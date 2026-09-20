import {Component, Input, ChangeDetectionStrategy} from '@angular/core';
import {Service} from '@openxiot/xiot-core-spec-ts';
import {MainI18nService} from '@app/service/i18n.service';
import {NzMessageService} from 'ng-zorro-antd/message';
import {NzCardComponent} from "ng-zorro-antd/card";
import {NzTagComponent} from "ng-zorro-antd/tag";
import {PropertiesControllerComponent} from "../../common/tables/properties/properties.component";
import {ActionsControllerComponent} from '../../common/tables/actions/actions.component';
import {EventsControllerComponent} from '../../common/tables/events/events.component';
import {NzIconDirective} from 'ng-zorro-antd/icon';
import {NzDividerComponent} from 'ng-zorro-antd/divider';
import {TranslatePipe} from '@ngx-translate/core';

@Component({
    selector: 'debugger-service-controller',
    templateUrl: './service.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        TranslatePipe,
        NzCardComponent,
        NzTagComponent,
        PropertiesControllerComponent,
        ActionsControllerComponent,
        EventsControllerComponent,
        NzIconDirective,
        NzDividerComponent
    ]
})
export class ServiceControllerComponent {

  @Input() did!: string;

  @Input() service!: Service;

  expand: boolean = false;

  constructor(
    protected i18n: MainI18nService,
    public msg: NzMessageService,
  ) {
  }

  onExpandChanged() {
    this.expand = !this.expand;
  }
}
