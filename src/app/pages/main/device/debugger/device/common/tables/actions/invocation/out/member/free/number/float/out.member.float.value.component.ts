import {Component, Input, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {NzInputNumberModule} from 'ng-zorro-antd/input-number';
import {Property} from '@openxiot/xiot-core-spec-ts';
import {NzSpaceModule} from 'ng-zorro-antd/space';

@Component({
    selector: 'out-member-float-value',
    templateUrl: './out.member.float.value.component.html',
    styleUrls: ['./out.member.float.value.component.less'],
    imports: [
        ReactiveFormsModule,
        NzInputNumberModule,
        FormsModule,
        NzSpaceModule,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class OutMemberFloatValueComponent {

  @Input() property: Property | undefined;

  @Input() value: any;
}
