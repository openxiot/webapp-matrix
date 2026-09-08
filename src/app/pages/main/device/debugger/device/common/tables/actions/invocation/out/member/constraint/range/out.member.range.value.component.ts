import {Component, Input, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {Property} from '@openxiot/xiot-core-spec-ts';
import {NzSliderModule} from 'ng-zorro-antd/slider';
import {NzSpaceModule} from 'ng-zorro-antd/space';

@Component({
    selector: 'out-member-range-value',
    templateUrl: './out.member.range.value.component.html',
    styleUrls: ['./out.member.range.value.component.less'],
    imports: [
        ReactiveFormsModule,
        FormsModule,
        NzSliderModule,
        NzSpaceModule
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class OutMemberRangeValueComponent {

  @Input() property: Property | undefined;

  @Input() value: any;
}
