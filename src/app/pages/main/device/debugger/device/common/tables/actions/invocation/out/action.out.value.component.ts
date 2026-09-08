import {Component, Input, ChangeDetectionStrategy} from '@angular/core';
import {ReactiveFormsModule} from '@angular/forms';
import {Argument, DataFormat, Property, Service} from '@openxiot/xiot-core-spec-ts';
import {ActionOutListValueComponent} from './constraint/list/action.out.list.value.component';
import {ActionOutRangeValueComponent} from './constraint/range/action.out.range.value.component';
import {ActionOutInt8ValueComponent} from './free/number/int8/action.out.int8.value.component';
import {ActionOutInt16ValueComponent} from './free/number/int16/action.out.int16.value.component';
import {ActionOutInt32ValueComponent} from './free/number/int32/action.out.int32.value.component';
import {ActionOutUint8ValueComponent} from './free/number/uint8/action.out.uint8.value.component';
import {ActionOutUint16ValueComponent} from './free/number/uint16/action.out.uint16.value.component';
import {ActionOutFloatValueComponent} from './free/number/float/action.out.float.value.component';
import {ActionOutUint32ValueComponent} from './free/number/uint32/action.out.uint32.value.component';
import {ActionOutStringValueComponent} from './free/string/action.out.string.value.component';
import {ActionOutHexValueComponent} from './free/hex/action.out.hex.value.component';
import {ActionOutCombinationValueComponent} from './free/combination/action.out.combination.value.component';
import {ActionOutBooleanValueComponent} from './free/boolean/action.out.boolean.value.component';
import {ActionOutInt64ValueComponent} from './free/number/int64/action.out.int64.value.component';

@Component({
    selector: 'action-out-value',
    templateUrl: './action.out.value.component.html',
    styleUrls: ['./action.out.value.component.less'],
    imports: [
        ReactiveFormsModule,
        ActionOutListValueComponent,
        ActionOutRangeValueComponent,
        ActionOutInt8ValueComponent,
        ActionOutInt16ValueComponent,
        ActionOutInt32ValueComponent,
        ActionOutUint8ValueComponent,
        ActionOutUint16ValueComponent,
        ActionOutFloatValueComponent,
        ActionOutUint32ValueComponent,
        ActionOutStringValueComponent,
        ActionOutHexValueComponent,
        ActionOutCombinationValueComponent,
        ActionOutBooleanValueComponent,
        ActionOutInt64ValueComponent,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class ActionOutValueComponent {

  @Input() service: Service | undefined;

  @Input() argument: Argument | undefined;

  @Input() values: any[] = [];

  constructor(
  ) {
  }

  get property(): Property | undefined {
    return this.service?.properties.get(this.argument?.piid || 0) || undefined;
  }

  protected readonly DataFormat = DataFormat;
}
