import {Component, Input, ChangeDetectionStrategy} from '@angular/core';
import {Property} from '@openxiot/xiot-core-spec-ts';
import {NzSpaceModule} from 'ng-zorro-antd/space';

@Component({
    selector: 'action-out-string-value',
    templateUrl: './action.out.string.value.component.html',
    styleUrls: ['./action.out.string.value.component.less'],
    imports: [
        NzSpaceModule
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class ActionOutStringValueComponent {

  @Input() property: Property | undefined;

  @Input() values: any[] = [];
}
