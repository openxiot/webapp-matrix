import {Component, EventEmitter, Input, Output, ChangeDetectionStrategy} from '@angular/core';
import {ReactiveFormsModule} from '@angular/forms';
import {DataFormat, Property, Service} from '@openxiot/xiot-core-spec-ts';
import {PropertyWriteListValueComponent} from './constraint/list/property.write.list.value.component';
import {PropertyWriteRangeValueComponent} from './constraint/range/property-write-range-value.component';
import {PropertyWriteInt8ValueComponent} from './free/number/int8/property.write.int8.value.component';
import {PropertyWriteInt16ValueComponent} from './free/number/int16/property.write.int16.value.component';
import {PropertyWriteInt32ValueComponent} from './free/number/int32/property.write.int32.value.component';
import {PropertyWriteUint8ValueComponent} from './free/number/uint8/property.write.uint8.value.component';
import {PropertyWriteUint16ValueComponent} from './free/number/uint16/property.write.uint16.value.component';
import {PropertyWriteFloatValueComponent} from './free/number/float/property.write.float.value.component';
import {PropertyWriteUint32ValueComponent} from './free/number/uint32/property.write.uint32.value.component';
import {PropertyWriteStringValueComponent} from './free/string/property.write.string.value.component';
import {PropertyWriteHexValueComponent} from './free/hex/property.write.hex.value.component';
import {PropertyWriteCombinationValueComponent} from './free/combination/property.write.combination.value.component';
import {PropertyWriteBooleanValueComponent} from './free/boolean/property.write.boolean.value.component';

@Component({
    selector: 'property-write-value',
    templateUrl: './property.write.value.component.html',
    styleUrls: ['./property.write.value.component.less'],
    imports: [
        ReactiveFormsModule,
        PropertyWriteListValueComponent,
        PropertyWriteRangeValueComponent,
        PropertyWriteInt8ValueComponent,
        PropertyWriteInt16ValueComponent,
        PropertyWriteInt32ValueComponent,
        PropertyWriteUint8ValueComponent,
        PropertyWriteUint16ValueComponent,
        PropertyWriteFloatValueComponent,
        PropertyWriteUint32ValueComponent,
        PropertyWriteStringValueComponent,
        PropertyWriteHexValueComponent,
        PropertyWriteCombinationValueComponent,
        PropertyWriteBooleanValueComponent,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class PropertyWriteValueComponent {

  @Input() service: Service | undefined;

  @Input() property: Property | undefined;

  @Output() valueChange = new EventEmitter<any>();

  constructor(
  ) {
  }

  onValueChanged(value: any): void {
    this.valueChange.emit(value);
  }

  protected readonly DataFormat = DataFormat;
}
