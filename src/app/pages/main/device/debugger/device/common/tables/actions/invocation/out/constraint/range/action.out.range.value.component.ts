import {Component, Input, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {Property} from '@openxiot/xiot-core-spec-ts';
import {NzSliderModule} from 'ng-zorro-antd/slider';
import {NzSpaceModule} from 'ng-zorro-antd/space';

@Component({
    selector: 'action-out-range-value',
    templateUrl: './action.out.range.value.component.html',
    styleUrls: ['./action.out.range.value.component.less'],
    imports: [
        ReactiveFormsModule,
        FormsModule,
        NzSliderModule,
        NzSpaceModule
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class ActionOutRangeValueComponent {

  @Input() property: Property | undefined;

  @Input() values: any[] = [];
}
