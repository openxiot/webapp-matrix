import {Component, Input, ChangeDetectionStrategy} from '@angular/core';
import {ReactiveFormsModule} from '@angular/forms';
import {Argument, DataFormat, Property, Service} from '@openxiot/xiot-core-spec-ts';
import {OutMemberListValueComponent} from './constraint/list/out.member.list.value.component';
import {OutMemberRangeValueComponent} from './constraint/range/out.member.range.value.component';
import {OutMemberInt8ValueComponent} from './free/number/int8/out.member.int8.value.component';
import {OutMemberInt16ValueComponent} from './free/number/int16/out.member.int16.value.component';
import {OutMemberInt32ValueComponent} from './free/number/int32/out.member.int32.value.component';
import {OutMemberUint8ValueComponent} from './free/number/uint8/out.member.uint8.value.component';
import {OutMemberUint16ValueComponent} from './free/number/uint16/out.member.uint16.value.component';
import {OutMemberFloatValueComponent} from './free/number/float/out.member.float.value.component';
import {OutMemberUint32ValueComponent} from './free/number/uint32/out.member.uint32.value.component';
import {OutMemberStringValueComponent} from './free/string/out.member.string.value.component';
import {OutMemberCombinationValueComponent} from './free/combination/out.member.combination.value.component';
import {OutMemberBooleanValueComponent} from './free/boolean/out.member.boolean.value.component';
import {OutMemberInt64ValueComponent} from './free/number/int64/out.member.int64.value.component';

@Component({
    selector: 'out-member-value',
    templateUrl: './out.member.value.component.html',
    styleUrls: ['./out.member.value.component.less'],
    imports: [
        ReactiveFormsModule,
        OutMemberListValueComponent,
        OutMemberRangeValueComponent,
        OutMemberInt8ValueComponent,
        OutMemberInt16ValueComponent,
        OutMemberInt32ValueComponent,
        OutMemberUint8ValueComponent,
        OutMemberUint16ValueComponent,
        OutMemberFloatValueComponent,
        OutMemberUint32ValueComponent,
        OutMemberStringValueComponent,
        OutMemberCombinationValueComponent,
        OutMemberBooleanValueComponent,
        OutMemberInt64ValueComponent,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class OutMemberValueComponent {

  @Input() service: Service | undefined;

  @Input() argument: Argument | undefined;

  @Input() value: any;

  constructor(
  ) {
  }

  get property(): Property | undefined {
    return this.service?.properties.get(this.argument?.piid || 0) || undefined;
  }

  protected readonly DataFormat = DataFormat;
}
