import {Component, Input, ChangeDetectionStrategy} from '@angular/core';
import {ReactiveFormsModule} from '@angular/forms';
import {DataFormat, Property, Service} from '@openxiot/xiot-core-spec-ts';
import {PropertyReadListValueComponent} from './constraint/list/property.read.list.value.component';
import {PropertyReadRangeValueComponent} from './constraint/range/property-read-range-value.component';
import {PropertyReadInt8ValueComponent} from './free/number/int8/property.read.int8.value.component';
import {PropertyReadInt16ValueComponent} from './free/number/int16/property.read.int16.value.component';
import {PropertyReadInt32ValueComponent} from './free/number/int32/property.read.int32.value.component';
import {PropertyReadUint8ValueComponent} from './free/number/uint8/property.read.uint8.value.component';
import {PropertyReadUint16ValueComponent} from './free/number/uint16/property.read.uint16.value.component';
import {PropertyReadFloatValueComponent} from './free/number/float/property.read.float.value.component';
import {PropertyReadUint32ValueComponent} from './free/number/uint32/property.read.uint32.value.component';
import {PropertyReadStringValueComponent} from './free/string/property.read.string.value.component';
import {PropertyReadHexValueComponent} from './free/hex/property.read.hex.value.component';
import {PropertyReadCombinationValueComponent} from './free/combination/property.read.combination.value.component';
import {PropertyReadBooleanValueComponent} from './free/boolean/property.read.boolean.value.component';

@Component({
    selector: 'property-read-value',
    templateUrl: './property.read.value.component.html',
    styleUrls: ['./property.read.value.component.less'],
    imports: [
        ReactiveFormsModule,
        PropertyReadListValueComponent,
        PropertyReadRangeValueComponent,
        PropertyReadInt8ValueComponent,
        PropertyReadInt16ValueComponent,
        PropertyReadInt32ValueComponent,
        PropertyReadUint8ValueComponent,
        PropertyReadUint16ValueComponent,
        PropertyReadFloatValueComponent,
        PropertyReadUint32ValueComponent,
        PropertyReadStringValueComponent,
        PropertyReadHexValueComponent,
        PropertyReadCombinationValueComponent,
        PropertyReadBooleanValueComponent,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class PropertyReadValueComponent {

  @Input() service: Service | undefined;

  @Input() property: Property | undefined;

  @Input() value: any | undefined;

  constructor(
  ) {
  }

  protected readonly DataFormat = DataFormat;
}
