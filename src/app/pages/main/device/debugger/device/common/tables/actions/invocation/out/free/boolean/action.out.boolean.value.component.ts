import {Component, Input, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {Property} from '@openxiot/xiot-core-spec-ts';
import {NzSwitchModule} from 'ng-zorro-antd/switch';
import {NzSpaceModule} from 'ng-zorro-antd/space';

@Component({
    selector: 'action-out-boolean-value',
    templateUrl: './action.out.boolean.value.component.html',
    styleUrls: ['./action.out.boolean.value.component.less'],
    imports: [
        NzSwitchModule,
        ReactiveFormsModule,
        FormsModule,
        NzSpaceModule
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class ActionOutBooleanValueComponent {

  @Input() property: Property | undefined;

  @Input() values!: any;
}
