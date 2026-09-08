import {Component, EventEmitter, Input, Output, ChangeDetectionStrategy} from '@angular/core';
import {ReactiveFormsModule} from '@angular/forms';
import {Argument, DataFormat, Property, Service} from '@openxiot/xiot-core-spec-ts';
import {ActionInListValueComponent} from './constraint/list/action.in.list.value.component';
import {ActionInRangeValueComponent} from './constraint/range/action.in.range.value.component';
import {ActionInInt8ValueComponent} from './free/number/int8/action.in.int8.value.component';
import {ActionInInt16ValueComponent} from './free/number/int16/action.in.int16.value.component';
import {ActionInInt32ValueComponent} from './free/number/int32/action.in.int32.value.component';
import {ActionInUint8ValueComponent} from './free/number/uint8/action.in.uint8.value.component';
import {ActionInUint16ValueComponent} from './free/number/uint16/action.in.uint16.value.component';
import {ActionInFloatValueComponent} from './free/number/float/action.in.float.value.component';
import {ActionInUint32ValueComponent} from './free/number/uint32/action.in.uint32.value.component';
import {ActionInStringValueComponent} from './free/string/action.in.string.value.component';
import {ActionInHexValueComponent} from './free/hex/action.in.hex.value.component';
import {ActionInCombinationValueComponent} from './free/combination/action.in.combination.value.component';
import {ActionInBooleanValueComponent} from './free/boolean/action.in.boolean.value.component';
import {ActionInInt64ValueComponent} from './free/number/int64/action.in.int64.value.component';

@Component({
    selector: 'action-in-value',
    templateUrl: './action.in.value.component.html',
    styleUrls: ['./action.in.value.component.less'],
    imports: [
        ReactiveFormsModule,
        ActionInListValueComponent,
        ActionInRangeValueComponent,
        ActionInInt8ValueComponent,
        ActionInInt16ValueComponent,
        ActionInInt32ValueComponent,
        ActionInUint8ValueComponent,
        ActionInUint16ValueComponent,
        ActionInFloatValueComponent,
        ActionInUint32ValueComponent,
        ActionInStringValueComponent,
        ActionInHexValueComponent,
        ActionInCombinationValueComponent,
        ActionInBooleanValueComponent,
        ActionInInt64ValueComponent,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class ActionInValueComponent {

  @Input() service: Service | undefined;

  @Input() argument: Argument | undefined;

  @Output() valueChange = new EventEmitter<any>();

  constructor(
  ) {
  }

  get property(): Property | undefined {
    return this.service?.properties.get(this.argument?.piid || 0) || undefined;
  }

  onValueChange(value: any): void {
    // const operation = new ArgumentOperation(this.argument?.piid || 0, (value instanceof Array) ? value : [value]);
    // this.valueChange.emit(ArgumentOperationCodec.encode(operation));
    this.valueChange.emit(value);
  }

  protected readonly DataFormat = DataFormat;
}
