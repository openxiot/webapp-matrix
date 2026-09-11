import {Component, Input, inject, ChangeDetectionStrategy} from '@angular/core';
import {Property, Service} from '@openxiot/xiot-core-spec-ts';
import {MainI18nService} from '../../../../../../../../service/i18n.service';
import {NzTableComponent, NzTableModule} from "ng-zorro-antd/table";
import {NzTagModule} from 'ng-zorro-antd/tag';
import {NzTooltipDirective} from 'ng-zorro-antd/tooltip';
import {NzIconModule} from 'ng-zorro-antd/icon';
import {NzSpaceModule} from 'ng-zorro-antd/space';
import {TranslatePipe} from '@ngx-translate/core';

@Component({
    selector: 'debugger-events-controller',
    imports: [
        TranslatePipe,
        NzTableModule,
        NzTableComponent,
        NzTagModule,
        NzTooltipDirective,
        NzIconModule,
        NzSpaceModule,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    templateUrl: './events.component.html'
})
export class EventsControllerComponent {

  @Input() did!: string;

  @Input() service!: Service;

  protected readonly i18n = inject(MainI18nService);

  protected getProperty(iid: number): Property | undefined {
    return this.service.properties.get(iid);
  }
}
