import {Component, Input, ChangeDetectionStrategy} from '@angular/core';
import {Property} from '@openxiot/xiot-core-spec-ts';
import {formatHexValue} from '../../../../../hex-value';

@Component({
    selector: 'property-read-hex-value',
    templateUrl: './property.read.hex.value.component.html',
    styleUrls: ['./property.read.hex.value.component.less'],
    imports: [],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class PropertyReadHexValueComponent {

  @Input() property: Property | undefined;

  @Input() value: any;

  get text(): string {
    return formatHexValue(this.value);
  }
}
