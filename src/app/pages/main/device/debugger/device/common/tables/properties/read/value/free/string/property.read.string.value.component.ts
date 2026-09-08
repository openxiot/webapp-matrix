import {Component, Input, ChangeDetectionStrategy} from '@angular/core';
import {Property} from '@openxiot/xiot-core-spec-ts';
import { NzSpaceModule} from 'ng-zorro-antd/space';

@Component({
    selector: 'property-read-string-value',
    templateUrl: './property.read.string.value.component.html',
    styleUrls: ['./property.read.string.value.component.less'],
    imports: [
        NzSpaceModule
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class PropertyReadStringValueComponent {

  @Input() property: Property | undefined;

  @Input() value!: any;
}
