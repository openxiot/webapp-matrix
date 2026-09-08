import {Component, Input, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {NzInputNumberModule} from 'ng-zorro-antd/input-number';
import {Property} from '@openxiot/xiot-core-spec-ts';
import {NzSpaceModule} from 'ng-zorro-antd/space';

@Component({
    selector: 'action-out-int8-value',
    templateUrl: './action.out.int8.value.component.html',
    styleUrls: ['./action.out.int8.value.component.less'],
    imports: [
        ReactiveFormsModule,
        NzInputNumberModule,
        FormsModule,
        NzSpaceModule,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class ActionOutInt8ValueComponent {

  @Input() property: Property | undefined;

  @Input() values: any[] = [];
}
